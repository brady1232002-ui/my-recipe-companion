
/*
 * My Recipe Companion - Photo to Recipe v5
 * OpenAI Vision via private Cloudflare Worker
 *
 * Never put API keys or scanner tokens in this file.
 */

(() => {
  "use strict";

  // STEP 1: Replace this with your Worker URL.
  // Do NOT add /scan at the end.
  const WORKER_URL =
    "https://my-recipe-ai.brady1232002.workers.dev/";

  const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
  const MAX_DIMENSION = 1800;

  const $ = id => document.getElementById(id);

  const add = $("add");
  const home = $("home");

  if (!add || !home || $("photoImportBtn")) return;

  let busy = false;
  let scannerToken = "";
  let scannedRecipe = null;
  let previewURL = "";

  const button = document.createElement("button");
  button.id = "photoImportBtn";
  button.className = "btn alt";
  button.textContent = "📸 Photo to Recipe";
  add.after(button);

  const panel = document.createElement("section");
  panel.id = "photoImportPanel";
  panel.className = "hidden";

  panel.innerHTML = `
    <button class="btn alt" id="photoBack">
      ← Cookbook
    </button>

    <h2>📸 AI Photo to Recipe</h2>

    <p>
      Upload a recipe card, cookbook page,
      or screenshot. AI will organize it
      into an editable recipe.
    </p>

    <label for="recipeImage">
      Choose recipe image
    </label>

    <input
      id="recipeImage"
      type="file"
      accept="image/png,image/jpeg,image/webp,image/gif"
    >

    <img
      id="recipePreview"
      alt="Selected recipe image"
      style="
        display:none;
        width:100%;
        max-height:350px;
        object-fit:contain;
        margin:15px 0;
        border-radius:12px;
      "
    >

    <div style="margin:14px 0">
      <button class="btn" id="readPhoto">
        ✨ Scan with AI
      </button>
    </div>

    <p id="ocrStatus" role="status"
      aria-live="polite">
      Choose a photo to begin.
    </p>

    <div id="aiReview" class="hidden">
      <h2>Review Your Recipe</h2>

      <p>
        Check all measurements and instructions
        against the original image before saving.
      </p>

      <label for="aiName">Recipe name</label>
      <input id="aiName" type="text">

      <label for="aiCategory">Category</label>
      <input id="aiCategory" type="text">

      <label for="aiServings">Servings</label>
      <input id="aiServings" type="number"
        min="1" step="1">

      <label for="aiPrep">Prep time (minutes)</label>
      <input id="aiPrep" type="number"
        min="0" step="1">

      <label for="aiCook">Cook time (minutes)</label>
      <input id="aiCook" type="number"
        min="0" step="1">

      <label for="aiIngredients">
        Ingredients (one per line)
      </label>
      <textarea id="aiIngredients"
        style="width:100%;min-height:220px">
      </textarea>

      <label for="aiInstructions">
        Directions (one step per line)
      </label>
      <textarea id="aiInstructions"
        style="width:100%;min-height:260px">
      </textarea>

      <label for="aiNotes">Notes and tips</label>
      <textarea id="aiNotes"
        style="width:100%;min-height:120px">
      </textarea>

      <div id="aiWarningsBox"
        class="hidden"
        style="
          margin:15px 0;
          padding:12px;
          border:1px solid #b88742;
          border-radius:10px;
        ">
        <strong>Items to double-check</strong>
        <ul id="aiWarnings"></ul>
      </div>

      <button class="btn" id="reviewPhoto"
        style="margin-top:18px">
        📖 Review in Recipe Editor
      </button>
    </div>
  `;

  home.parentNode.insertBefore(
    panel,
    home.nextSibling
  );

  function setStatus(message) {
    $("ocrStatus").textContent = message;
  }

  function showPanel() {
    ["home", "editor", "detail"].forEach(id => {
      const element = $(id);
      if (element) element.classList.add("hidden");
    });

    panel.classList.remove("hidden");
    window.scrollTo(0, 0);
  }

  button.onclick = showPanel;

  $("photoBack").onclick = () => {
    panel.classList.add("hidden");
    home.classList.remove("hidden");
    window.scrollTo(0, 0);
  };

  function resetReview() {
    scannedRecipe = null;
    $("aiReview").classList.add("hidden");
    $("aiWarningsBox").classList.add("hidden");
    $("aiWarnings").replaceChildren();
  }

  $("recipeImage").onchange = event => {
    const file = event.target.files?.[0];

    resetReview();

    if (previewURL) {
      URL.revokeObjectURL(previewURL);
      previewURL = "";
    }

    if (!file) {
      $("recipePreview").style.display = "none";
      setStatus("Choose a photo to begin.");
      return;
    }

    previewURL = URL.createObjectURL(file);
    $("recipePreview").src = previewURL;
    $("recipePreview").style.display = "block";

    setStatus("Photo selected. Ready to scan.");
  };

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(file);

      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };

      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error(
          "Could not open this image."
        ));
      };

      image.src = url;
    });
  }

  function canvasToBlob(canvas, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error(
          "Could not prepare the image."
        ));
      }, "image/jpeg", quality);
    });
  }

  function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () =>
        resolve(reader.result);

      reader.onerror = () =>
        reject(new Error(
          "Could not encode the image."
        ));

      reader.readAsDataURL(blob);
    });
  }

  async function prepareImage(file) {
    const image = await loadImage(file);

    const scale = Math.min(
      1,
      MAX_DIMENSION / Math.max(
        image.naturalWidth,
        image.naturalHeight
      )
    );

    const canvas = document.createElement("canvas");

    canvas.width = Math.max(
      1,
      Math.round(image.naturalWidth * scale)
    );

    canvas.height = Math.max(
      1,
      Math.round(image.naturalHeight * scale)
    );

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Canvas is unavailable.");
    }

    // White background prevents transparent
    // recipe cards from turning black.
    context.fillStyle = "#ffffff";
    context.fillRect(
      0, 0,
      canvas.width,
      canvas.height
    );

    context.drawImage(
      image,
      0, 0,
      canvas.width,
      canvas.height
    );

    // Try progressively smaller JPEG files.
    for (const quality of [0.9, 0.8, 0.65, 0.5]) {
      const blob = await canvasToBlob(
        canvas,
        quality
      );

      if (blob.size <= MAX_IMAGE_BYTES) {
        return blobToDataURL(blob);
      }
    }

    throw new Error(
      "Image is too large. Try a smaller photo."
    );
  }

  function listToText(value) {
    if (Array.isArray(value)) {
      return value.map(String).join("\n");
    }

    return typeof value === "string"
      ? value
      : "";
  }

  function fieldValue(value) {
    return value === null ||
      value === undefined
      ? ""
      : String(value);
  }

  function showReview(recipe) {
    scannedRecipe = recipe;

    $("aiName").value = fieldValue(
      recipe.name
    );

    $("aiCategory").value = fieldValue(
      recipe.category || "Dinner"
    );

    $("aiServings").value = fieldValue(
      recipe.servings
    );

    $("aiPrep").value = fieldValue(
      recipe.prep
    );

    $("aiCook").value = fieldValue(
      recipe.cook
    );

    $("aiIngredients").value = listToText(
      recipe.ingredients
    );

    $("aiInstructions").value = listToText(
      recipe.instructions
    );

    $("aiNotes").value = listToText(
      recipe.notes
    );

    const warnings = Array.isArray(
      recipe.warnings
    ) ? recipe.warnings : [];

    const warningList = $("aiWarnings");
    warningList.replaceChildren();

    for (const warning of warnings) {
      const item = document.createElement("li");
      item.textContent = String(warning);
      warningList.appendChild(item);
    }

    $("aiWarningsBox").classList.toggle(
      "hidden",
      warnings.length === 0
    );

    $("aiReview").classList.remove("hidden");

    setStatus(
      "Scan complete! Review the recipe below."
    );

    $("aiReview").scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  async function readError(response) {
    let details = {};

    try {
      details = await response.json();
    } catch {
      // Server may return an empty response.
    }

    if (response.status === 401) {
      scannerToken = "";

      throw new Error(
        "Scanner password rejected. " +
        "Try scanning again with the correct password."
      );
    }

    if (details.upstreamStatus) {
      throw new Error(
        "OpenAI request failed (status " +
        details.upstreamStatus + ")."
      );
    }

    throw new Error(
      details.error ||
      "Scanner request failed (HTTP " +
      response.status + ")."
    );
  }

  $("readPhoto").onclick = async () => {
    if (busy) return;

    const file = $("recipeImage").files?.[0];

    if (!file) {
      alert("Choose a recipe photo first.");
      return;
    }

    if (WORKER_URL.includes("YOUR-WORKER")) {
      setStatus(
        "Configure your Cloudflare Worker URL first."
      );
      return;
    }

    if (!scannerToken) {
      const entered = window.prompt(
        "Enter your private scanner test password.\n" +
        "Do not enter your OpenAI API key."
      );

      if (entered === null) return;

      scannerToken = entered.trim();

      if (!scannerToken) {
        setStatus("Scanner password is required.");
        return;
      }
    }

    busy = true;
    $("readPhoto").disabled = true;
    resetReview();

    try {
      setStatus("Preparing your recipe photo...");

      const image = await prepareImage(file);

      setStatus(
        "AI is reading ingredients and directions..."
      );

      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        90000
      );

      let response;

      try {
        response = await fetch(
          WORKER_URL.replace(/\/+$/, "") + "/scan",
          {
            method: "POST",
            headers: {
              "Authorization":
                "Bearer " + scannerToken,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ image }),
            signal: controller.signal,
            cache: "no-store"
          }
        );
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        await readError(response);
      }

      const result = await response.json();

      if (!result.success || !result.recipe) {
        throw new Error(
          "The scanner returned no recipe."
        );
      }

      showReview(result.recipe);

    } catch (error) {
      console.error("AI recipe scan:", error);

      if (error.name === "AbortError") {
        setStatus(
          "Scanning timed out. Please try again."
        );
      } else {
        setStatus(
          "Scan failed: " + error.message
        );
      }
    } finally {
      busy = false;
      $("readPhoto").disabled = false;
    }
  };

  function setEditorField(id, value) {
    const element = $(id);
    if (!element) return;

    if (element.tagName === "SELECT") {
      const matchingOption = Array.from(
        element.options
      ).find(option =>
        option.value.toLowerCase() ===
        String(value).toLowerCase() ||
        option.textContent.trim().toLowerCase() ===
        String(value).toLowerCase()
      );

      if (matchingOption) {
        element.value = matchingOption.value;
      }
    } else {
      element.value = value;
    }

    element.dispatchEvent(
      new Event("input", { bubbles: true })
    );

    element.dispatchEvent(
      new Event("change", { bubbles: true })
    );
  }

  $("reviewPhoto").onclick = () => {
    if (!scannedRecipe) {
      alert("Scan a recipe first.");
      return;
    }

    const name = $("aiName").value.trim();
    const ingredients =
      $("aiIngredients").value.trim();
    const instructions =
      $("aiInstructions").value.trim();

    if (!name || !ingredients || !instructions) {
      alert(
        "Recipe name, ingredients, and " +
        "directions are required."
      );
      return;
    }

    // Open the existing cookbook editor first.
    panel.classList.add("hidden");
    add.click();

    // Then populate its existing fields.
    setEditorField("name", name);

    setEditorField(
      "category",
      $("aiCategory").value.trim()
    );

    setEditorField(
      "servings",
      $("aiServings").value
    );

    setEditorField(
      "prep",
      $("aiPrep").value
    );

    setEditorField(
      "cook",
      $("aiCook").value
    );

    setEditorField(
      "ingredients",
      ingredients
    );

    setEditorField(
      "instructions",
      instructions
    );

    setEditorField(
      "notes",
      $("aiNotes").value.trim()
    );

    if ($("editTitle")) {
      $("editTitle").textContent =
        "Review Scanned Recipe";
    }

    window.scrollTo(0, 0);
  };

})();
