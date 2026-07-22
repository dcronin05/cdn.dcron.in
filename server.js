const express = require('express');
const multer = require('multer');
const Minio = require('minio');
const path = require('path');
const fs = require('fs');

const app = express();
const port = 3000;

const minioClient = new Minio.Client({
  endPoint: 'minio',
  port: 9000,
  useSSL: false,
  accessKey: process.env.MINIO_ROOT_USER || 'admin',
  secretKey: process.env.MINIO_ROOT_PASSWORD
});

const bucketName = 'public';
const adminPassword = process.env.CDN_ADMIN_PASSWORD || 'fallback_secret';
const SHORTLINKS_FILE = '_shortlinks.json';

let shortlinks = {};     // shortCode -> fileName
let fileToShortcode = {}; // fileName -> shortCode

// Helper: Generate random 6-character shortcode
function generateShortCode() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Helper: Load shortlinks from MinIO S3 object
function loadShortlinks() {
  let data = '';
  minioClient.getObject(bucketName, SHORTLINKS_FILE, (err, stream) => {
    if (err) return console.log('No existing shortlinks file, starting fresh.');
    stream.on('data', chunk => data += chunk);
    stream.on('end', () => {
      try {
        shortlinks = JSON.parse(data);
        fileToShortcode = {};
        for (const [code, file] of Object.entries(shortlinks)) {
          fileToShortcode[file] = code;
        }
        console.log(`Loaded ${Object.keys(shortlinks).length} shortlinks from S3.`);
      } catch (e) {
        console.error('Error parsing shortlinks:', e);
      }
    });
  });
}

// Helper: Save shortlinks to MinIO S3 object
function SaveShortlinks() {
  const jsonStr = JSON.stringify(shortlinks, null, 2);
  minioClient.putObject(bucketName, SHORTLINKS_FILE, jsonStr, jsonStr.length, { 'Content-Type': 'application/json' }, err => {
    if (err) console.error('Error saving shortlinks to S3:', err);
  });
}

// Ensure bucket exists
minioClient.bucketExists(bucketName, function(err, exists) {
  if (err) {
    return console.log('Error checking bucket:', err);
  }
  if (!exists) {
    minioClient.makeBucket(bucketName, 'us-east-1', function(err) {
      if (err) return console.log('Error creating bucket:', err);
      console.log(`Bucket "${bucketName}" created successfully.`);
      
      const policy = {
        Version: "2012-10-17",
        Statement: [
          {
            Action: ["s3:GetObject"],
            Effect: "Allow",
            Principal: { AWS: ["*"] },
            Resource: [`arn:aws:s3:::${bucketName}/*`]
          }
        ]
      };
      minioClient.setBucketPolicy(bucketName, JSON.stringify(policy), err => {
        if (err) console.log('Error setting bucket policy:', err);
      });
      loadShortlinks();
    });
  } else {
    loadShortlinks();
  }
});

const upload = multer({ dest: 'uploads/' });

app.use(express.static('public'));
app.use(express.json());

// Middleware to check Admin Password
function requireAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader === `Bearer ${adminPassword}`) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized: Invalid password' });
    }
}

// Shortlink 302 Redirect Handler (e.g. GET /s/x7K9pQ -> 302 to https://cdn.dcron.in/windows.iso)
app.get('/s/:code', (req, res) => {
  const code = req.params.code;
  const fileName = shortlinks[code];
  if (fileName) {
    res.redirect(302, `https://cdn.dcron.in/${fileName}`);
  } else {
    res.status(404).send('Shortlink not found');
  }
});

// API: List files (PUBLIC) - includes shortCode and shortUrl for every file
app.get('/api/files', (req, res) => {
  const data = [];
  const stream = minioClient.listObjectsV2(bucketName, '', true);
  stream.on('data', function(obj) { 
    if (obj.name !== SHORTLINKS_FILE) {
      let code = fileToShortcode[obj.name];
      if (!code) {
        code = generateShortCode();
        shortlinks[code] = obj.name;
        fileToShortcode[obj.name] = code;
        SaveShortlinks();
      }
      obj.shortCode = code;
      obj.shortUrl = `https://dcron.in/s/${code}`;
      data.push(obj); 
    }
  });
  stream.on('error', function(err) { res.status(500).json({ error: err.message }); });
  stream.on('end', function() {
    res.json(data.sort((a,b) => b.lastModified - a.lastModified));
  });
});

// API: Upload file (PROTECTED)
app.post('/api/upload', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  
  const fileName = req.file.originalname;
  const filePath = req.file.path;
  
  // Assign shortcode
  let code = fileToShortcode[fileName];
  if (!code) {
    code = generateShortCode();
    shortlinks[code] = fileName;
    fileToShortcode[fileName] = code;
    SaveShortlinks();
  }

  minioClient.fPutObject(bucketName, fileName, filePath, { 'Content-Type': req.file.mimetype }, function(err, etag) {
    fs.unlink(filePath, (unlinkErr) => {
      if (unlinkErr) console.error("Failed to delete temp file:", unlinkErr);
    });

    if (err) return res.status(500).json({ error: err.message });
    const shortUrl = `https://dcron.in/s/${code}`;
    res.json({ success: true, fileName, shortCode: code, shortUrl });
  });
});

// API: Delete file (PROTECTED)
app.delete('/api/files/:filename', requireAuth, (req, res) => {
  const fileName = req.params.filename;
  
  // Remove shortlink mapping
  const code = fileToShortcode[fileName];
  if (code) {
    delete shortlinks[code];
    delete fileToShortcode[fileName];
    SaveShortlinks();
  }

  minioClient.removeObject(bucketName, fileName, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

const server = app.listen(port, () => {
  console.log(`Bespoke CDN UI listening on port ${port}`);
});
server.setTimeout(0);
