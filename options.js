// options.js

async function loadSettings() {
  const s = await chrome.storage.sync.get([
    "owner",
    "repo",
    "branch",
    "savePath",
    "autoSaveEnabled",
    "autoSaveInterval",
    "autoSaveCleanOld",
  ]);
  if (s.owner) document.getElementById("owner").value = s.owner;
  if (s.repo) document.getElementById("repo").value = s.repo;
  if (s.branch) document.getElementById("branch").value = s.branch;
  if (s.savePath) document.getElementById("savePath").value = s.savePath;
  if (s.autoSaveEnabled !== undefined)
    document.getElementById("autoSaveEnabled").checked = s.autoSaveEnabled;
  if (s.autoSaveInterval)
    document.getElementById("autoSaveInterval").value = s.autoSaveInterval;
  if (s.autoSaveCleanOld !== undefined)
    document.getElementById("autoSaveCleanOld").checked = s.autoSaveCleanOld;
}

async function loadAuth() {
  const { authenticated, user } = await chrome.runtime.sendMessage({
    type: "GET_AUTH_STATUS",
  });
  const authedView = document.getElementById("authed-view");
  const unauthedView = document.getElementById("unauthed-view");
  const pendingView = document.getElementById("pending-view");

  pendingView.style.display = "none";

  if (authenticated && user) {
    document.getElementById("opt-avatar").src = user.avatar_url;
    document.getElementById("opt-login").textContent = `@${user.login}`;
    authedView.style.display = "block";
    unauthedView.style.display = "none";
  } else {
    authedView.style.display = "none";
    unauthedView.style.display = "block";
  }
}

function showStatus(msg, type) {
  const el = document.getElementById("save-status");
  el.textContent = msg;
  el.className = `status show ${type}`;
  setTimeout(() => el.classList.remove("show"), 3000);
}

document
  .getElementById("btn-save-settings")
  .addEventListener("click", async () => {
    const owner = document.getElementById("owner").value.trim();
    const repo = document.getElementById("repo").value.trim();
    const branch = document.getElementById("branch").value.trim() || "main";
    const savePath =
      document.getElementById("savePath").value.trim() || "drawings/";
    const autoSaveEnabled = document.getElementById("autoSaveEnabled").checked;
    const autoSaveInterval = parseInt(
      document.getElementById("autoSaveInterval").value,
      10,
    );
    const autoSaveCleanOld =
      document.getElementById("autoSaveCleanOld").checked;

    if (!owner || !repo) {
      showStatus("Owner and repository are required.", "error");
      return;
    }

    await chrome.storage.sync.set({
      owner,
      repo,
      branch,
      savePath,
      autoSaveEnabled,
      autoSaveInterval,
      autoSaveCleanOld,
    });

    // Notify background to update auto-save timer
    chrome.runtime.sendMessage({ type: "UPDATE_AUTOSAVE" });

    showStatus("Settings saved!", "success");
  });

document
  .getElementById("btn-connect-opt")
  .addEventListener("click", async () => {
    const btn = document.getElementById("btn-connect-opt");
    const unauthedView = document.getElementById("unauthed-view");
    const pendingView = document.getElementById("pending-view");

    btn.disabled = true;
    btn.textContent = "Connecting…";

    chrome.runtime.sendMessage({ type: "START_AUTH" }, (response) => {
      if (chrome.runtime.lastError || response?.error) {
        btn.disabled = false;
        btn.textContent = "Connect GitHub";
        showStatus(
          response?.error || "Auth failed. Check your OAuth App settings.",
          "error",
        );
        return;
      }

      // Show the code immediately
      if (response?.user_code) {
        document.getElementById("opt-user-code").textContent =
          response.user_code;
      }
      unauthedView.style.display = "none";
      pendingView.style.display = "block";

      // Poll storage until token appears
      const check = setInterval(async () => {
        const { authenticated } = await chrome.runtime.sendMessage({
          type: "GET_AUTH_STATUS",
        });
        if (authenticated) {
          clearInterval(check);
          btn.disabled = false;
          btn.textContent = "Connect GitHub";
          loadAuth();
        }
      }, 2000);
    });
  });

document.getElementById("btn-signout").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "SIGN_OUT" });
  loadAuth();
});

// Init
loadSettings();
loadAuth();
loadStatistics();
loadTheme();

// ─── Theme Toggle ────────────────────────────────────────────────────────────

async function loadTheme() {
  try {
    const { theme } = await chrome.storage.local.get("theme");
    applyTheme(theme || "dark");
  } catch (err) {
    applyTheme("dark");
  }
}

