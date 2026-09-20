const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const path = require('node:path');
const { mkdir, writeFile } = require('node:fs/promises');
const { createHash } = require('node:crypto');
const { spawn } = require('node:child_process');


const app = express();
app.use((req, res, next) => {
  console.log('REQUEST:', req.method, req.originalUrl);
  res.setHeader('X-Genshin-Server', 'ocr-upload');
  next();
});
const imageFolder = path.join(__dirname, 'ocr', 'Reader', 'images');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024, // 15 MB per image
    files: 1
  }
});

// Serve only frontend files, not the entire project.
const frontendFiles = [
  'index.html',
  'style.css',
  'script.js',
  'src/get_images.js', // Use your actual new frontend JS filename here.
  'data.json'
];

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

for (const filename of frontendFiles) {
  app.get(`/${filename}`, (req, res) => {
    res.sendFile(path.join(__dirname, filename));
  });
}

app.use('/Assets', express.static(path.join(__dirname, 'Assets')));

app.post('/api/images', upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image received.' });
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

      // Decode fully and save in a consistent format.
      png = await image.png().toBuffer();
    } catch {
      return res.status(400).json({
        error: 'The image could not be decoded.'
      });
    }

    await mkdir(imageFolder, { recursive: true });

    // Identical PNG output gets the same filename.
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

    res.status(201).json({ filename, duplicate: false });
  } catch (error) {
    next(error);
  }
});
let scanRunning = false;

app.post('/api/scan', (req, res) => {
  if (scanRunning) {
    return res.status(409).json({
      error: 'A scan is already running.'
    });
  }

  scanRunning = true;

  const reader = spawn(
    process.execPath,
    [path.join(__dirname, 'ocr', 'Reader', 'test.cjs')],
    { cwd: __dirname }
  );

  reader.stdout.on('data', chunk => {
    process.stdout.write(chunk);
  });

  reader.stderr.on('data', chunk => {
    process.stderr.write(chunk);
  });

  reader.on('error', error => {
    scanRunning = false;
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

    res.json({ message: 'Scan complete. Inventory updated.' });
  });
});
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({
      error: error.code === 'LIMIT_FILE_SIZE'
        ? 'Image exceeds the 15 MB limit.'
        : error.message
    });
  }

  console.error(error);
  res.status(500).json({ error: 'Could not save the image.' });
});

console.log('Starting server file:', __filename);
const server = app.listen(3001, '127.0.0.1', () => {
  console.log('Open http://127.0.0.1:3001');
});

server.on('error', error => {
    console.error('Server failed to start:', error);
});