/* Get references to DOM elements */
const categoryFilter = document.getElementById("categoryFilter");
const productsContainer = document.getElementById("productsContainer");
const selectedProductsList = document.getElementById("selectedProductsList");
const clearProductsButton = document.getElementById("clearProducts");
const generateRoutineButton = document.getElementById("generateRoutine");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");

/* This map keeps track of products the user has selected */
const selectedProducts = new Map();

/*
  This URL is for the class-hosted Cloudflare Worker.
  It must be replaced with the worker URL supplied for this class.
*/
const workerUrl = "https://lorealworker.rgyanmot.workers.dev/";

/* Keep the full conversation so follow-up questions have context */
let messages = [];

/* Show initial placeholder until user selects a category */
productsContainer.innerHTML = `
  <div class="placeholder-message">
    Select a category to view products
  </div>
`;

/* Load product data from JSON file */
async function loadProducts() {
  const response = await fetch("products.json");
  const data = await response.json();
  return data.products;
}

/* Add or remove a product when its card is clicked */
function toggleProduct(product) {
  if (selectedProducts.has(product.id)) {
    selectedProducts.delete(product.id);
  } else {
    selectedProducts.set(product.id, product);
  }

  updateSelectedProducts();
  updateSelectedCards();
}

/* Update the visual highlight on cards in the current grid */
function updateSelectedCards() {
  const cards = document.querySelectorAll(".product-card");

  cards.forEach((card) => {
    const productId = Number(card.dataset.productId);
    const isSelected = selectedProducts.has(productId);
    const selectButton = card.querySelector(".select-product");

    card.classList.toggle("selected", isSelected);
    selectButton.setAttribute("aria-pressed", isSelected.toString());
  });
}

/* Update the Selected Products section */
function updateSelectedProducts() {
  /* Save every change, including removing the final selected product */
  saveSelectedProducts();

  clearProductsButton.disabled = selectedProducts.size === 0;

  if (selectedProducts.size === 0) {
    selectedProductsList.innerHTML = `
      <p class="selected-placeholder">No products selected</p>
    `;
    return;
  }

  selectedProductsList.innerHTML = [...selectedProducts.values()]
    .map(
      (product) => `
        <div class="selected-product">
          <span>${product.brand} — ${product.name}</span>
          <button
            type="button"
            class="remove-product"
            data-product-id="${product.id}"
            aria-label="Remove ${product.name}"
          >
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      `
    )
    .join("");

  /* Add a click handler to each remove button */
  document.querySelectorAll(".remove-product").forEach((button) => {
    button.addEventListener("click", () => {
      const productId = Number(button.dataset.productId);
      selectedProducts.delete(productId);
      updateSelectedProducts();
      updateSelectedCards();
    });
  });
}

/* Create HTML for displaying product cards */
function displayProducts(products) {
  productsContainer.innerHTML = products
    .map(
      (product) => `
    <article class="product-card" data-product-id="${product.id}">
      <button
        type="button"
        class="select-product"
        aria-pressed="false"
        aria-label="Select ${product.name}"
      >
        <img src="${product.image}" alt="${product.name}">
        <span class="product-info">
          <span class="product-name">${product.name}</span>
          <span class="product-brand">${product.brand}</span>
        </span>
      </button>

      <button
        type="button"
        class="description-toggle"
        aria-expanded="false"
        aria-controls="description-${product.id}"
      >
        View description
      </button>
      <p class="product-description" id="description-${product.id}" hidden>
        ${product.description}
      </p>
    </article>
  `
    )
    .join("");

  /* Let users select cards with the native select button */
  document.querySelectorAll(".select-product").forEach((button) => {
    const card = button.closest(".product-card");
    const productId = Number(card.dataset.productId);
    const product = products.find((item) => item.id === productId);

    button.addEventListener("click", () => toggleProduct(product));
  });

  /* Toggle an accessible description panel for each product */
  document.querySelectorAll(".description-toggle").forEach((button) => {
    button.addEventListener("click", () => {
      const description = document.getElementById(button.getAttribute("aria-controls"));
      const isExpanded = button.getAttribute("aria-expanded") === "true";

      button.setAttribute("aria-expanded", (!isExpanded).toString());
      button.textContent = isExpanded ? "View description" : "Hide description";
      description.hidden = isExpanded;
    });
  });

  updateSelectedCards();
}