function applyTheme(theme) {
  if (theme === "light") {
    document.body.classList.add("theme-light");
    const iconLight = document.querySelector(".theme-icon-light");
    const iconDark = document.querySelector(".theme-icon-dark");
    if (iconLight) iconLight.style.display = "none";
    if (iconDark) iconDark.style.display = "block";
  } else {
    document.body.classList.remove("theme-light");
    const iconLight = document.querySelector(".theme-icon-light");
    const iconDark = document.querySelector(".theme-icon-dark");
    if (iconLight) iconLight.style.display = "block";
    if (iconDark) iconDark.style.display = "none";
  }
}

document
  .getElementById("btn-theme-toggle")
  ?.addEventListener("click", async () => {
    const currentTheme =
      (await chrome.storage.local.get("theme")).theme || "dark";
    const newTheme = currentTheme === "dark" ? "light" : "dark";
    await chrome.storage.local.set({ theme: newTheme });
    applyTheme(newTheme);
  });

// Load statistics
async function loadStatistics() {
  const loadingEl = document.getElementById("stats-loading");
  const contentEl = document.getElementById("stats-content");
  const refreshBtn = document.getElementById("btn-refresh-stats");

  try {
    const { authenticated } = await chrome.runtime.sendMessage({
      type: "GET_AUTH_STATUS",
    });
    if (!authenticated) {
      loadingEl.textContent = "Connect GitHub to view statistics.";
      return;
    }

    const response = await chrome.runtime.sendMessage({
      type: "GET_STATISTICS",
    });

    if (response?.error) {
      loadingEl.textContent = `Error: ${response.error}`;
      return;
    }

    const stats = response.stats;

    // Update UI
    document.getElementById("stat-total-files").textContent = stats.totalFiles;
    document.getElementById("stat-total-size").textContent = formatSize(
      stats.totalSize,
    );
    document.getElementById("stat-last-saved").textContent =
      stats.lastSaved || "Never";
    document.getElementById("stat-avg-size").textContent = formatSize(
      stats.averageSize,
    );

    loadingEl.style.display = "none";
    contentEl.style.display = "block";
    refreshBtn.style.display = "block";
  } catch (err) {
    loadingEl.textContent = `Failed to load: ${err.message}`;
  }
}

document
  .getElementById("btn-refresh-stats")
  .addEventListener("click", loadStatistics);

