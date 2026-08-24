const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;
const adminPassword = process.env.CDN_ADMIN_PASSWORD || 'fallback_secret';

const PUBLIC_URL = (process.env.PUBLIC_URL || process.env.CDN_URL || '').replace(/\/+$/, '');
const SHORTLINK_BASE_URL = (process.env.SHORTLINK_BASE_URL || '').replace(/\/+$/, '');

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
 * Helper: Generate random 6-character shortcode.
 */
function generateShortCode() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function encodePath(filePath) {
  return filePath
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/');
}

function getPublicUrl(req, filePath) {
  const safePath = encodePath(filePath);
  if (PUBLIC_URL) {
    return `${PUBLIC_URL}/${safePath}`;
  }
  return `https://cdn.dcron.in/${safePath}`;
}

function getShortUrl(req, code) {
  if (SHORTLINK_BASE_URL) {
    return `${SHORTLINK_BASE_URL}/s/${code}`;
  }
  return `https://dcron.in/s/${code}`;
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
      minioClient.getObject(bucketName, '_shortlinks.json', (err, dataStream) => {
        if (err) return callback(null, {}); // treat missing file as empty
        dataStream.on('data', (chunk) => data += chunk);
        dataStream.on('end', () => {
          try {
            callback(null, JSON.parse(data));
          } catch (e) {
            callback(null, {});
          }
        });
        dataStream.on('error', () => callback(null, {}));
      });
    },

    saveShortlinks: function(map, callback) {
      const buffer = Buffer.from(JSON.stringify(map, null, 2));
      minioClient.putObject(bucketName, '_shortlinks.json', buffer, buffer.length, {
        'Content-Type': 'application/json'
      }, callback);
    },

    listFiles: function(callback) {
      const stream = minioClient.listObjects(bucketName, '', true);
      const files = [];
      stream.on('data', (obj) => {
        if (obj.name && obj.name !== '_shortlinks.json') {
          files.push({
            name: obj.name,
            size: obj.size,
            lastModified: obj.lastModified
          });
        }
      });
      stream.on('error', (err) => callback(err));
      stream.on('end', () => callback(null, files));
    },

    saveFile: function(localTempPath, targetRelativePath, mimetype, callback) {
      const metaData = { 'Content-Type': mimetype || 'application/octet-stream' };
      minioClient.fPutObject(bucketName, targetRelativePath, localTempPath, metaData, callback);
    },

    deleteFile: function(targetRelativePath, callback) {
      minioClient.removeObject(bucketName, targetRelativePath, callback);
    }
  };

} else {
  // Native Local Filesystem Driver
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }

  const shortlinksFilePath = path.join(STORAGE_DIR, '_shortlinks.json');

  function walkDir(currentDir, baseDir, fileList) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === '_shortlinks.json') continue;
      const fullPath = path.join(currentDir, entry.name);
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
  }

  storage = {
    init: function(callback) {
      if (!fs.existsSync(STORAGE_DIR)) {
        fs.mkdirSync(STORAGE_DIR, { recursive: true });
      }
      callback(null);
    },

    loadShortlinks: function(callback) {
      if (!fs.existsSync(shortlinksFilePath)) {
        return callback(null, {});
      }
      fs.readFile(shortlinksFilePath, 'utf8', (err, data) => {
        if (err) return callback(null, {});
        try {
          callback(null, JSON.parse(data));
        } catch (e) {
          callback(null, {});
        }
      });
    },

    saveShortlinks: function(map, callback) {
      fs.writeFile(shortlinksFilePath, JSON.stringify(map, null, 2), 'utf8', callback);
    },

    listFiles: function(callback) {
      try {
        const files = [];
        walkDir(STORAGE_DIR, STORAGE_DIR, files);
        callback(null, files);
      } catch (err) {
        callback(err);
      }
    },

    saveFile: function(localTempPath, targetRelativePath, mimetype, callback) {
      const destPath = path.resolve(STORAGE_DIR, targetRelativePath);
      // Ensure target stays within STORAGE_DIR
      if (!destPath.startsWith(STORAGE_DIR)) {
        return callback(new Error('Invalid destination path traversal.'));
      }
      const destDir = path.dirname(destPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      fs.copyFile(localTempPath, destPath, callback);
    },

    deleteFile: function(targetRelativePath, callback) {
      const targetPath = path.resolve(STORAGE_DIR, targetRelativePath);
      if (!targetPath.startsWith(STORAGE_DIR)) {
        return callback(new Error('Invalid target path traversal.'));
      }
      if (fs.existsSync(targetPath)) {
        fs.unlink(targetPath, callback);
      } else {
        callback(null);
      }
    }
  };
}

/**
 * Sync Shortlinks helper
 */
function syncShortlinks() {
  storage.loadShortlinks((err, map) => {
    if (!err && map) {
      shortlinks = map;
      fileToShortcode = {};
      for (const [code, file] of Object.entries(shortlinks)) {
        fileToShortcode[file] = code;
      }
      console.log(`Loaded ${Object.keys(shortlinks).length} shortlinks from storage.`);
    }
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

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

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

// API: Public Config (Branding, Titles, Nav Configuration)
app.get('/api/config', (req, res) => {
  res.json({
    brandName: process.env.BRAND_NAME || 'dcron.in',
    brandSub: process.env.BRAND_SUB || 'cdn',
    brandTitle: process.env.BRAND_TITLE || 'Asset Manager & Drop Zone',
    brandSubtitle: process.env.BRAND_SUBTITLE || 'Public Object Storage & Asset CDN',
    showNavLinks: process.env.SHOW_NAV_LINKS !== 'false',
    shortlinkBaseUrl: SHORTLINK_BASE_URL
  });
});

// API: Auth Verification Endpoint
app.post('/api/auth/verify', requireAuth, (req, res) => {
  res.json({ ok: true });
});

// Shortlink 302 Redirect Handler (e.g. GET /s/x7K9pQ -> 302 to /path/to/file)
app.get('/s/:code', (req, res) => {
  const code = req.params.code;
  const fileName = shortlinks[code];
  if (fileName) {
    const directUrl = getPublicUrl(req, fileName);
    res.redirect(302, directUrl);
  } else {
    res.status(404).send('Shortlink not found');
  }
});

// API: List files (PUBLIC)
app.get('/api/files', (req, res) => {
  storage.listFiles((err, files) => {
    if (err) return res.status(500).json({ error: err.message });

    let updatedShortlinks = false;

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
        shortUrl: getShortUrl(req, code),
        url: getPublicUrl(req, file.name)
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

    const shortUrl = getShortUrl(req, code);
    const directUrl = getPublicUrl(req, targetRelativePath);

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
