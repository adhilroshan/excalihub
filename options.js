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
