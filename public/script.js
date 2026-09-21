/**
 * COLLECTION SCREEN — runs in the browser after index.html has been parsed.
 *
 * Read this file after src/inventory.js. That file converts the saved OCR data;
 * this file displays it and connects the page controls to the display.
 * src/get_images.js calls refreshInventory() after a successful scan.
 *
 * Data flow: data.json → Inventory.normalize() → artifacts → filters → cards.
 * Filtering only changes the view. Nothing here writes to data.json.
 */

// The complete collection stays in memory; filters never remove items from it.
let artifacts = [];

// Small SVG drawings shown underneath artwork, so a missing image has a fallback.
// These strings are our own markup, not text supplied by the OCR reader.
const icons = {
  Flower:'<path d="M12 9C5-2 0 10 9 12c-11 7 1 12 3 3 7 11 12-1 3-3 11-7-1-12-3-3Z"/><circle cx="12" cy="12" r="2"/>',
  Plume:'<path d="M5 20 19 4c3 9-2 15-11 13M9 15l1-7m3 3 5-1"/>',
  Sands:'<path d="M6 3h12M6 21h12M7 3c0 6 3 6 5 9-2 3-5 3-5 9m10-18c0 6-3 6-5 9 2 3 5 3 5 9M9 18h6"/>',
  Goblet:'<path d="M7 3h10l1 7c0 4-3 5-6 5s-6-1-6-5l1-7Zm5 12v6m-4 0h8M8 7h8"/>',
  Circlet:'<path d="m3 7 4 4 5-7 5 7 4-4-3 12H6L3 7Zm3 9h12"/>'};

