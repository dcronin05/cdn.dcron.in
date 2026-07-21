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

const bucketName = 'cdn';
const adminPassword = process.env.CDN_ADMIN_PASSWORD || 'fallback_secret';

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
    });
  }
});

// Hardened: Buffer files to disk instead of RAM to prevent OOM DOS attacks
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

// API: List files (PUBLIC)
app.get('/api/files', (req, res) => {
  const data = [];
  const stream = minioClient.listObjectsV2(bucketName, '', true);
  stream.on('data', function(obj) { data.push(obj); });
  stream.on('error', function(err) { res.status(500).json({ error: err.message }); });
  stream.on('end', function() {
    res.json(data.sort((a,b) => b.lastModified - a.lastModified));
  });
});

// API: Upload file (PROTECTED)
app.post('/api/upload', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  
  let fileName = req.file.originalname;
  const folder = req.body.folder || req.body.path || req.body.prefix || '';
  if (folder) {
    const cleanFolder = folder.replace(/^\/+|\/+$/g, ''); // strip leading/trailing slashes
    if (cleanFolder) {
      fileName = `${cleanFolder}/${fileName}`;
    }
  }
  const filePath = req.file.path;
  
  // Hardened: Use fPutObject to stream from disk directly to MinIO, bypassing Node heap
  minioClient.fPutObject(bucketName, fileName, filePath, { 'Content-Type': req.file.mimetype }, function(err, etag) {
    // Delete the temp file from disk immediately after uploading
    fs.unlink(filePath, (unlinkErr) => {
      if (unlinkErr) console.error("Failed to delete temp file:", unlinkErr);
    });

    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, fileName });
  });
});

// API: Delete file (PROTECTED)
app.delete('/api/files/:filename', requireAuth, (req, res) => {
  const fileName = req.params.filename;
  minioClient.removeObject(bucketName, fileName, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

const server = app.listen(port, () => {
  console.log(`Bespoke CDN UI listening on port ${port}`);
});
server.setTimeout(0); // Disable request timeout for multi-GB uploads
