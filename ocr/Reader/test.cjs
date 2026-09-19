const { readFile, readdir } = require('node:fs/promises');
const { createWorker, PSM } = require('tesseract.js');
const sharp = require('sharp');
const path = require('node:path');
const { saveInventory } = require('../Writer/inventory-writer.cjs');

async function readArtifact(image, worker) {

  const regions = {
    mainstatName: { left: 1400, top: 265, width: 300, height: 35 },
    mainstatValue: { left: 1400, top: 300, width: 250, height: 50 },
    substats: { left: 1400, top: 475, width: 350, height: 150 },
    level: { left: 1412, top: 432, width: 50, height: 22 },
    name: { left: 1400, top: 125, width: 450, height: 50 },
    stars: { left: 1400, top: 350, width: 185, height: 45 },
    slot: { left: 1400, top: 185, width: 450, height: 40 },
    set: { left: 1400, top: 630, width: 460, height: 40 }
  };

  const results = {};

  try {
    for (const [name, rectangle] of Object.entries(regions)) {
      let input = image;
      let options = { rectangle };

      if (name === 'stars') {
        results.rarity = await countStars(image, rectangle);
        continue; // Skip Tesseract for this region.
      }

      if (name === 'level') {
        input = await sharp(image)
          .extract(rectangle)
          .resize({ width: rectangle.width * 4 })
          .negate({ alpha: false })
          .grayscale()
          .threshold(140)
          .extend({
            top: 20,
            bottom: 20,
            left: 20,
            right: 20,
            background: '#ffffff'
          })
          .png()
          .toBuffer();

        options = {};
      }
      await worker.setParameters({
        tessedit_pageseg_mode:
          name === 'level'
            ? PSM.SINGLE_WORD
            : name.startsWith('mainstat') || name === 'slot' || name === 'set'
              ? PSM.SINGLE_LINE
              : PSM.SINGLE_BLOCK,

        tessedit_char_whitelist:
          name === 'level' ? '+0123456789' : ''
      });
      const result = await worker.recognize(input, options);
      results[name] = result.data.text.trim();
    }
    const rawSet = results.set;

    // Load your existing inventory JSON as a set-name catalog.
    const catalog = JSON.parse(
      await readFile(path.join(__dirname, '../../data.json'), 'utf8')
    );

    const knownSets = new Set(
      Object.values(catalog).flatMap(sets => Object.keys(sets))
    );

    function normalizeSet(text) {
      return text
        .toLowerCase()
        .replace(/['’]/g, '')
        .replace(/:\s*$/, '')
        .trim()
        .replace(/[\s-]+/g, '-');
    }

    const substatLines = results.substats.split(/\r?\n/);

    const candidates = [
      ...results.set.split(/\r?\n/),
      ...substatLines
    ];

    results.set = candidates
      .map(normalizeSet)
      .find(key => knownSets.has(key)) ?? null;

    // Remove the recognized set-name line from the substats.
    results.substats = substatLines
      .filter(line => normalizeSet(line) !== results.set)
      .join('\n')
      .trim();

    console.log('Raw set:', rawSet);
    console.log('Set key:', results.set);
    const slotNames = {
      'flower of life': 'flower',
      'plume of death': 'plume',
      'sands of eon': 'sands',
      'goblet of eonothem': 'goblet',
      'circlet of logos': 'circlet'
    };
    const normalizedSlot = results.slot
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();

    const match = Object.keys(slotNames).find(label =>
      normalizedSlot === label ||
      normalizedSlot.startsWith(`${label} `)
    );

    results.slot = match ? slotNames[match] : null;
    const parsed = parseSubstats(results.substats);

    // Keep the original reading for debugging.
    results.rawSubstats = results.substats;

    // Store structured values.
    results.substats = parsed.stats;
    results.unparsedSubstats = parsed.unparsed;

    const mainstatLabels = {
      'HP': 'hp',
      'ATK': 'atk',
      'DEF': 'def',
      'Elemental Mastery': 'elemental-mastery',
      'Energy Recharge': 'energy-recharge%',
      'CRIT Rate': 'crit-rate%',
      'CRIT DMG': 'crit-dmg%',
      'Healing Bonus': 'healing-bonus%',
      'Physical DMG Bonus': 'physical-dmg%',
      'Pyro DMG Bonus': 'pyro-dmg%',
      'Hydro DMG Bonus': 'hydro-dmg%',
      'Electro DMG Bonus': 'electro-dmg%',
      'Cryo DMG Bonus': 'cryo-dmg%',
      'Anemo DMG Bonus': 'anemo-dmg%',
      'Geo DMG Bonus': 'geo-dmg%',
      'Dendro DMG Bonus': 'dendro-dmg%'
    };

    const labelText = results.mainstatName
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

    const label = Object.keys(mainstatLabels).find(name =>
      labelText === name.toLowerCase() ||
      labelText.startsWith(`${name.toLowerCase()} `)
    );

    const valueText = results.mainstatValue.trim();
    const valueMatch = valueText.match(
      /^(\d+(?:,\d{3})*(?:\.\d+)?)\s*(%)?$/
    );

    results.mainstat = null;

    if (label && valueMatch) {
      let key = mainstatLabels[label];

      if (['hp', 'atk', 'def'].includes(key) && valueMatch[2]) {
        key += '%';
      }

      results.mainstat = {
        [key]: Number(valueMatch[1].replaceAll(',', ''))
      };
    }
    results.rawLevel = results.level;

    const levelMatch = results.level.trim().match(/^\+?(\d+)$/);
    results.level = levelMatch ? Number(levelMatch[1]) : null;

    return results;
  } catch (error) {
    throw error;
  }
}
async function main() {
  const folder = path.join(__dirname, 'images');
  const entries = await readdir(folder, { withFileTypes: true });

  const files = entries
    .filter(entry =>
      entry.isFile() && /\.(png|jpe?g|webp)$/i.test(entry.name)
    )
    .map(entry => entry.name)
    .sort();

  if (files.length === 0) {
    console.log('No images found.');
    return;
  }

  const worker = await createWorker('eng');
  const batch = [];

  try {
    for (const [index, filename] of files.entries()) {
      console.log(`Reading ${index + 1}/${files.length}: ${filename}`);

      try {
        const image = await readFile(path.join(folder, filename));
        const artifact = await readArtifact(image, worker);

        batch.push({ filename, artifact });
        console.dir({ filename, artifact }, { depth: null });
      } catch (error) {
        const message = error.message ?? String(error);

        batch.push({ filename, error: message });
        console.error(`Failed to read ${filename}:`, message);
      }
    }
  } finally {
    await worker.terminate();
  }
  const catalog = JSON.parse(
    await readFile(path.join(__dirname, '../../data.json'), 'utf8')
  );

  const outputPath = path.join(__dirname, '../../data.json');

  const summary = await saveInventory(batch, catalog, outputPath);

  if (summary.written) {
  console.log(`Saved ${summary.saved} artifacts to ${outputPath}`);
} else {
  console.log('Inventory unchanged: scan was empty or incomplete.');
}

if (summary.skipped.length > 0) {
  console.table(summary.skipped);
}
  return batch;
}
async function countStars(image, rectangle) {
  const { data, info } = await sharp(image)
    .extract(rectangle)
    .toColourspace('srgb')
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let stars = 0;
  let insideStar = false;

  for (let x = 0; x < info.width; x++) {
    let yellowPixels = 0;

    for (let y = 0; y < info.height; y++) {
      const index = (y * info.width + x) * info.channels;

      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];

      // Starting thresholds for bright gold stars.
      const isYellow =
        red > 200 &&
        green > 150 &&
        blue < 130 &&
        red > green &&
        green - blue > 60;

      if (isYellow) yellowPixels++;
    }

    // Ignore isolated pixels.
    const columnHasStar = yellowPixels >= 3;

    if (columnHasStar && !insideStar) {
      stars++;
    }

    insideStar = columnHasStar;
  }

  // An unexpected count needs review, not an invented rarity.
  return stars >= 1 && stars <= 5 ? stars : null;
}

function parseSubstats(text) {
  const statNames = {
    hp: 'hp',
    atk: 'atk',
    def: 'def',
    'crit rate': 'crit-rate',
    'crit dmg': 'crit-dmg',
    'energy recharge': 'energy-recharge',
    'elemental mastery': 'elemental-mastery'
  };

  const stats = {};
  const unparsed = [];

  for (const line of text.split(/\r?\n/)) {
    const cleaned = line
      .replace(/^[\s•*+«-]+/, '')
      .trim();

    if (!cleaned) continue;

    const match = cleaned.match(
      /^(HP|ATK|DEF|CRIT Rate|CRIT DMG|Energy Recharge|Elemental Mastery)\s*\+\s*(\d+(?:\.\d+)?)\s*(%)?$/i
    );

    if (!match) {
      unparsed.push(line);
      continue;
    }

    const [, label, number, percent] = match;
    const key =
      statNames[label.toLowerCase()] + (percent ? '%' : '');

    stats[key] = Number(number);
  }

  return { stats, unparsed };
}

main().catch(console.error);