// Format file size
function formatSize(bytes) {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── AI Settings ──────────────────────────────────────────────────────────────

async function loadAISettings() {
  const settings = await chrome.storage.local.get([
    "aiApiKey",
    "aiModel",
    "aiMaxTokens",
    "aiTemperature",
    "aiContextMode",
  ]);
  if (settings.aiApiKey) {
    document.getElementById("aiApiKey").value = settings.aiApiKey;
    loadModels(settings.aiModel);
  }
  const maxTokens = settings.aiMaxTokens || "";
  document.getElementById("aiMaxTokens").value = maxTokens;
  document.getElementById("aiMaxTokensValue").textContent =
    maxTokens || "no limit";
  if (settings.aiTemperature !== undefined) {
    document.getElementById("aiTemperature").value = settings.aiTemperature;
    document.getElementById("aiTemperatureValue").textContent =
      settings.aiTemperature;
  }
  const contextRadio = document.querySelector(
    `input[name="aiContextMode"][value="${settings.aiContextMode || "auto"}"]`,
  );
  if (contextRadio) contextRadio.checked = true;
}

let allModels = [];
let selectedModelValue = "";

function renderModelItem(m) {
  const div = document.createElement("div");
  div.dataset.modelId = m.id;
  const price = m.pricing;
  let priceLabel = "";
  if (price) {
    const promptCost = parseFloat(price.prompt || 0);
    if (promptCost === 0) priceLabel = "free";
    else if (promptCost > 0)
      priceLabel = `$${(promptCost * 1000000).toFixed(2)}/M`;
  }
  const popular = [
    "openai/gpt-4o",
    "openai/gpt-4o-mini",
    "openai/gpt-4.1",
    "openai/gpt-4.1-mini",
    "openai/gpt-4.1-nano",
    "anthropic/claude-sonnet-4",
    "anthropic/claude-3.5-sonnet",
    "anthropic/claude-3-haiku",
    "google/gemini-2.5-pro-preview",
    "google/gemini-2.0-flash-001",
    "meta-llama/llama-4-maverick",
    "meta-llama/llama-3.3-70b-instruct",
    "deepseek/deepseek-r1",
    "deepseek/deepseek-chat",
  ];
  const isPopular = popular.includes(m.id);
  const isSelected = m.id === selectedModelValue;

  div.style.cssText = `
    padding: 7px 12px; cursor: pointer; font-size: 12px; font-family: 'DM Sans', sans-serif;
    display: flex; justify-content: space-between; align-items: center; gap: 8px;
    ${isSelected ? "background: #1e3a5f; color: #4f8ef7;" : "color: #e8edf2;"}
  `;
  div.addEventListener("mouseenter", () => {
    if (!isSelected) div.style.background = "#1a1f25";
  });
  div.addEventListener("mouseleave", () => {
    if (m.id !== selectedModelValue)
      div.style.background = isSelected ? "#1e3a5f" : "";
  });

  const nameSpan = document.createElement("span");
  nameSpan.style.cssText =
    "overflow: hidden; text-overflow: ellipsis; white-space: nowrap;";
  nameSpan.textContent = (isPopular ? "\u2605 " : "") + (m.name || m.id);

  const metaSpan = document.createElement("span");
  metaSpan.style.cssText =
    "font-size: 10px; color: #6b7685; white-space: nowrap; flex-shrink: 0;";
  metaSpan.textContent = priceLabel;

  div.appendChild(nameSpan);
  div.appendChild(metaSpan);

  div.addEventListener("click", () => {
    selectedModelValue = m.id;
    document.getElementById("aiModel").value = m.id;
    document.getElementById("aiModelTrigger").textContent = m.name || m.id;
    closeModelDropdown();
  });

  return div;
}

function filterModels(query) {
  const list = document.getElementById("aiModelList");
  if (!list) return;
  list.innerHTML = "";

  const q = query.toLowerCase().trim();
  const filtered = q
    ? allModels.filter(
        (m) =>
          (m.id || "").toLowerCase().includes(q) ||
          (m.name || "").toLowerCase().includes(q),
      )
    : allModels;

  if (filtered.length === 0) {
    list.innerHTML =
      '<div style="padding: 12px; text-align: center; color: #6b7685; font-size: 12px;">No models found</div>';
    return;
  }

  const grouped = {};
  for (const m of filtered) {
    const provider = m.id.split("/")[0] || "other";
    if (!grouped[provider]) grouped[provider] = [];
    grouped[provider].push(m);
  }

  const providerOrder = [
    "openai",
    "anthropic",
    "google",
    "meta-llama",
    "deepseek",
    "mistralai",
    "x-ai",
  ];
  const sortedProviders = Object.keys(grouped).sort((a, b) => {
    const ai = providerOrder.indexOf(a);
    const bi = providerOrder.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  });

  for (const provider of sortedProviders) {
    const header = document.createElement("div");
    header.style.cssText =
      "padding: 6px 12px 3px; font-size: 10px; font-weight: 600; color: #6b7685; text-transform: uppercase; letter-spacing: 0.5px;";
    header.textContent =
      provider.charAt(0).toUpperCase() + provider.slice(1).replace(/-/g, " ");
    list.appendChild(header);

    for (const m of grouped[provider]) {
      list.appendChild(renderModelItem(m));
    }
  }
}

function closeModelDropdown() {
  const dd = document.getElementById("aiModelDropdown");
  if (dd) dd.style.display = "none";
}

document.getElementById("aiModelTrigger")?.addEventListener("click", () => {
  const dd = document.getElementById("aiModelDropdown");
  const isOpen = dd.style.display === "flex";
  dd.style.display = isOpen ? "none" : "flex";
  if (!isOpen) {
    const search = document.getElementById("aiModelSearch");
    if (search) {
      search.value = "";
      search.focus();
      filterModels("");
    }
  }
});

document.getElementById("aiModelSearch")?.addEventListener("input", (e) => {
  filterModels(e.target.value);
});

document.addEventListener("click", (e) => {
  const container = document.getElementById("aiModelSelect");
  if (container && !container.contains(e.target)) closeModelDropdown();
});

async function loadModels(selectedModel) {
  const trigger = document.getElementById("aiModelTrigger");
  const hiddenInput = document.getElementById("aiModel");

  const savedKey = document.getElementById("aiApiKey")?.value?.trim();
  if (!savedKey) {
    if (trigger) trigger.textContent = "Enter API key first";
    return;
  }

  if (trigger) trigger.textContent = "Loading models...";
  selectedModelValue = selectedModel || "";

  const resp = await chrome.runtime.sendMessage({
    type: "AI_GET_MODELS",
    apiKey: savedKey,
  });

  if (!resp?.ok || !resp.models?.length) {
    allModels = [
      { id: "openai/gpt-4o", name: "GPT-4o (default)", pricing: null },
    ];
    if (trigger) trigger.textContent = "GPT-4o (default)";
    if (hiddenInput) hiddenInput.value = "openai/gpt-4o";
    selectedModelValue = "openai/gpt-4o";
    return;
  }

  const popular = [
    "openai/gpt-4o",
    "openai/gpt-4o-mini",
    "openai/gpt-4.1",
    "openai/gpt-4.1-mini",
    "openai/gpt-4.1-nano",
    "anthropic/claude-sonnet-4",
    "anthropic/claude-3.5-sonnet",
    "anthropic/claude-3-haiku",
    "google/gemini-2.5-pro-preview",
    "google/gemini-2.0-flash-001",
    "meta-llama/llama-4-maverick",
    "meta-llama/llama-3.3-70b-instruct",
    "deepseek/deepseek-r1",
    "deepseek/deepseek-chat",
  ];

  allModels = resp.models.sort((a, b) => {
    const pa = popular.indexOf(a.id);
    const pb = popular.indexOf(b.id);
    if (pa !== -1 && pb !== -1) return pa - pb;
    if (pa !== -1) return -1;
    if (pb !== -1) return 1;
    return (a.name || a.id).localeCompare(b.name || b.id);
  });

  const match = selectedModel && allModels.find((m) => m.id === selectedModel);
  if (match) {
    selectedModelValue = match.id;
    if (trigger) trigger.textContent = match.name || match.id;
    if (hiddenInput) hiddenInput.value = match.id;
  } else {
    const defaultModel =
      allModels.find((m) => m.id === "openai/gpt-4o") || allModels[0];
    selectedModelValue = defaultModel.id;
    if (trigger) trigger.textContent = defaultModel.name || defaultModel.id;
    if (hiddenInput) hiddenInput.value = defaultModel.id;
  }
}

function showAIStatus(msg, type) {
  const el = document.getElementById("ai-save-status");
  el.textContent = msg;
  el.className = `status show ${type}`;
  setTimeout(() => el.classList.remove("show"), 3000);
}

document.getElementById("aiMaxTokens")?.addEventListener("input", (e) => {
  document.getElementById("aiMaxTokensValue").textContent =
    e.target.value && parseInt(e.target.value, 10) > 0
      ? e.target.value
      : "no limit";
});

document.getElementById("aiTemperature")?.addEventListener("input", (e) => {
  document.getElementById("aiTemperatureValue").textContent = e.target.value;
});

document
  .getElementById("btn-save-ai-settings")
  ?.addEventListener("click", async () => {
    const apiKey = document.getElementById("aiApiKey").value.trim();
    const model = document.getElementById("aiModel").value;
    const maxTokens = parseInt(
      document.getElementById("aiMaxTokens").value,
      10,
    );
    const temperature = parseFloat(
      document.getElementById("aiTemperature").value,
    );
    const contextMode =
      document.querySelector('input[name="aiContextMode"]:checked')?.value ||
      "auto";

    await chrome.storage.local.set({
      aiApiKey: apiKey,
      aiModel: model,
      aiMaxTokens: maxTokens > 0 ? maxTokens : null,
      aiTemperature: temperature,
      aiContextMode: contextMode,
    });

    showAIStatus("AI settings saved!", "success");
  });

document
  .getElementById("btn-test-ai-key")
  ?.addEventListener("click", async () => {
    const btn = document.getElementById("btn-test-ai-key");
    const statusEl = document.getElementById("ai-key-status");
    const apiKey = document.getElementById("aiApiKey").value.trim();

    if (!apiKey) {
      statusEl.textContent = "Enter an API key first";
      statusEl.style.display = "block";
      statusEl.style.color = "#f76f6f";
      return;
    }

    btn.disabled = true;
    btn.textContent = "Testing...";
    statusEl.style.display = "none";

    const resp = await chrome.runtime.sendMessage({
      type: "AI_TEST_KEY",
      apiKey,
    });

    btn.disabled = false;
    btn.textContent = "Test";
    statusEl.style.display = "block";

    if (resp?.ok) {
      statusEl.textContent = "API key is valid!";
      statusEl.style.color = "#4ade80";
      loadModels(document.getElementById("aiModel")?.value);
    } else {
      statusEl.textContent = `Invalid: ${resp?.error || "unknown error"}`;
      statusEl.style.color = "#f76f6f";
    }
  });

document.getElementById("btn-refresh-models")?.addEventListener("click", () => {
  loadModels(document.getElementById("aiModel")?.value);
});

loadAISettings();
