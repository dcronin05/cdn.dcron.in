/**
 * dcron.in Asset Server & CDN (Backend)
 * 
 * Express.js server providing a unified Asset Manager, Web UI, and Shortlink Generator.
 * Supports a Pluggable Storage Driver architecture:
 *   - 's3': Interacts with MinIO / S3 bucket (default on dcron.in cloud stack).
 *   - 'filesystem': Interacts with a local mounted directory (default on nexus / homelab).
 */
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

// Configuration
const adminPassword = process.env.CDN_ADMIN_PASSWORD || 'fallback_secret';
const SHORTLINKS_FILE = '_shortlinks.json';
const UPLOADS_TEMP_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(UPLOADS_TEMP_DIR)) {
  fs.mkdirSync(UPLOADS_TEMP_DIR, { recursive: true });
}

// Storage Driver Selection
const STORAGE_DRIVER = process.env.STORAGE_DRIVER || (process.env.MINIO_ROOT_USER ? 's3' : 'filesystem');
const STORAGE_DIR = path.resolve(process.env.STORAGE_DIR || process.env.STORAGE_PATH || path.join(__dirname, 'storage'));
const bucketName = process.env.MINIO_BUCKET || 'public';

console.log(`[Storage] Active driver: ${STORAGE_DRIVER}`);
if (STORAGE_DRIVER === 'filesystem') {
  console.log(`[Storage] Local storage path: ${STORAGE_DIR}`);
}

let shortlinks = {};     // shortCode -> relativeFilePath
let fileToShortcode = {}; // relativeFilePath -> shortCode

/**
 * Helper: Generate random 6-character shortcode (e.g., dcron.in/s/XXXXXX).
 */
function generateShortCode() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Storage Driver Interface & Implementations
 */
let storage = null;

if (STORAGE_DRIVER === 's3') {
  const Minio = require('minio');
  const minioClient = new Minio.Client({
    endPoint: process.env.MINIO_ENDPOINT || 'minio',
    port: parseInt(process.env.MINIO_PORT || '9000', 10),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ROOT_USER || 'admin',
    secretKey: process.env.MINIO_ROOT_PASSWORD
  });

  storage = {
    init: function(callback) {
      minioClient.bucketExists(bucketName, (err, exists) => {
        if (err) return callback(err);
        if (!exists) {
          minioClient.makeBucket(bucketName, 'us-east-1', (err) => {
            if (err) return callback(err);
            const policy = {
              Version: "2012-10-17",
              Statement: [{
                Action: ["s3:GetObject"],
                Effect: "Allow",
                Principal: { AWS: ["*"] },
                Resource: [`arn:aws:s3:::${bucketName}/*`]
              }]
            };
            minioClient.setBucketPolicy(bucketName, JSON.stringify(policy), callback);
          });
        } else {
          callback(null);
        }
      });
    },

    loadShortlinks: function(callback) {
      let data = '';
      minioClient.getObject(bucketName, SHORTLINKS_FILE, (err, stream) => {
        if (err) return callback(null, {});
        stream.on('data', chunk => data += chunk);
        stream.on('end', () => {
          try {
            callback(null, JSON.parse(data));
          } catch (e) {
            callback(null, {});
          }
        });
        stream.on('error', () => callback(null, {}));
      });
    },

    saveShortlinks: function(data, callback) {
      const jsonStr = JSON.stringify(data, null, 2);
      minioClient.putObject(bucketName, SHORTLINKS_FILE, jsonStr, jsonStr.length, { 'Content-Type': 'application/json' }, callback);
    },

    listFiles: function(callback) {
      const data = [];
      const stream = minioClient.listObjectsV2(bucketName, '', true);
      stream.on('data', obj => {
        if (obj.name !== SHORTLINKS_FILE && !obj.name.startsWith('.')) {
          data.push({
            name: obj.name,
            size: obj.size,
            lastModified: obj.lastModified
          });
        }
      });
      stream.on('error', err => callback(err));
      stream.on('end', () => callback(null, data));
    },

    saveFile: function(tempFilePath, targetPath, mimeType, callback) {
      minioClient.fPutObject(bucketName, targetPath, tempFilePath, { 'Content-Type': mimeType }, callback);
    },

    deleteFile: function(targetPath, callback) {
      minioClient.removeObject(bucketName, targetPath, callback);
    }
  };
} else {
  // Local Filesystem Driver
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }

  const shortlinksPath = path.join(STORAGE_DIR, SHORTLINKS_FILE);

  function walkDir(dir, baseDir, fileList = []) {
    if (!fs.existsSync(dir)) return fileList;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === SHORTLINKS_FILE || entry.name.startsWith('.') || entry.name === 'uploads') {
        continue;
      }
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath, baseDir, fileList);
      } else if (entry.isFile()) {
        const stat = fs.statSync(fullPath);
        const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
        fileList.push({
          name: relPath,
          size: stat.size,
          lastModified: stat.mtime
        });
      }
    }
    return fileList;
  }

  storage = {
    init: function(callback) {
      if (!fs.existsSync(STORAGE_DIR)) {
        fs.mkdirSync(STORAGE_DIR, { recursive: true });
      }
      callback(null);
    },

    loadShortlinks: function(callback) {
      if (!fs.existsSync(shortlinksPath)) {
        return callback(null, {});
      }
      try {
        const raw = fs.readFileSync(shortlinksPath, 'utf8');
        callback(null, JSON.parse(raw));
      } catch (err) {
        callback(null, {});
      }
    },

    saveShortlinks: function(data, callback) {
      try {
        fs.writeFileSync(shortlinksPath, JSON.stringify(data, null, 2), 'utf8');
        callback(null);
      } catch (err) {
        callback(err);
      }
    },

    listFiles: function(callback) {
      try {
        const files = walkDir(STORAGE_DIR, STORAGE_DIR);
        callback(null, files);
      } catch (err) {
        callback(err);
      }
    },

    saveFile: function(tempFilePath, targetPath, mimeType, callback) {
      try {
        const dest = path.resolve(STORAGE_DIR, targetPath);
        // Security check: ensure target is strictly inside STORAGE_DIR
        if (!dest.startsWith(STORAGE_DIR)) {
          return callback(new Error('Invalid file destination path'));
        }
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(tempFilePath, dest);
        callback(null);
      } catch (err) {
        callback(err);
      }
    },

    deleteFile: function(targetPath, callback) {
      try {
        const target = path.resolve(STORAGE_DIR, targetPath);
        if (!target.startsWith(STORAGE_DIR)) {
          return callback(new Error('Invalid file path'));
        }
        if (fs.existsSync(target)) {
          fs.unlinkSync(target);
        }
        callback(null);
      } catch (err) {
        callback(err);
      }
    }
  };
}

