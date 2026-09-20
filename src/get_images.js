let fileselectoropen = false;

const selectorpage = document.getElementById('file_selector');
const fileInput = document.getElementById('file-input');

document.querySelector('#image_trigger').addEventListener('click', () => {
  fileselectoropen = !fileselectoropen;
  selectorpage.style.display = fileselectoropen ? 'flex' : 'none';
});

document.querySelector('#cancel-file-selection').addEventListener('click', () => {
  fileInput.value = '';
  selectorpage.style.display = 'none';
  fileselectoropen = false;
});

const dropZone = document.getElementById('drop-zone');

async function validateImages(files) {
  const accepted = [];
  const rejected = [];

  for (const file of files) {
    let bitmap;

    try {
      bitmap = await createImageBitmap(file);

      if (bitmap.width !== 1920 || bitmap.height !== 1080) {
        rejected.push(
          `${file.name}: ${bitmap.width} × ${bitmap.height}; expected 1920 × 1080`
        );
        continue;
      }

      accepted.push(file);
    } catch {
      rejected.push(`${file.name}: could not decode this image`);
    } finally {
      bitmap?.close();
    }
  }

  return { accepted, rejected };
}

async function handleImages(files) {
  const { accepted, rejected } = await validateImages(files);

  if (rejected.length > 0) {
    alert(`Rejected files:\n${rejected.join('\n')}`);
  }

  if (accepted.length === 0) return;

  // Next step: upload these files to the local Node server.
  let saved = 0;
let duplicates = 0;
const failures = [];

for (const file of accepted) {
  const form = new FormData();
  form.append('image', file);

  try {
    const response = await fetch('/api/images', {
      method: 'POST',
      body: form
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error ?? 'Upload failed.');
    }

    if (result.duplicate) {
      duplicates++;
    } else {
      saved++;
    }
  } catch (error) {
    failures.push(`${file.name}: ${error.message}`);
  }
}

alert([
  `Saved: ${saved}`,
  `Already present: ${duplicates}`,
  ...failures
].join('\n'));
}

fileInput.addEventListener('change', async () => {
  const files = Array.from(fileInput.files);
  fileInput.value = '';
  await handleImages(files);
});

dropZone.addEventListener('dragover', event => {
  event.preventDefault();
});

dropZone.addEventListener('drop', async event => {
  event.preventDefault();
  await handleImages(Array.from(event.dataTransfer.files));
});