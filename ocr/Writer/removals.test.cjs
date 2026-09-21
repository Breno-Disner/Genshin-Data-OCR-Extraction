const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, readFile, writeFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { removeArtifact } = require('./removals.cjs');
const { saveInventory } = require('./inventory-writer.cjs');
const { normalize } = require('../../public/src/inventory.js');

test('removal persists across scans, preserves identical copies, and rejects stale selections', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'genshin-removal-'));
  const filename = path.join(directory, 'data.json');
  const artifact = { slot: 'flower', level: 20, mainstat: { hp: 4780 }, substats: { 'crit-rate%': 3.9 } };
  const inventory = { 'five-stars': { 'test-set': { '1': artifact, '2': artifact } } };
  const batch = [1, 2].map(n => ({ filename: `${n}.png`, artifact: { ...artifact, rarity: 5, set: 'test-set' } }));
  const load = async () => JSON.parse(await readFile(filename, 'utf8'));
  try {
    await writeFile(filename, JSON.stringify(inventory));
    const selected = normalize(inventory)[0];
    await assert.rejects(removeArtifact(filename, selected.id, { ...selected, level: 0 }, normalize), { status: 409 });
    assert.deepEqual(await load(), inventory);
    await removeArtifact(filename, selected.id, selected, normalize);
    assert.equal(normalize(await load()).length, 1);
    await assert.rejects(removeArtifact(filename, selected.id, selected, normalize), { status: 404 });
    for (let scan = 0; scan < 2; scan++) {
      const result = await saveInventory(batch, await load(), filename);
      assert.equal(result.written, true);
      assert.equal(result.saved, 1);
      assert.equal(normalize(await load()).length, 1);
    }
    const remaining = normalize(await load())[0];
    await removeArtifact(filename, remaining.id, remaining, normalize);
    const result = await saveInventory(batch, await load(), filename);
    assert.equal(result.written, true);
    assert.equal(result.saved, 0);
    assert.equal(normalize(await load()).length, 0);
    const before = await readFile(filename, 'utf8');
    const failed = await saveInventory([...batch, { filename: 'bad.png', error: 'OCR failed' }], await load(), filename);
    assert.equal(failed.written, false);
    assert.equal(await readFile(filename, 'utf8'), before);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