// Initialize Shortlinks
function syncShortlinks() {
  storage.loadShortlinks((err, loaded) => {
    if (err) return console.error('Failed to load shortlinks:', err);
    shortlinks = loaded || {};
    fileToShortcode = {};
    for (const [code, file] of Object.entries(shortlinks)) {
      fileToShortcode[file] = code;
    }
    console.log(`Loaded ${Object.keys(shortlinks).length} shortlinks from storage.`);
  });
}

function persistShortlinks() {
  storage.saveShortlinks(shortlinks, (err) => {
    if (err) console.error('Error saving shortlinks:', err);
  });
}

storage.init((err) => {
  if (err) {
    console.error('Storage initialization failed:', err);
  } else {
    console.log('Storage initialized successfully.');
    syncShortlinks();
  }
});

const upload = multer({ dest: UPLOADS_TEMP_DIR });

app.use(express.static('public'));
app.use(express.json());

/**
 * Authentication Middleware
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = req.query.token;
  if ((authHeader && authHeader === `Bearer ${adminPassword}`) || (token && token === adminPassword)) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized: Invalid password' });
  }
}

// Shortlink 302 Redirect Handler (e.g. GET /s/x7K9pQ -> 302 to /path/to/file)
app.get('/s/:code', (req, res) => {
  const code = req.params.code;
  const fileName = shortlinks[code];
  if (fileName) {
    res.redirect(302, `/${fileName}`);
  } else {
    res.status(404).send('Shortlink not found');
  }
});

// API: List files (PUBLIC)
app.get('/api/files', (req, res) => {
  storage.listFiles((err, files) => {
    if (err) return res.status(500).json({ error: err.message });

    let updatedShortlinks = false;
    const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
    const host = req.get('host') || 'cdn.dcron.in';

    const enriched = files.map(file => {
      let code = fileToShortcode[file.name];
      if (!code) {
        code = generateShortCode();
        shortlinks[code] = file.name;
        fileToShortcode[file.name] = code;
        updatedShortlinks = true;
      }
      return {
        name: file.name,
        size: file.size,
        lastModified: file.lastModified,
        shortCode: code,
        shortUrl: `${proto}://${host}/s/${code}`,
        url: `${proto}://${host}/${file.name}`
      };
    });

    if (updatedShortlinks) {
      persistShortlinks();
    }

    res.json(enriched.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified)));
  });
});

// API: Upload file (PROTECTED)
app.post('/api/upload', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

  const originalName = req.file.originalname;
  const tempPath = req.file.path;
  
  // Folder / Subdirectory support
  let folder = (req.body.folder || req.query.folder || '').trim().replace(/^[/\\]+/, '').replace(/[/\\]+$/, '');
  // Sanitize folder path
  folder = folder.replace(/\.\./g, '');
  const targetRelativePath = folder ? `${folder}/${originalName}` : originalName;

  // Assign shortcode
  let code = fileToShortcode[targetRelativePath];
  if (!code) {
    code = generateShortCode();
    shortlinks[code] = targetRelativePath;
    fileToShortcode[targetRelativePath] = code;
    persistShortlinks();
  }

  storage.saveFile(tempPath, targetRelativePath, req.file.mimetype, (err) => {
    fs.unlink(tempPath, (unlinkErr) => {
      if (unlinkErr) console.error("Failed to delete temp file:", unlinkErr);
    });

    if (err) return res.status(500).json({ error: err.message });

    const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
    const host = req.get('host') || 'cdn.dcron.in';
    const shortUrl = `${proto}://${host}/s/${code}`;
    const directUrl = `${proto}://${host}/${targetRelativePath}`;

    res.json({
      success: true,
      fileName: targetRelativePath,
      shortCode: code,
      shortUrl: shortUrl,
      directUrl: directUrl
    });
  });
});

// API: Delete file (PROTECTED)
app.delete('/api/files/*', requireAuth, (req, res) => {
  const targetRelativePath = req.params[0];
  if (!targetRelativePath) return res.status(400).json({ error: 'Missing filename' });

  // Remove shortlink mapping
  const code = fileToShortcode[targetRelativePath];
  if (code) {
    delete shortlinks[code];
    delete fileToShortcode[targetRelativePath];
    persistShortlinks();
  }

  storage.deleteFile(targetRelativePath, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// Direct Static File Serving (for Filesystem Driver)
if (STORAGE_DRIVER === 'filesystem') {
  app.use(express.static(STORAGE_DIR, { maxAge: '30d', dotfiles: 'ignore' }));
}

const server = app.listen(port, () => {
  console.log(`Asset Server listening on port ${port} (Driver: ${STORAGE_DRIVER})`);
});
server.setTimeout(0);
