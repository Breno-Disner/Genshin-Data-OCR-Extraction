//const { createElement } = require("react");

let rawdata = null

fetch('./data.json')
  .then(response => {
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    return response.json();
  })
  .then(data => {
    displayArtifacts(data);
    rawdata = data
    createSetButtons(data)
  })
  .catch(error => console.error('Unable to fetch data:', error));

function createSetButtons(data) {
  const setBody = document.querySelector('#setbody');

  // Remove generated buttons if this function runs again.
  setBody.querySelectorAll('button:not([data-set="all"])')
    .forEach(button => button.remove());

  const setNames = new Set();

  for (const sets of Object.values(data)) {
    for (const setName of Object.keys(sets)) {
      setNames.add(setName);
    }
  }

  for (const setName of [...setNames].sort()) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.set = setName;
    button.textContent = setName
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    setBody.appendChild(button);
  }
}

function displayArtifacts(data) {
  const main = document.querySelector('main');
  main.replaceChildren(); // Clear previous cards.
  for (const [rarity, sets] of Object.entries(data)) {
    for (const [setName, artifacts] of Object.entries(sets)) {
      for (const [id, artifact] of Object.entries(artifacts)) {
        const card = document.createElement('div');
        card.classList.add('artifact', setName);
        card.style.backgroundImage = `url("./Assets/artifact-set-images/artifacts/${setName}.webp")`

        const title = document.createElement('h3');
        title.textContent = setName.replaceAll('-', ' ');

        const details = document.createElement('p');
        details.textContent =
          `${artifact.slot} | Level ${artifact.level}`;

        const mainstat = document.createElement('h4')
        const [Mstat, value] = Object.entries(artifact.mainstat)[0];
        mainstat.textContent =
          `${Mstat}: ${value}`

        const substats = document.createElement('div')
        for (const [stat, value] of Object.entries(artifact.substats)) {
          const line = document.createElement('div');
          line.textContent = `${stat}: ${value}`;
          substats.appendChild(line);

        }
        card.append(title, details, mainstat, substats);
        main.appendChild(card);
      }
    }
  }
}

// nav selector
const setHeader = document.querySelector('#setheader');

document.querySelector('#setbody').addEventListener('click', event => {
  const button = event.target.closest('button[data-set]');
  if (!button) return;

  const selectedSet = button.dataset.set;
  setHeader.textContent = button.textContent.trim();

  console.log(selectedSet); // Use this to filter your artifact cards.
  filterArtifacts(selectedSet);

});

function filterArtifacts(selectedSet) {
  document.querySelectorAll('main .artifact').forEach(card => {
    const matches =
      selectedSet === 'all' || card.classList.contains(selectedSet);

    card.hidden = !matches;
  });
}