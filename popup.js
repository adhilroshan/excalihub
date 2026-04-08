// popup.js

const STATES = [
  "not-configured", "not-authed", "auth-pending",
  "not-on-excalidraw", "ready"
];

function showState(name) {
  STATES.forEach((s) => {
    document.getElementById(`state-${s}`)?.classList.toggle("active", s === name);
  });
}

function showToast(msg, type = "success") {
  const el = document.getElementById("toast");
  el.innerHTML = msg;
  el.className = `toast show ${type}`;
  if (type === "success") setTimeout(() => el.classList.remove("show"), 5000);
}

function formatDate(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function buildFilename(title) {
  return `${title || "untitled"}_${formatDate()}.excalidraw`;
}

async function getSettings() {
  return chrome.storage.sync.get(["owner", "repo", "branch", "savePath"]);
}

async function isConfigured() {
  const s = await getSettings();
  return !!(s.owner && s.repo);
}

async function getActiveExcalidrawTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]?.url?.includes("excalidraw.com")) return tabs[0];
  return null;
}

// ─── Init ────────────────────────────────────────────────────────────────────

async function init() {
  const configured = await isConfigured();
  if (!configured) { showState("not-configured"); return; }

  const { authenticated, user } = await chrome.runtime.sendMessage({ type: "GET_AUTH_STATUS" });
  if (!authenticated) { showState("not-authed"); return; }

  const tab = await getActiveExcalidrawTab();
  if (!tab) {
    populateUserChip(user, "1");
    showState("not-on-excalidraw");
    return;
  }

  populateUserChip(user, "2");
  const settings = await getSettings();
  document.getElementById("save-path-label").textContent =
    `${settings.owner}/${settings.repo} › ${settings.savePath || "drawings/"}`;

  // Pre-fill filename from scene title
  try {
    const result = await chrome.tabs.sendMessage(tab.id, { type: "GET_SCENE" });
    if (result?.title) {
      document.getElementById("filename-input").value = buildFilename(result.title);
    } else {
      document.getElementById("filename-input").value = buildFilename();
    }
  } catch (_) {
    document.getElementById("filename-input").value = buildFilename();
  }

  showState("ready");
}

function populateUserChip(user, suffix) {
  if (!user) return;
  const img = document.getElementById(`user-avatar-${suffix}`);
  const login = document.getElementById(`user-login-${suffix}`);
  if (img) img.src = user.avatar_url;
  if (login) login.textContent = `@${user.login}`;
}

// ─── Event Listeners ─────────────────────────────────────────────────────────

document.getElementById("btn-settings").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById("btn-open-settings").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById("btn-connect").addEventListener("click", async () => {
  showState("auth-pending");

  // Ask background to kick off device flow
  // We get back the user_code immediately; background polls for token
  chrome.runtime.sendMessage({ type: "START_AUTH" }, (response) => {
    if (chrome.runtime.lastError || response?.error) {
      showState("not-authed");
      return;
    }
    if (response?.user_code) {
      document.getElementById("user-code").textContent = response.user_code;
    }
    // Once token lands, background stores it; we poll storage to detect it
    waitForAuth();
  });
});

async function waitForAuth() {
  const check = setInterval(async () => {
    const { authenticated, user } = await chrome.runtime.sendMessage({ type: "GET_AUTH_STATUS" });
    if (authenticated) {
      clearInterval(check);
      populateUserChip(user, "2");
      init();
    }
  }, 2000);
}

document.getElementById("btn-open-excalidraw").addEventListener("click", () => {
  chrome.tabs.create({ url: "https://excalidraw.com" });
});

document.getElementById("btn-save").addEventListener("click", async () => {
  const btn = document.getElementById("btn-save");
  const fileName = document.getElementById("filename-input").value.trim();
  if (!fileName) { showToast("Enter a filename.", "error"); return; }

  btn.disabled = true;
  btn.innerHTML = `<div class="spinner show" style="display:block;border-top-color:#fff;border-color:rgba(255,255,255,0.2)"></div> Saving…`;

  try {
    const tab = await getActiveExcalidrawTab();
    if (!tab) throw new Error("No Excalidraw tab found.");

    const sceneResult = await chrome.tabs.sendMessage(tab.id, { type: "GET_SCENE" });
    if (sceneResult?.error) throw new Error(sceneResult.error);

    const settings = await getSettings();
    const saveResult = await chrome.runtime.sendMessage({
      type: "SAVE_SCENE",
      scene: sceneResult.scene,
      fileName,
      settings: {
        owner:    settings.owner,
        repo:     settings.repo,
        branch:   settings.branch || "main",
        savePath: settings.savePath || "drawings/",
      },
    });

    if (saveResult?.error) throw new Error(saveResult.error);

    showToast(
      `✓ Saved → <a href="${saveResult.url}" target="_blank">${saveResult.path}</a>`,
      "success"
    );
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 10.5v1.5h10V10.5M7 2v7M4.5 6.5L7 9l2.5-2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg> Save to GitHub`;
  }
});

// ─── Boot ────────────────────────────────────────────────────────────────────
init();
