const { signature, saveAtomically } = require('./removals.cjs');
const { CACHE_VERSION } = require('../Reader/scan-cache.cjs');

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
        Object.entries(catalog).filter(([key]) => Object.values(rarityKeys).includes(key)).map(([rarity, sets]) => [
            rarity,
            Object.fromEntries(
                Object.keys(sets).map(setName => [setName, {}])
            )
        ])
    );

    // Preserve removal records while rebuilding artifact buckets from screenshots.
    // Copy the counts before consuming them, so the saved records remain intact.
    inventory._removedArtifacts = { ...(catalog._removedArtifacts || {}) };
    inventory._scanCache = { version: CACHE_VERSION, entries: {} };
    const remainingRemovals = { ...inventory._removedArtifacts };
    let removed = 0;
    const skipped = [];
    let saved = 0;

    for (const { filename, hash: screenshotHash, artifact, error } of batch) {
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

        // Cache only validated results, including intentionally removed artifacts.
        // Inventory and cache are committed together, so failed scans cannot
        // mark an unsaved result as complete.
        if (screenshotHash) inventory._scanCache.entries[screenshotHash] = artifact;
        const hash = signature(rarity, artifact.set, artifact);
        if (remainingRemovals[hash] > 0) {
            remainingRemovals[hash]--;
            removed++;
            continue; // Intentional removal is not an OCR validation failure.
        }
        const items = inventory[rarity][artifact.set];
        const id = String(Object.keys(items).length + 1);

        items[id] = {
            slot: artifact.slot,
            level: artifact.level,
            mainstat: artifact.mainstat,
            substats: artifact.substats,
            ...(screenshotHash ? { screenshot: { filename, hash: screenshotHash } } : {})
        };

        saved++;
    }
    if ((saved === 0 && removed === 0) || skipped.length > 0) {
        return { saved: 0, skipped, written: false };
    }
    await saveAtomically(outputPath, inventory);

    return { saved, skipped, written: true };
}

module.exports = { saveInventory };
