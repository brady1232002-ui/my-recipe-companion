
/* My Recipe Companion - Photo to Recipe v3 */
(() => {
  const $ = id => document.getElementById(id);
  const add = $('add');
  const home = $('home');

  if (!add || !home || $('photoImportBtn')) return;

  // Add button to existing cookbook toolbar
  const button = document.createElement('button');
  button.id = 'photoImportBtn';
  button.className = 'btn alt';
  button.textContent = '📸 Photo to Recipe';
  add.after(button);

  // Build photo import screen
  const section = document.createElement('section');
  section.id = 'photoImportPanel';
  section.className = 'hidden';

  section.innerHTML = `
    <button class="btn alt" id="photoBack">
      ← Cookbook
    </button>
    <h2>📸 Photo to Recipe</h2>
    <div class="panel">
      <p>
        Take a photo of a recipe card,
        cookbook page, or screenshot.
      </p>

      <label for="recipeImage">
        Choose a recipe photo
      </label>
      <input
        class="field"
        type="file"
        id="recipeImage"
        accept="image/*"
      >

      <img id="recipePreview"
        alt="Selected recipe"
        style="display:none;width:100%;
        max-height:350px;object-fit:contain;
        margin:15px 0;border-radius:12px">

      <div class="actions">
        <button class="btn" id="readPhoto"
          type="button">
          ✨ Read recipe photo
        </button>
      </div>

      <p id="ocrStatus" class="subtle"
        role="status" aria-live="polite">
        Ready to scan.
      </p>

      <label for="recognizedText">
        Recognized text (editable)
      </label>
      <textarea id="recognizedText"
        style="width:100%;min-height:230px"
        placeholder="Your recipe text will appear here.">
      </textarea>

      <div class="actions">
        <button class="btn" id="reviewPhoto"
          type="button">
          Review in recipe editor
        </button>
      </div>
    </div>`;

  home.parentNode.insertBefore(
    section, home.nextSibling
  );

  let imageURL = null;
  let busy = false;

  function showPanel() {
    ['home', 'editor', 'detail'].forEach(
      id => $(id).classList.add('hidden')
    );
    section.classList.remove('hidden');
    window.scrollTo(0, 0);
  }

  function showHome() {
    section.classList.add('hidden');
    home.classList.remove('hidden');
    window.scrollTo(0, 0);
  }

  button.onclick = showPanel;
  $('photoBack').onclick = showHome;

  $('recipeImage').onchange = e => {
    const file = e.target.files[0];
    if (imageURL) URL.revokeObjectURL(imageURL);
    imageURL = null;

    $('recipePreview').style.display = 'none';
    $('recognizedText').value = '';
    $('ocrStatus').textContent = 'Ready to scan.';

    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please choose an image.');
      return;
    }

    imageURL = URL.createObjectURL(file);
    $('recipePreview').src = imageURL;
    $('recipePreview').style.display = 'block';
  };

  // Load text recognition library when needed
  function loadOCR() {
    if (window.Tesseract) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src =
        'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
      script.onload = () => {
        if (window.Tesseract) resolve();
        else reject(new Error('OCR library unavailable'));
      };
      script.onerror = () =>
        reject(new Error('Could not load OCR library'));
      document.head.appendChild(script);
    });
  }

  $('readPhoto').onclick = async () => {
    const file = $('recipeImage').files[0];
    if (!file || busy) {
      if (!file) alert('Choose a photo first.');
      return;
    }

    busy = true;
    $('readPhoto').disabled = true;

    try {
      $('ocrStatus').textContent =
        'Loading text recognition...';

      await loadOCR();

      const worker = await Tesseract.createWorker(
        'eng', 1, {
          logger: m => {
            if (m.status) {
              const percent = m.progress
                ? ` ${Math.round(m.progress * 100)}%`
                : '';
              $('ocrStatus').textContent =
                m.status + percent;
            }
          }
        }
      );

      try {
        const result = await worker.recognize(file);
        const text = result.data.text.trim();

        $('recognizedText').value = text;
        $('ocrStatus').textContent = text
          ? 'Text recognized! Review it below.'
          : 'No text found. Try a clearer photo.';
      } finally {
        await worker.terminate();
      }

    } catch (err) {
      console.error(err);
      $('ocrStatus').textContent =
        'Recognition failed. Check your connection ' +
        'or try another photo.';
    } finally {
      busy = false;
      $('readPhoto').disabled = false;
    }
  };

  // Convert OCR text to recipe fields
  function parseRecipe(text) {
    const lines = text.replace(/\r/g, '')
      .split('\n').map(x => x.trim())
      .filter(Boolean);

    const data = {
      name: '',
      category: 'Dinner',
      servings: 4,
      prep: 0,
      cook: 0,
      ingredients: [],
      instructions: []
    };

    let mode = '';

    for (const line of lines) {
      if (/^ingredients\s*:?$/i.test(line)) {
        mode = 'ingredients';
        continue;
      }

      if (/^(instructions|directions|method|steps)\s*:?$/i
        .test(line)) {
        mode = 'instructions';
        continue;
      }

      if (!mode) {
        let match;

        match = line.match(
          /^(servings|serves|yield)\s*:?\s*(\d+)/i
        );
        if (match) {
          data.servings = Number(match[2]);
          continue;
        }

        match = line.match(
          /^prep(?:aration)?\s*time\s*:?\s*(\d+)/i
        );
        if (match) {
          data.prep = Number(match[1]);
          continue;
        }

        match = line.match(
          /^cook(?:ing)?\s*time\s*:?\s*(\d+)/i
        );
        if (match) {
          data.cook = Number(match[1]);
          continue;
        }

        if (!data.name) {
          data.name = line.replace(/^#+\s*/, '');
        }
      } else {
        const cleaned = line.replace(
          /^\s*(?:[-*•]|\d+[.)])\s*/, ''
        ).trim();

        if (cleaned) data[mode].push(cleaned);
      }
    }

    return data;
  }

  $('reviewPhoto').onclick = () => {
    const text = $('recognizedText').value.trim();

    if (!text) {
      alert('Scan a photo or enter recipe text first.');
      return;
    }

    const data = parseRecipe(text);

    if (!data.name) {
      alert('Could not find a recipe title.');
      return;
    }

    section.classList.add('hidden');

    // Open the existing recipe editor
    add.click();

    $('name').value = data.name;
    $('category').value = data.category;
    $('servings').value = data.servings;
    $('prep').value = data.prep;
    $('cook').value = data.cook;

    $('ingredients').value =
      data.ingredients.join('\n');

    $('instructions').value =
      data.instructions.join('\n');

    // Preserve original OCR text for correction
    if (!data.ingredients.length ||
        !data.instructions.length) {
      $('notes').value =
        'Original scanned text:\n' + text;
    }

    $('editTitle').textContent =
      'Review scanned recipe';

    window.scrollTo(0, 0);
  };
})();
