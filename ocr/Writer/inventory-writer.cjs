const { writeFile } = require('node:fs/promises');

const rarityKeys = {
  1: 'one-star',
  2: 'two-stars',
  3: 'three-stars',
  4: 'four-stars',
  5: 'five-stars'
};

async function saveInventory(batch, catalog, outputPath) {
  // Preserve the catalog structure, without copying old artifacts.
  const inventory = Object.fromEntries(
    Object.entries(catalog).map(([rarity, sets]) => [
      rarity,
      Object.fromEntries(
        Object.keys(sets).map(setName => [setName, {}])
      )
    ])
  );

  const skipped = [];
  let saved = 0;

  for (const { filename, artifact, error } of batch) {
    if (error || !artifact) {
      skipped.push({ filename, reason: error ?? 'No artifact result' });
      continue;
    }

    const rarity = rarityKeys[artifact.rarity];
    const mainstats = Object.entries(artifact.mainstat ?? {});
    const validSlots = ['flower', 'plume', 'sands', 'goblet', 'circlet'];

    const valid =
      rarity &&
      Object.hasOwn(inventory[rarity] ?? {}, artifact.set) &&
      validSlots.includes(artifact.slot) &&
      Number.isInteger(artifact.level) &&
      artifact.level >= 0 &&
      mainstats.length === 1 &&
      Number.isFinite(mainstats[0][1]) &&
      artifact.substats !== null &&
      typeof artifact.substats === 'object' &&
      !Array.isArray(artifact.substats) &&
      Object.values(artifact.substats).every(Number.isFinite);

    if (!valid) {
      skipped.push({
        filename,
        reason: 'Missing or invalid artifact fields'
      });
      continue;
    }

    const items = inventory[rarity][artifact.set];
    const id = String(Object.keys(items).length + 1);

    items[id] = {
      slot: artifact.slot,
      level: artifact.level,
      mainstat: artifact.mainstat,
      substats: artifact.substats
    };

    saved++;
  }

  await writeFile(
    outputPath,
    JSON.stringify(inventory, null, 2) + '\n',
    'utf8'
  );

  return { saved, skipped };
}

module.exports = { saveInventory };