const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const path = require('node:path');
const { mkdir, writeFile } = require('node:fs/promises');
const { createHash } = require('node:crypto');
const { spawn } = require('node:child_process');

const { removeArtifact } = require('./ocr/Writer/removals.cjs');
const { normalize } = require('./public/src/inventory.js');
const app = express();
app.use(express.json({ limit: '32kb' }));

const publicFolder = path.join(__dirname, 'public');
const imageFolder = path.join(__dirname, 'ocr', 'Reader', 'images');
const readerFile = path.join(__dirname, 'ocr', 'Reader', 'test.cjs');

let scanRunning = false;
// Shared lock: removal and OCR must not overwrite each other’s inventory changes.
let removalRunning = false;

// Request logging.
app.use((req, res, next) => {
  console.log('REQUEST:', req.method, req.originalUrl);
  res.setHeader('X-Genshin-Server', 'ocr-upload');
  next();
});

// Serves index.html, CSS, browser JS, Assets, and data.json.
app.use(express.static(publicFolder));

// Serve the shared Assets folder.
app.use('/Assets', express.static(path.join(__dirname, 'Assets')));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024,
    files: 1
  }
});

// Validate and save an uploaded screenshot.
app.post('/api/images', upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No image received.'
      });
    }

    let png;

    try {
      const image = sharp(req.file.buffer, {
        limitInputPixels: 20_000_000
      });

      const metadata = await image.metadata();

      if (!['png', 'jpeg', 'webp'].includes(metadata.format)) {
        return res.status(400).json({
          error: 'Use PNG, JPEG, or WebP images.'
        });
      }

      if ((metadata.pages ?? 1) !== 1) {
        return res.status(400).json({
          error: 'Animated images are not supported.'
        });
      }

      if (metadata.width !== 1920 || metadata.height !== 1080) {
        return res.status(400).json({
          error: `Expected 1920 × 1080; received ${metadata.width} × ${metadata.height}.`
        });
      }

      png = await image.png().toBuffer();
    } catch {
      return res.status(400).json({
        error: 'The image could not be decoded.'
      });
    }

    await mkdir(imageFolder, { recursive: true });

    const hash = createHash('sha256').update(png).digest('hex');
    const filename = `${hash}.png`;

    try {
      await writeFile(path.join(imageFolder, filename), png, {
        flag: 'wx'
      });
    } catch (error) {
      if (error.code === 'EEXIST') {
        return res.json({ filename, duplicate: true });
      }

      throw error;
    }

    return res.status(201).json({
      filename,
      duplicate: false
    });
  } catch (error) {
    next(error);
  }
});

// Only this endpoint changes removal state; GET requests never mutate inventory.
app.delete('/api/artifacts', async (req, res, next) => {
  if (scanRunning || removalRunning) {
    return res.status(409).json({ error: 'An inventory update is running. Wait for it to finish.' });
  }
  removalRunning = true;
  try {
    await removeArtifact(path.join(publicFolder, 'data.json'), req.body?.id, req.body?.expected, normalize);
    return res.json({ message: 'Artifact removed.' });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    next(error);
  } finally {
    removalRunning = false;
  }
});

// Run the OCR reader.
app.post('/api/scan', (req, res) => {
  if (scanRunning || removalRunning) {
    return res.status(409).json({
      error: 'An inventory update is already running.'
    });
  }

  scanRunning = true;

  const reader = spawn(
    process.execPath,
    [readerFile],
    { cwd: __dirname }
  );

  reader.stdout.on('data', chunk => {
    process.stdout.write(chunk);
  });

  reader.stderr.on('data', chunk => {
    process.stderr.write(chunk);
  });

  reader.on('error', error => {
    console.error(error);

    if (!res.headersSent) {
      res.status(500).json({
        error: 'Could not start the OCR reader.'
      });
    }
  });

  reader.on('close', code => {
    scanRunning = false;

    if (res.headersSent) return;

    if (code !== 0) {
      return res.status(500).json({
        error: 'Scan failed. Check the server terminal for details.'
      });
    }

    return res.json({
      message: 'Scan complete. Inventory updated.'
    });
  });
});

// Error handling goes after the routes.
app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  if (error instanceof multer.MulterError) {
    return res.status(400).json({
      error: error.code === 'LIMIT_FILE_SIZE'
        ? 'Image exceeds the 15 MB limit.'
        : error.message
    });
  }

  console.error(error);

  return res.status(500).json({
    error: 'The server could not complete the request.'
  });
});

console.log('Starting server file:', __filename);

const server = app.listen(3001, '127.0.0.1', () => {
  console.log('Open http://127.0.0.1:3001');
});

server.on('error', error => {
  console.error('Server failed to start:', error);
});