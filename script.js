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
        const samples = [
  {
    slot: "flower",
    level: 0,
    mainstat: { hp: 717 },
    substats: { "atk%": 5.8, "crit-dmg%": 7.8, def: 23 }
  },
  {
    slot: "plume",
    level: 4,
    mainstat: { atk: 100 },
    substats: {
      "crit-rate%": 3.9,
      "crit-dmg%": 7.8,
      "energy-recharge%": 5.2,
      hp: 209
    }
  },
  {
    slot: "goblet",
    level: 0,
    mainstat: { "cryo-dmg%": 7 },
    substats: { "atk%": 4.7, "crit-rate%": 3.1 }
  }
];

for (const sets of Object.values(data)) {
  for (const artifacts of Object.values(sets)) {
    for (const [index, sample] of samples.entries()) {
      artifacts[`demo-${index + 1}`] = structuredClone(sample);
    }
  }
}

displayArtifacts(data);
        rawdata = data
        console.log(rawdata)
        displayArtifacts(data)
    })
    .catch(error => console.error('Unable to fetch data:', error));

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