/* Filter and display products when category changes */
categoryFilter.addEventListener("change", async (e) => {
  const products = await loadProducts();
  const selectedCategory = e.target.value;

  /* filter() creates a new array containing only products
     where the category matches what the user selected */
  const filteredProducts = products.filter(
    (product) => product.category === selectedCategory
  );

  displayProducts(filteredProducts);
});

/* Convert AI text into safe HTML while keeping line breaks */
function formatMessage(text) {
  const safeText = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");

  return `<div class="chat-message">${safeText}</div>`;
}

/* Send the full messages array to the Cloudflare Worker */
async function sendMessages() {
  const response = await fetch(workerUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messages }),
  });

  if (!response.ok) {
    throw new Error("Unable to get a response from the routine advisor.");
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

/* Generate a routine using only the products in selectedProducts */
generateRoutineButton.addEventListener("click", async () => {
  if (selectedProducts.size === 0) {
    chatWindow.innerHTML = formatMessage(
      "Please select at least one product before generating a routine."
    );
    return;
  }

  /* Send only the fields needed by the AI */
  const selectedProductData = [...selectedProducts.values()].map((product) => ({
    name: product.name,
    brand: product.brand,
    category: product.category,
    description: product.description,
  }));

  /* Reset conversation history for a new routine */
  messages = [
    {
      role: "system",
      content:
        "You are a L'Oréal skincare and beauty advisor. Create a clear, personalized routine using the selected products. Explain the order to use the products and give brief, helpful guidance.",
    },
  ];

  const userMessage = `Create a personalized routine using only these selected products:\n${JSON.stringify(
    selectedProductData,
    null,
    2
  )}`;

  messages.push({ role: "user", content: userMessage });
  chatWindow.innerHTML = formatMessage("Creating your personalized routine...");

  try {
    const reply = await sendMessages();
    messages.push({ role: "assistant", content: reply });
    chatWindow.innerHTML = formatMessage(reply);
  } catch (error) {
    chatWindow.innerHTML = formatMessage(error.message);
  }
});

/* Chat form submission handler for follow-up questions */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const userInput = document.getElementById("userInput");
  const question = userInput.value.trim();

  if (question === "") return;

  if (messages.length === 0) {
    messages.push({
      role: "system",
      content:
        "You are a L'Oréal skincare and beauty advisor. Give clear, helpful, and personalized beauty advice.",
    });
  }

  messages.push({ role: "user", content: question });
  chatWindow.innerHTML += formatMessage(`You: ${question}`);
  chatWindow.innerHTML += formatMessage("Thinking...");
  userInput.value = "";

  try {
    const reply = await sendMessages();
    messages.push({ role: "assistant", content: reply });

    chatWindow.innerHTML = chatWindow.innerHTML.replace(
      formatMessage("Thinking..."),
      ""
    );
    chatWindow.innerHTML += formatMessage(reply);
  } catch (error) {
    chatWindow.innerHTML = chatWindow.innerHTML.replace(
      formatMessage("Thinking..."),
      ""
    );
    chatWindow.innerHTML += formatMessage(error.message);
  }

  chatWindow.scrollTop = chatWindow.scrollHeight;
});

/* Store selected products in the browser so they remain after a reload */
const storageKey = "lorealSelectedProducts";

/* Save the selected product objects to localStorage */
function saveSelectedProducts() {
  const productsToSave = [...selectedProducts.values()];
  localStorage.setItem(storageKey, JSON.stringify(productsToSave));
}

/* Restore saved products when the page is opened again */
async function restoreSelectedProducts() {
  const savedProducts = localStorage.getItem(storageKey);

  if (savedProducts) {
    try {
      const products = JSON.parse(savedProducts);

      products.forEach((product) => {
        selectedProducts.set(product.id, product);
      });
    } catch (error) {
      /* Remove damaged saved data so the app can start normally */
      localStorage.removeItem(storageKey);
    }
  }

  updateSelectedProducts();
  updateSelectedCards();
}

/* Clear all selections */
clearProductsButton.addEventListener("click", () => {
  selectedProducts.clear();
  updateSelectedProducts();
  updateSelectedCards();

  /* Also clear from localStorage */
  localStorage.removeItem(storageKey);
});

/* On initial load, check localStorage for any previously selected products */
restoreSelectedProducts();

/* Start the Selected Products section with an empty state */
updateSelectedProducts();
