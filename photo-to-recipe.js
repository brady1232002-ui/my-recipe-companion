
/* My Recipe Companion - Photo to Recipe v4 */
(() => {
  const $ = id => document.getElementById(id);
  const add = $('add');
  const home = $('home');

  if (!add || !home || $('photoImportBtn')) return;

  const button = document.createElement('button');
  button.id = 'photoImportBtn';
  button.className = 'btn alt';
  button.textContent = '📸 Photo to Recipe';
  add.after(button);

  const panel = document.createElement('section');
  panel.id = 'photoImportPanel';
  panel.className = 'hidden';

  panel.innerHTML = `
    <button class="btn alt" id="photoBack">
      ← Cookbook
    </button>

    <h2>📸 Photo to Recipe</h2>
    <p>Automatically scans recipe cards, cookbook pages,
    and screenshots.</p>

    <input id="recipeImage" type="file"
      accept="image/*">

    <img id="recipePreview" alt="Recipe preview"
      style="display:none;width:100%;
      max-height:350px;object-fit:contain;
      margin:15px 0;border-radius:12px">

    <button class="btn" id="readPhoto">
      ✨ Scan Recipe Automatically
    </button>

    <p id="ocrStatus" role="status"
      aria-live="polite">Ready to scan.</p>

    <label for="recognizedText">
      Recognized Recipe Text
    </label>

    <textarea id="recognizedText"
      style="width:100%;min-height:260px">
    </textarea>

    <button class="btn" id="reviewPhoto">
      Review in Recipe Editor
    </button>
  `;

  home.parentNode.insertBefore(panel, home.nextSibling);

  let busy = false;

  function showPanel() {
    ['home', 'editor', 'detail'].forEach(id => {
      const el = $(id);
      if (el) el.classList.add('hidden');
    });
    panel.classList.remove('hidden');
    window.scrollTo(0, 0);
  }

  button.onclick = showPanel;

  $('photoBack').onclick = () => {
    panel.classList.add('hidden');
    home.classList.remove('hidden');
  };

  $('recipeImage').onchange = e => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      $('recipePreview').src = reader.result;
      $('recipePreview').style.display = 'block';
    };
    reader.readAsDataURL(file);
  };

  function loadOCR() {
    if (window.Tesseract) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src =
        'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function enhanceImage(image, grayscale = false) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const maxWidth = 2200;
    const scale = Math.min(
      1, maxWidth / image.width
    );

    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);

    ctx.drawImage(
      image, 0, 0,
      canvas.width, canvas.height
    );

    if (grayscale) {
      const data = ctx.getImageData(
        0, 0, canvas.width, canvas.height
      );

      for (let i = 0; i < data.data.length; i += 4) {
        const gray =
          data.data[i] * 0.299 +
          data.data[i + 1] * 0.587 +
          data.data[i + 2] * 0.114;

        const adjusted = Math.max(
          0, Math.min(255, (gray - 128) * 1.5 + 128)
        );

        data.data[i] = adjusted;
        data.data[i + 1] = adjusted;
        data.data[i + 2] = adjusted;
      }

      ctx.putImageData(data, 0, 0);
    }

    return canvas;
  }

  function cropCanvas(source, x, y, w, h) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;

    canvas.getContext('2d').drawImage(
      source, x, y, w, h,
      0, 0, w, h
    );

    return canvas;
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Could not read image'));
      };

      img.src = url;
    });
  }

  function normalizeText(text) {
    return text
      .replace(/\r/g, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/(\d)\s*\/\s*(\d)/g, '$1/$2')
      .replace(/½/g, '1/2')
      .replace(/¼/g, '1/4')
      .replace(/¾/g, '3/4')
      .replace(/⅓/g, '1/3')
      .replace(/⅔/g, '2/3')
      .replace(/⅛/g, '1/8')
      .trim();
  }

  function scoreText(text) {
    const words = text.match(/[a-z]{3,}/gi) || [];
    const keywords = text.match(
      /ingredients|directions|instructions|cup|tsp|tbsp|bake|oven|chicken|cheese/gi
    ) || [];

    return words.length + keywords.length * 8;
  }

  $('readPhoto').onclick = async () => {
    const file = $('recipeImage').files[0];

    if (!file || busy) {
      if (!file) alert('Choose a photo first.');
      return;
    }

    busy = true;
    $('readPhoto').disabled = true;

    let worker;

    try {
      $('ocrStatus').textContent =
        'Preparing automatic scanner...';

      await loadOCR();

      const image = await loadImage(file);
      const original = enhanceImage(image, false);
      const enhanced = enhanceImage(image, true);

      worker = await Tesseract.createWorker('eng');

      async function recognize(canvas, label) {
        $('ocrStatus').textContent = label;
        const result = await worker.recognize(canvas);
        return normalizeText(result.data.text);
      }

      // First pass: original full image
      const fullText = await recognize(
        original, 'Reading original image...'
      );

      // Second pass: enhanced full image
      const enhancedText = await recognize(
        enhanced, 'Enhancing and reading text...'
      );

      let bestText = scoreText(enhancedText) >
        scoreText(fullText) ? enhancedText : fullText;

      // Detect possible two-column recipe layout.
      // Run separate OCR on each half, then compare.
      if (original.width > original.height * 1.15) {
        const mid = Math.round(original.width / 2);

        const left = cropCanvas(
          enhanced, 0, 0, mid, enhanced.height
        );

        const right = cropCanvas(
          enhanced, mid, 0,
          enhanced.width - mid, enhanced.height
        );

        const leftText = await recognize(
          left, 'Reading left recipe section...'
        );

        const rightText = await recognize(
          right, 'Reading right recipe section...'
        );

        const columnText = leftText + '\n\n' + rightText;

        if (scoreText(columnText) > scoreText(bestText)) {
          bestText = columnText;
        }
      }

      $('recognizedText').value = bestText;
      $('ocrStatus').textContent =
        'Scan complete! Check the text below.';

    } catch (error) {
      console.error(error);
      $('ocrStatus').textContent =
        'Scanning failed. Try another image.';
    } finally {
      if (worker) await worker.terminate();
      busy = false;
      $('readPhoto').disabled = false;
    }
  };

  function parseRecipe(text) {
    const lines = normalizeText(text)
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);

    const recipe = {
      name: '',
      ingredients: [],
      instructions: [],
      notes: []
    };

    let mode = 'title';

    for (const line of lines) {
      if (/^ingredients\s*:?$/i.test(line)) {
        mode = 'ingredients';
        continue;
      }

      if (/^(directions|instructions|method|steps)\s*:?$/i.test(line)) {
        mode = 'instructions';
        continue;
      }

      if (/^(tips|notes|nutrition)\s*:?$/i.test(line)) {
        mode = 'notes';
        continue;
      }

      if (/^(chicken crust|toppings|filling|sauce)\s*:?$/i.test(line)) {
        if (mode === 'ingredients') {
          recipe.ingredients.push('--- ' + line + ' ---');
        }
        continue;
      }

      if (mode === 'title') {
        if (!recipe.name) recipe.name = line;
        continue;
      }

      const cleaned = line.replace(
        /^(?:[-*•]|\d+[.)])\s*/, ''
      ).trim();

      if (!cleaned) continue;

      if (mode === 'ingredients') {
        recipe.ingredients.push(cleaned);
      } else if (mode === 'instructions') {
        recipe.instructions.push(cleaned);
      } else {
        recipe.notes.push(cleaned);
      }
    }

    return recipe;
  }

  $('reviewPhoto').onclick = () => {
    const text = $('recognizedText').value.trim();

    if (!text) {
      alert('Scan a recipe photo first.');
      return;
    }

    const recipe = parseRecipe(text);

    panel.classList.add('hidden');
    add.click();

    $('name').value = recipe.name;
    $('ingredients').value =
      recipe.ingredients.join('\n');
    $('instructions').value =
      recipe.instructions.join('\n');

    $('notes').value = recipe.notes.join('\n');

    if (!recipe.ingredients.length ||
        !recipe.instructions.length) {
      $('notes').value +=
        '\n\nOriginal scanned text:\n' + text;
    }

    $('editTitle').textContent =
      'Review Scanned Recipe';

    window.scrollTo(0, 0);
  };
})();
