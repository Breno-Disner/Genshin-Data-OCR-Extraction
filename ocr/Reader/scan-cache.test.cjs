const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, writeFile, readFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { scanScreenshots } = require('./scan-cache.cjs');
const { saveInventory } = require('../Writer/inventory-writer.cjs');
const { removeArtifact } = require('../Writer/removals.cjs');
const { normalize } = require('../../public/src/inventory.js');

test('reuse unchanged screenshots, rescan changed bytes, and preserve removals', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'genshin-cache-'));
  const output = path.join(folder, 'inventory.json');
  const artifact = { rarity: 5, set: 'test-set', slot: 'flower', level: 20, mainstat: { hp: 4780 }, substats: {} };
  let calls = 0;
  const read = async () => { calls++; return artifact; };
  const load = async () => JSON.parse(await readFile(output, 'utf8'));
  try {
    await writeFile(path.join(folder, 'one.png'), 'first image');
    let result = await scanScreenshots(folder, ['one.png'], undefined, read);
    assert.equal(calls, 1);
    await saveInventory(result.batch, { 'five-stars': { 'test-set': {} } }, output);
    let inventory = await load();
    assert.equal(inventory['five-stars']['test-set']['1'].screenshot.filename, 'one.png');
    result = await scanScreenshots(folder, ['one.png'], inventory._scanCache, read);
    assert.equal(result.reused, 1);
    assert.equal(calls, 1);
    const selected = normalize(inventory)[0];
    await removeArtifact(output, selected.id, selected, normalize);
    await saveInventory(result.batch, await load(), output);
    assert.equal(normalize(await load()).length, 0);
    assert.equal(calls, 1);
    await writeFile(path.join(folder, 'one.png'), 'changed image');
    result = await scanScreenshots(folder, ['one.png'], inventory._scanCache, read);
    assert.equal(result.reused, 0);
    assert.equal(calls, 2);
    result = await scanScreenshots(folder, ['one.png'], { ...inventory._scanCache, version: 0 }, read);
    assert.equal(calls, 3);
    const before = await readFile(output, 'utf8');
    const failed = await scanScreenshots(folder, ['one.png'], undefined, async () => { throw new Error('failed OCR'); });
    assert.equal((await saveInventory(failed.batch, await load(), output)).written, false);
    assert.equal(await readFile(output, 'utf8'), before);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
