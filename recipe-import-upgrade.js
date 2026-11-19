
/* My Recipe Companion: Smart Recipe Import */
(() => {
  const $ = id => document.getElementById(id);
  const add = $('add');
  const home = $('home');

  if (!add || !home || $('pasteImport')) return;

  const button = document.createElement('button');
  button.id = 'pasteImport';
  button.className = 'btn alt';
  button.textContent = '📋 Import recipe';
  add.after(button);

  const section = document.createElement('section');
  section.id = 'pasteImportPanel';
  section.className = 'hidden';

  section.innerHTML = `
    <button class="btn alt" id="pasteBack">
      ← Cookbook
    </button>
    <h2>Import a recipe</h2>
    <div class="panel">
      <label for="pastedRecipe">
        Paste a recipe from ChatGPT,
        a website, or your notes
      </label>
      <textarea id="pastedRecipe"
        style="width:100%;min-height:260px"
        placeholder="Recipe name
Servings: 4
Prep time: 10 minutes
Cook time: 25 minutes

Ingredients
2 cups rice
1 tbsp olive oil

Instructions
1. Cook rice.
2. Serve warm."></textarea>
      <p class="subtle">
        Review the extracted fields before saving.
        Works best with Ingredients and
        Instructions headings.
      </p>
      <button class="btn" id="parseRecipe">
        Review imported recipe
      </button>
    </div>`;

  home.parentNode.insertBefore(section, home.nextSibling);

  const clean = s => s.replace(
    /^\s*(?:[-*•]|\d+[.)])\s*/, ''
  ).trim();

  function parse(text) {
    const lines = text.replace(/\r/g, '')
      .split('\n').map(s => s.trim());

    const headings = {
      ingredients: /^(ingredients|what you'll need)\s*:?$/i,
      instructions: /^(instructions|directions|method|steps|preparation)\s*:?$/i,
      notes: /^notes\s*:?$/i
    };

    const data = {
      ingredients: [],
      instructions: [],
      notes: []
    };

    let mode = '';

    for (const line of lines) {
      if (!line) continue;

      let matched = false;
      for (const [key, re] of Object.entries(headings)) {
        if (re.test(line)) {
          mode = key;
          matched = true;
          break;
        }
      }
      if (matched) continue;

      if (!mode) {
        let m = line.match(
          /^(servings|serves|yield)\s*:\s*(\d+)/i
        );
        if (m) {
          data.servings = m[2];
          continue;
        }

        m = line.match(
          /^prep(?:aration)?\s*time\s*:\s*(\d+)/i
        );
        if (m) {
          data.prep = m[1];
          continue;
        }

        m = line.match(
          /^cook(?:ing)?\s*time\s*:\s*(\d+)/i
        );
        if (m) {
          data.cook = m[1];
          continue;
        }

        m = line.match(/^category\s*:\s*(.+)/i);
        if (m) {
          data.category = m[1];
          continue;
        }

        if (!data.name) {
          data.name = line.replace(/^#+\s*/, '');
        }
      } else {
        data[mode].push(clean(line));
      }
    }
    return data;
  }

  button.onclick = () => {
    ['home', 'detail', 'editor'].forEach(
      id => $(id).classList.add('hidden')
    );
    section.classList.remove('hidden');
    window.scrollTo(0, 0);
  };

  $('pasteBack').onclick = () => {
    section.classList.add('hidden');
    home.classList.remove('hidden');
  };

  $('parseRecipe').onclick = () => {
    const data = parse($('pastedRecipe').value);

    if (!data.name ||
        !data.ingredients.length ||
        !data.instructions.length) {
      alert(
        'Include a recipe title, Ingredients heading, ' +
        'and Instructions heading.'
      );
      return;
    }

    section.classList.add('hidden');
    add.click();

    for (const key of [
      'name', 'servings', 'prep', 'cook',
      'ingredients', 'instructions', 'notes'
    ]) {
      if (data[key] === undefined) continue;

      $(key).value = Array.isArray(data[key])
        ? data[key].join('\n')
        : data[key];
    }

    const category = $('category');
    if (data.category) {
      const option = [...category.options].find(
        o => o.value.toLowerCase() ===
          data.category.toLowerCase()
      );
      if (option) category.value = option.value;
    }

    $('editTitle').textContent =
      'Review imported recipe';
  };
})();
