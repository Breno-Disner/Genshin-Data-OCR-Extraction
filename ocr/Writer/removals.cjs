// Shared by the HTTP removal endpoint and OCR writer. A signature identifies
// the artifact's stats, independent of the numeric ID assigned by each scan.
const { createHash, randomUUID } = require('node:crypto');
const { readFile, writeFile, rename, unlink } = require('node:fs/promises');

function signature(rarity, set, artifact) {
  const sorted = object => Object.entries(object || {}).sort(([a], [b]) => a.localeCompare(b));
  return createHash('sha256').update(JSON.stringify([
    rarity, set, artifact.slot, artifact.level,
    sorted(artifact.mainstat), sorted(artifact.substats)
  ])).digest('hex');
}

// Write to a sibling file first. A failed write leaves the old inventory intact;
// rename replaces it only once the complete JSON has been written.
async function saveAtomically(filename, inventory) {
  const temporary = `${filename}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(inventory, null, 2) + '\n', 'utf8');
    await rename(temporary, filename);
  } finally {
    await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}

function failure(status, message) {
  return Object.assign(new Error(message), { status });
}

async function removeArtifact(filename, id, expected, normalize) {
  if (typeof id !== 'string' || id.split('/').length !== 3 || !expected) {
    throw failure(400, 'Choose an artifact to remove.');
  }
  const inventory = JSON.parse(await readFile(filename, 'utf8'));
  const current = normalize(inventory).find(artifact => artifact.id === id);
  if (!current) throw failure(404, 'This artifact is no longer in the collection. Refresh and try again.');

  // IDs are reassigned by OCR. Never delete an item from a stale browser tab
  // if that ID now points to a different artifact after another scan.
  const fields = a => [a.id, a.setKey, a.slot, a.level, a.rarity, a.main, a.value, a.stats];
  if (JSON.stringify(fields(current)) !== JSON.stringify(fields(expected))) {
    throw failure(409, 'This artifact changed. Refresh the collection before removing it.');
  }
  const [rarity, set, key] = id.split('/');
  const artifact = inventory[rarity][set][key];
  const hash = signature(rarity, set, artifact);
  const removals = inventory._removedArtifacts || {};
  // Store a count, not a boolean: removing one of two identical artifacts
  // must leave the other visible on future scans.
  removals[hash] = (removals[hash] || 0) + 1;
  inventory._removedArtifacts = removals;
  delete inventory[rarity][set][key];
  await saveAtomically(filename, inventory);
}

module.exports = { signature, saveAtomically, removeArtifact };
