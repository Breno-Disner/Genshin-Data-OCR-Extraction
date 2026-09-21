const { readFile } = require('node:fs/promises');
const { createHash } = require('node:crypto');
const path = require('node:path');

// Bump this version when OCR parsing changes require fresh readings.
const CACHE_VERSION = 1;

async function scanScreenshots(folder, files, cache, readArtifact) {
  const entries = cache?.version === CACHE_VERSION ? cache.entries || {} : {};
  const batch = [];
  let reused = 0;
  for (const filename of files) {
    try {
      const image = await readFile(path.join(folder, filename));
      const hash = createHash('sha256').update(image).digest('hex');
      const cached = Object.hasOwn(entries, hash) ? entries[hash] : null;
      const artifact = cached || await readArtifact(image);
      if (cached) reused++;
      batch.push({ filename, hash, artifact });
    } catch (error) {
      batch.push({ filename, error: error.message ?? String(error) });
    }
  }
  return { batch, reused };
}

module.exports = { CACHE_VERSION, scanScreenshots };