// Wrap the selected path in an accessible, decorative SVG.
const icon = slot => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[slot] || icons.Flower}</svg>`;

// Escape external text before inserting it into an HTML string. For example,
// a set name containing < must display as text rather than become an HTML tag.
const escapeHTML = value => String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

/** Return the shared card markup for one NORMALIZED artifact.
 * a.setKey identifies the artwork filename; a.set is the human-readable name.
 * Stats are [label, formattedValue] pairs. map() makes one row per pair;
 * join('') combines those rows without commas. The grid and details dialog
 * use this same markup to keep their information consistent.
 * This function returns HTML only; render()/openDetails() attach events.
 */
function cardContents(a) {
  return `
    <div class="card-top">
    <span class="artwork">${icon(a.slot) || ""}<img src="./Assets/artifact-set-images/artifacts/${encodeURIComponent(a.setKey)}.webp" alt="" loading="lazy">
    </span>
    <span class="slot">${escapeHTML(a.slot)}</span>
    <span class="level">+${a.level}</span>
    </div>
    <h3 class="set-name">${escapeHTML(a.set)}</h3>
    <div class="main-stat">
    <span class="stat-label">${escapeHTML(a.main)}</span>
    <span class="stat-value">${escapeHTML(a.value)}</span>
    </div>
    <div class="rarity ${a.rarity===4?'four':a.rarity<4?'low':''}" aria-label="${a.rarity} stars">${'★'.repeat(a.rarity)}</div>
    <dl class="substats">${a.stats.map(([k,v])=>`<dt>${escapeHTML(k)}</dt>
    <dd>${escapeHTML(v)}</dd>`).join('')}${a.stats.length<4?'<dt>—</dt><dd>—</dd>':''}</dl>
    <div class="card-footer">
    <span class="${a.equipped?'equipped':''}">${a.equipped?'Equipped · '+escapeHTML(a.equipped):'Saved artifact'}</span>${a.locked?'<svg class="lock" viewBox="0 0 16 16" fill="none" stroke="currentColor" role="img" aria-label="Locked"><rect x="3" y="7" width="10" height="7" rx="2"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/></svg>':''}</div>
  `;
}


// A shorthand for finding an element by its HTML id. This is not jQuery.
const $ = id => document.getElementById(id);

/** Return a filtered and sorted copy; leave the complete collection intact. */
function filteredArtifacts() {
  const query = $('search').value.trim().toLocaleLowerCase();

  // An empty select value means "all". Every active filter must match (&&).
  // Select values are strings, so rarity needs conversion before comparison.
  return artifacts.filter(a =>
    (!$('set').value || a.set === $('set').value) &&
    (!$('rarity').value || a.rarity === Number($('rarity').value)) &&
    (!$('slot').value || a.slot === $('slot').value) &&
    [a.set, a.slot, a.main, a.equipped, ...a.stats.flat()]
      .join(' ').toLocaleLowerCase().includes(query)
  ).sort((a, b) => {
    // filter() produced a new array, so sorting does not reorder artifacts.
    if ($('sort').value === 'level') return b.level - a.level;
    if ($('sort').value === 'set') return a.set.localeCompare(b.set);
    // "order" is position in the saved inventory, not a scan timestamp.
    return a.order - b.order;
  });
}

/** Rebuild the grid and synchronize its counts, reset button and empty state. */
function render() {
  const visible = filteredArtifacts();

  // replaceChildren removes the previous cards before adding the new ones.
  // Each card is a button, so keyboard users can open it with Enter/Space.
  $('grid').replaceChildren(...visible.map(a => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'artifact-card';
    card.setAttribute('aria-label',
      `${a.set}, ${a.slot}, ${a.main} ${a.value}, level ${a.level}. View details`);
    card.innerHTML = cardContents(a);
    card.addEventListener('click', () => openDetails(a));
    // Removing only the failed image reveals the SVG placeholder underneath.
    card.querySelector('img').addEventListener('error', event => event.currentTarget.remove());
    return card;
  }));

  $('count').textContent = `${visible.length} artifact${visible.length === 1 ? '' : 's'}`;
  $('results').textContent = `Showing ${visible.length} of ${artifacts.length} artifacts`;
  $('empty').hidden = visible.length > 0;

  // Distinguish a genuinely empty collection from filters with no matches.
  $('empty').querySelector('h2').textContent = artifacts.length
    ? 'No matching artifacts' : 'Your collection starts here';
  $('empty').querySelector('p').textContent = artifacts.length
    ? 'Try another set, slot, or search term.'
    : 'Import screenshots to add your first artifacts.';
  $('empty-reset').hidden = !artifacts.length;
  $('reset').hidden = !['set', 'rarity', 'slot', 'search'].some(id => $(id).value);
  document.querySelector('.nav-count').textContent = artifacts.length;
}

// The browser restores the form defaults; we then redraw from those values.
// Sorting and density live outside the form and are intentionally preserved.
function resetFilters() {
  $('filters').reset();
  render();
}

/** Populate the native dialog before opening it. Escape closes it by default. */
function openDetails(a) {
  $('detail-title').textContent = a.set;
  $('detail-content').innerHTML = `<div class="artifact-card">${cardContents(a)}</div>`;
  $('detail-content').querySelector('img').addEventListener('error', event => event.currentTarget.remove());
  $('detail').showModal();
}

// UI events: these callbacks run later, when the user interacts with controls.
// Prevent a normal form submission, which would reload the entire page.
$('filters').addEventListener('submit', e => e.preventDefault());
$('filters').addEventListener('input', render);
$('sort').addEventListener('change', render);
$('reset').addEventListener('click', resetFilters);
$('empty-reset').addEventListener('click', resetFilters);
$('close-detail').addEventListener('click', () => $('detail').close());

// data-density is a custom HTML attribute; dataset.density reads its value.
// CSS does the resizing. aria-pressed announces which option is selected.
document.querySelectorAll('[data-density]').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('[data-density]').forEach(b => {
      b.setAttribute('aria-pressed', String(b === button));
    });
    $('grid').classList.toggle('comfortable', button.dataset.density === 'comfortable');
  });
});

// Do not steal a slash typed into another input or while details are open.
document.addEventListener('keydown', e => {
  if (e.key === '/' &&
      !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName) &&
      !$('detail').open) {
    e.preventDefault();
    $('search').focus();
  }
});

/**
 * Load inventory on startup, on Retry, and after a completed OCR scan.
 * async/await waits for network work without freezing the page.
 * Rejects on failure so the scan dialog can report a refresh problem too.
 */
async function refreshInventory() {
  try {
    // OCR can just have changed this file. Avoid an old browser-cached copy.
    const response = await fetch('./data.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Could not load your saved inventory. Please try again.');
    const data = await response.json();
    const next = Inventory.normalize(data);
    const previous = $('set').value;

    // Replace state only after downloading and converting successfully.
    artifacts = next;
    $('set').replaceChildren(new Option('All artifact sets', ''));
    // Set removes duplicate names; empty set buckets do not create options.
    for (const name of [...new Set(artifacts.map(a => a.set))].sort()) {
      $('set').add(new Option(name, name));
    }
    if ([...$('set').options].some(option => option.value === previous)) {
      $('set').value = previous;
    }
    $('inventory-error').hidden = true;
    render();
  } catch (error) {
    // If a later refresh fails, keep any previously loaded cards visible.
    $('inventory-error').hidden = false;
    $('inventory-error-message').textContent = 'Unable to refresh inventory. ' + error.message;
    if (!artifacts.length) {
      $('count').textContent = 'Inventory unavailable';
      $('results').textContent = 'Unable to load inventory';
      $('empty').hidden = true;
    }
    throw error;
  }
}

// The function already shows an error panel. These catches avoid an additional
// unhandled-promise error for startup/Retry; the scan caller handles its own.
$('retry-inventory').addEventListener('click', () => refreshInventory().catch(() => {}));
refreshInventory().catch(() => {});
