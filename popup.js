// popup.js

const STATES = [
  "not-configured",
  "not-authed",
  "auth-pending",
  "not-on-excalidraw",
  "ready",
];

function showState(name) {
  STATES.forEach((s) => {
    document
      .getElementById(`state-${s}`)
      ?.classList.toggle("active", s === name);
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
  if (!configured) {
    showState("not-configured");
    return;
  }

  const { authenticated, user } = await chrome.runtime.sendMessage({
    type: "GET_AUTH_STATUS",
  });
  if (!authenticated) {
    showState("not-authed");
    return;
  }

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
      document.getElementById("filename-input").value = buildFilename(
        result.title,
      );
    } else {
      document.getElementById("filename-input").value = buildFilename();
    }
  } catch (_) {
    document.getElementById("filename-input").value = buildFilename();
  }

  showState("ready");
}

// ─── Theme Toggle ────────────────────────────────────────────────────────────

async function applyTheme(theme) {
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

async function loadTheme() {
  try {
    const { theme } = await chrome.storage.local.get("theme");
    applyTheme(theme || "dark");
  } catch (err) {
    applyTheme("dark");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const themeToggleBtn = document.getElementById("btn-theme-toggle");
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", async () => {
      const currentTheme =
        (await chrome.storage.local.get("theme")).theme || "dark";
      const newTheme = currentTheme === "dark" ? "light" : "dark";
      await chrome.storage.local.set({ theme: newTheme });
      applyTheme(newTheme);
    });
  }
  loadTheme();
});

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
    const { authenticated, user } = await chrome.runtime.sendMessage({
      type: "GET_AUTH_STATUS",
    });
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
  if (!fileName) {
    showToast("Enter a filename.", "error");
    return;
  }

  btn.disabled = true;
  btn.innerHTML = `<div class="spinner show" style="display:block;border-top-color:#fff;border-color:rgba(255,255,255,0.2)"></div> Saving…`;

  try {
    const tab = await getActiveExcalidrawTab();
    if (!tab) throw new Error("No Excalidraw tab found.");

    const sceneResult = await chrome.tabs.sendMessage(tab.id, {
      type: "GET_SCENE",
    });
    if (sceneResult?.error) throw new Error(sceneResult.error);

    const settings = await getSettings();
    const saveResult = await chrome.runtime.sendMessage({
      type: "SAVE_SCENE",
      scene: sceneResult.scene,
      fileName,
      settings: {
        owner: settings.owner,
        repo: settings.repo,
        branch: settings.branch || "main",
        savePath: settings.savePath || "drawings/",
      },
    });

    if (saveResult?.error) throw new Error(saveResult.error);

    // Check if there's a conflict
    if (saveResult.conflict) {
      // Show conflict dialog
      const choice = await showConflictDialog(fileName);

      if (choice === "cancel") {
        showToast("Save cancelled.", "success");
        return;
      } else if (choice === "overwrite") {
        // Overwrite the file
        const overwriteResult = await chrome.runtime.sendMessage({
          type: "OVERWRITE_SCENE",
          scene: sceneResult.scene,
          fileName,
          settings: {
            owner: settings.owner,
            repo: settings.repo,
            branch: settings.branch || "main",
            savePath: settings.savePath || "drawings/",
          },
          existingSha: saveResult.existingSha,
        });

        if (overwriteResult?.error) throw new Error(overwriteResult.error);
        showToast(
          `✓ Updated → <a href="${overwriteResult.url}" target="_blank">${overwriteResult.path}</a>`,
          "success",
        );
      } else if (choice === "rename") {
        // Auto-rename with _v2 suffix
        const nameParts =
          fileName.lastIndexOf(".") > -1
            ? [
                fileName.slice(0, fileName.lastIndexOf(".")),
                fileName.slice(fileName.lastIndexOf(".")),
              ]
            : [fileName, ".excalidraw"];

        const newFileName = `${nameParts[0]}_v2${nameParts[1] || ".excalidraw"}`;
        document.getElementById("filename-input").value = newFileName;
        showToast(
          `File renamed to ${newFileName}. Click Save again.`,
          "success",
        );
        return; // Don't reset button yet
      }
    } else if (saveResult?.ok) {
      showToast(
        `✓ Saved → <a href="${saveResult.url}" target="_blank">${saveResult.path}</a>`,
        "success",
      );
    }
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 10.5v1.5h10V10.5M7 2v7M4.5 6.5L7 9l2.5-2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg> Save to GitHub`;
  }
});

// Show conflict dialog
function showConflictDialog(fileName) {
  return new Promise((resolve) => {
    // Create overlay
    const overlay = document.createElement("div");
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;

    // Create dialog
    const dialog = document.createElement("div");
    dialog.style.cssText = `
      background: #161a1f;
      border: 1px solid #252b33;
      border-radius: 10px;
      padding: 20px;
      max-width: 340px;
      width: 90%;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    `;

    dialog.innerHTML = `
      <div style="font-size: 14px; font-weight: 600; margin-bottom: 8px;">File Already Exists</div>
      <div style="font-size: 12px; color: #6b7685; margin-bottom: 16px; line-height: 1.5;">
        <strong style="color: #e8edf2;">${fileName}</strong> already exists in your repository. What would you like to do?
      </div>
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <button id="conflict-overwrite" style="
          padding: 10px 14px;
          border-radius: 8px;
          border: none;
          background: #4f8ef7;
          color: #fff;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          font-family: 'DM Sans', sans-serif;
        ">Overwrite Existing File</button>
        <button id="conflict-rename" style="
          padding: 10px 14px;
          border-radius: 8px;
          border: 1px solid #252b33;
          background: #0d0f11;
          color: #e8edf2;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          font-family: 'DM Sans', sans-serif;
        ">Save as New Version (_v2)</button>
        <button id="conflict-cancel" style="
          padding: 10px 14px;
          border-radius: 8px;
          border: 1px solid #252b33;
          background: transparent;
          color: #6b7685;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          font-family: 'DM Sans', sans-serif;
        ">Cancel</button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // Event listeners
    document
      .getElementById("conflict-overwrite")
      .addEventListener("click", () => {
        overlay.remove();
        resolve("overwrite");
      });

    document.getElementById("conflict-rename").addEventListener("click", () => {
      overlay.remove();
      resolve("rename");
    });

    document.getElementById("conflict-cancel").addEventListener("click", () => {
      overlay.remove();
      resolve("cancel");
    });

    // Close on overlay click
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        overlay.remove();
        resolve("cancel");
      }
    });
  });
}

// ─── Markdown renderer (shared) ─────────────────────────────────────────────

function renderMarkdownInto(el, text) {
  el.innerHTML = "";
  const div = document.createElement("div");
  div.style.cssText = "font-size:11px;line-height:1.6;word-break:break-word;";
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(
      /`([^`]+)`/g,
      `<code style="font-family:'DM Mono',monospace;font-size:10px;background:rgba(0,0,0,.2);border-radius:3px;padding:1px 4px;">$1</code>`,
    )
    .replace(/^[-•] (.+)$/gm, "<li>$1</li>")
    .replace(
      /(<li>.*<\/li>)/gs,
      "<ul style='margin:3px 0 3px 14px;padding:0'>$1</ul>",
    )
    .replace(/\n{2,}/g, "</p><p style='margin:0 0 4px'>")
    .replace(/\n/g, "<br>");
  div.innerHTML = "<p style='margin:0 0 4px'>" + html + "</p>";
  el.appendChild(div);
}

// ─── AI Chat Panel ────────────────────────────────────────────────────────────

let popupChatState = {
  history: [],
  isStreaming: false,
  contextIncluded: true,
  initialized: false,
};

const SEND_DEBOUNCE_MS = 500;
let lastSendTime = 0;

function showChatPanel() {
  const section = document.getElementById("ai-chat-section");
  if (section) section.style.display = "block";
  const input = document.getElementById("ai-chat-input");
  if (input) input.focus();
}

function appendPopupMessage(text, type) {
  const container = document.getElementById("ai-chat-messages");
  if (!container) return;

  const row = document.createElement("div");
  row.style.cssText = `display:flex;flex-direction:column;margin-bottom:12px;align-items:${type === "user" ? "flex-end" : "flex-start"};`;

  if (type === "user") {
    const bubble = document.createElement("div");
    bubble.className = "ai-chat-msg user";
    bubble.textContent = text;
    row.appendChild(bubble);
  } else if (type === "assistant") {
    const bubble = document.createElement("div");
    bubble.className = "ai-chat-msg assistant";
    renderMarkdownInto(bubble, text);
    row.appendChild(bubble);
    // Copy button
    const copyRow = document.createElement("div");
    copyRow.style.cssText =
      "display:flex;justify-content:flex-start;margin-top:3px;";
    const copyBtn = document.createElement("button");
    copyBtn.style.cssText =
      "background:none;border:none;color:var(--muted);font-size:10px;cursor:pointer;font-family:'DM Sans',sans-serif;padding:1px 4px;border-radius:3px;transition:color 0.15s;";
    copyBtn.textContent = "Copy";
    copyBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(text).then(() => {
        copyBtn.textContent = "Copied!";
        copyBtn.style.color = "var(--success)";
        setTimeout(() => {
          copyBtn.textContent = "Copy";
          copyBtn.style.color = "";
        }, 1500);
      });
    });
    copyRow.appendChild(copyBtn);
    row.appendChild(copyRow);
  } else if (type === "generate" || type === "improve") {
    // This type is passed for generate cards — handled via appendPopupGenCard
    return;
  } else {
    const bubble = document.createElement("div");
    bubble.className = `ai-chat-msg ${type}`;
    bubble.textContent = text;
    row.appendChild(bubble);
  }

  container.appendChild(row);
  container.scrollTop = container.scrollHeight;
}

function appendPopupGenCard(parsed) {
  const container = document.getElementById("ai-chat-messages");
  if (!container) return;
  const isImprove = parsed.action === "improve";
  const row = document.createElement("div");
  row.style.cssText = "align-self:flex-start;margin-bottom:12px;width:100%;";

  const card = document.createElement("div");
  card.style.cssText =
    "background:var(--surface);border:1px solid var(--border);border-radius:8px;overflow:hidden;";

  const header = document.createElement("div");
  header.style.cssText =
    "padding:6px 10px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:6px;";
  const badge = document.createElement("span");
  badge.style.cssText = `font-size:9px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;padding:2px 6px;border-radius:3px;background:${isImprove ? "#1a2a1a" : "var(--accent-dim)"};color:${isImprove ? "#4ade80" : "var(--accent)"};`;
  badge.textContent = isImprove ? "Improved" : "Generated";
  const count = document.createElement("span");
  count.style.cssText = "font-size:11px;color:var(--muted);";
  count.textContent = parsed.elements.length + " elements";
  header.appendChild(badge);
  header.appendChild(count);
  card.appendChild(header);

  if (parsed.summary) {
    const sum = document.createElement("div");
    sum.style.cssText =
      "padding:5px 10px;font-size:11px;color:var(--text);border-bottom:1px solid var(--border);line-height:1.4;";
    sum.textContent = parsed.summary;
    card.appendChild(sum);
  }

  const footer = document.createElement("div");
  footer.style.cssText = "padding:7px 10px;";
  const applyBtn = document.createElement("button");
  applyBtn.style.cssText =
    "width:100%;background:linear-gradient(135deg,#1a2f1a,#1e3a1e);border:1px solid #2d5a2d;color:#4ade80;border-radius:6px;padding:6px;cursor:pointer;font-size:11px;font-weight:600;font-family:'DM Sans',sans-serif;display:flex;align-items:center;justify-content:center;gap:4px;transition:opacity .15s;";
  applyBtn.innerHTML = `<svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg> Apply to Canvas`;

  // Auto-apply elements immediately
  (async () => {
    const tab = await getActiveExcalidrawTab();
    if (!tab) {
      applyBtn.textContent = "No Excalidraw tab open";
      return;
    }

    // Send apply message to content script
    chrome.tabs.sendMessage(
      tab.id,
      { type: "APPLY_ELEMENTS", elements: parsed.elements },
      (response) => {
        if (response && response.ok) {
          applyBtn.innerHTML = `<svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg> Applied! (click to undo)`;
          applyBtn.style.background = "var(--bg)";
          applyBtn.style.borderColor = "var(--border)";
          applyBtn.style.color = "var(--muted)";

          // Allow undo
          applyBtn.addEventListener("click", () => {
            chrome.tabs.sendMessage(tab.id, {
              type: "REMOVE_ELEMENTS",
              elementIds: parsed.elements.map((e) => e.id),
            });
            applyBtn.innerHTML = `<svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg> Removed`;
            applyBtn.disabled = true;
          });
        } else {
          applyBtn.textContent = "Error — retry?";
          applyBtn.addEventListener("click", () => {
            chrome.tabs.sendMessage(tab.id, {
              type: "APPLY_ELEMENTS",
              elements: parsed.elements,
            });
            applyBtn.innerHTML = `<svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg> Applied!`;
            applyBtn.disabled = true;
          });
        }
      },
    );
  })();

  footer.appendChild(applyBtn);
  card.appendChild(footer);
  row.appendChild(card);
  container.appendChild(row);
  container.scrollTop = container.scrollHeight;
}

function renderPopupSuggestions() {
  const container = document.getElementById("ai-chat-messages");
  if (!container) return;
  const SUGGESTIONS = [
    "Build a school org chart",
    "Draw a flowchart for student registration",
    "Analyze my current diagram",
    "Create a system architecture for a web app",
  ];
  const wrap = document.createElement("div");
  wrap.id = "ai-popup-suggestions";
  wrap.style.cssText =
    "padding:4px 0 8px;display:flex;flex-direction:column;gap:5px;";
  const title = document.createElement("div");
  title.style.cssText =
    "font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-bottom:2px;";
  title.textContent = "Try asking…";
  wrap.appendChild(title);
  SUGGESTIONS.forEach((s) => {
    const chip = document.createElement("button");
    chip.style.cssText =
      "background:var(--bg);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:5px 8px;font-size:10px;cursor:pointer;font-family:'DM Sans',sans-serif;text-align:left;transition:border-color .15s,color .15s;";
    chip.textContent = s;
    chip.addEventListener("mouseenter", () => {
      chip.style.borderColor = "var(--accent)";
      chip.style.color = "var(--accent)";
    });
    chip.addEventListener("mouseleave", () => {
      chip.style.borderColor = "var(--border)";
      chip.style.color = "var(--text)";
    });
    chip.addEventListener("click", () => {
      const input = document.getElementById("ai-chat-input");
      if (input) {
        input.value = s;
        input.focus();
      }
      wrap.remove();
    });
    wrap.appendChild(chip);
  });
  container.appendChild(wrap);
  container.scrollTop = container.scrollHeight;
}

function appendPopupThinking() {
  const container = document.getElementById("ai-chat-messages");
  if (!container) return null;
  const div = document.createElement("div");
  div.className = "ai-chat-msg thinking";
  div.innerHTML = `
    <span>Thinking</span>
    <span style="display: inline-flex; gap: 3px;">
      <span style="width: 4px; height: 4px; background: var(--muted); border-radius: 50%; animation: thinkingBounce 1.2s infinite;"></span>
      <span style="width: 4px; height: 4px; background: var(--muted); border-radius: 50%; animation: thinkingBounce 1.2s infinite 0.2s;"></span>
      <span style="width: 4px; height: 4px; background: var(--muted); border-radius: 50%; animation: thinkingBounce 1.2s infinite 0.4s;"></span>
    </span>
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return div;
}

function updatePopupStreamingMessage(content, thinkingDiv) {
  if (!thinkingDiv) return;
  // Check if content looks like JSON (diagram generation) — show skeleton
  const trimmed = content.trimStart();
  if (trimmed.startsWith("{")) {
    thinkingDiv.innerHTML = `
      <span style="font-style:italic;">✦ Generating diagram…</span>
      <span style="display: inline-flex; gap: 3px;">
        <span style="width: 4px; height: 4px; background: var(--muted); border-radius: 50%; animation: thinkingBounce 1.2s infinite;"></span>
        <span style="width: 4px; height: 4px; background: var(--muted); border-radius: 50%; animation: thinkingBounce 1.2s infinite 0.2s;"></span>
        <span style="width: 4px; height: 4px; background: var(--muted); border-radius: 50%; animation: thinkingBounce 1.2s infinite 0.4s;"></span>
      </span>
    `;
  } else {
    // Show streamed text progressively
    thinkingDiv.innerHTML = "";
    thinkingDiv.className = "ai-chat-msg assistant";
    const span = document.createElement("span");
    span.textContent = content;
    span.style.cssText = "white-space:pre-wrap;word-break:break-word;";
    thinkingDiv.appendChild(span);
    const cursor = document.createElement("span");
    cursor.className = "eai-cursor";
    cursor.style.cssText =
      "display:inline-block;width:2px;height:14px;background:var(--accent);border-radius:1px;margin-left:2px;vertical-align:text-bottom;animation:eai-blink 0.8s step-end infinite;";
    thinkingDiv.appendChild(cursor);
  }
  const container = document.getElementById("ai-chat-messages");
  if (container) container.scrollTop = container.scrollHeight;
}

async function handlePopupSend(text) {
  if (!text || popupChatState.isStreaming) return;

  const now = Date.now();
  if (now - lastSendTime < SEND_DEBOUNCE_MS) return;
  lastSendTime = now;

  showChatPanel();

  const inputEl = document.getElementById("ai-chat-input");
  if (inputEl) {
    inputEl.value = "";
    inputEl.style.height = "auto";
  }

  appendPopupMessage(text, "user");
  const thinkingDiv = appendPopupThinking();

  popupChatState.history.push({
    role: "user",
    content: text,
    timestamp: Date.now(),
  });
  popupChatState.isStreaming = true;

  const sendBtn = document.getElementById("ai-chat-send");
  if (sendBtn) sendBtn.disabled = true;

  // Check for API key first
  const aiSettings = await chrome.runtime.sendMessage({
    type: "AI_GET_SETTINGS",
  });
  if (!aiSettings?.ok || !aiSettings.settings.hasApiKey) {
    if (thinkingDiv) thinkingDiv.remove();
    popupChatState.isStreaming = false;
    if (sendBtn) sendBtn.disabled = false;
    appendPopupSetupPrompt();
    return;
  }

  const tab = await getActiveExcalidrawTab();
  let canvasContext = null;
  if (tab && popupChatState.contextIncluded) {
    try {
      const sceneResult = await chrome.tabs.sendMessage(tab.id, {
        type: "GET_SCENE",
      });
      canvasContext = sceneResult?.scene || null;
    } catch (_) {}
  }

  // Open a port for streaming before sending the message
  const PORT_NAME = "ai-stream-popup";
  let streamPort = null;
  const streamPromise = new Promise((resolve) => {
    streamPort = chrome.runtime.connect({ name: PORT_NAME });
    let accumulatedContent = "";
    streamPort.onMessage.addListener((portMsg) => {
      if (portMsg.type === "chunk") {
        accumulatedContent = portMsg.fullContent;
        updatePopupStreamingMessage(portMsg.fullContent, thinkingDiv);
      } else if (portMsg.type === "done") {
        resolve({ content: portMsg.fullContent });
      } else if (portMsg.type === "error") {
        resolve({ error: portMsg.error });
      }
    });
    streamPort.onDisconnect.addListener(() => {
      resolve({ error: "Stream disconnected" });
    });
  });

  chrome.runtime.sendMessage({
    type: "AI_CHAT",
    prompt: text,
    canvasContext,
    history: popupChatState.history.filter((m) => m.role !== "system"),
    _portName: PORT_NAME,
  });

  const response = await streamPromise;
  try {
    streamPort.disconnect();
  } catch (_) {}

  popupChatState.isStreaming = false;
  if (sendBtn) sendBtn.disabled = false;
  if (thinkingDiv) thinkingDiv.remove();

  if (response?.error) {
    appendPopupMessage(response.error, "error");
  } else {
    const fullContent = response?.content || "";
    // Parse the AI response to check for generate/improve actions
    let parsed = null;
    try {
      const jsonMatch = fullContent.match(
        /\{[\s\S]*"action"\s*:\s*"(generate|improve|analyze|chat)"[\s\S]*\}/,
      );
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    } catch (_) {}

    if (
      parsed &&
      (parsed.action === "generate" || parsed.action === "improve") &&
      Array.isArray(parsed.elements)
    ) {
      appendPopupGenCard(parsed);
    } else {
      appendPopupMessage(fullContent, "assistant");
    }

    popupChatState.history.push({
      role: "assistant",
      content: fullContent,
      timestamp: Date.now(),
    });

    chrome.storage.local
      .set({ popupAiHistory: popupChatState.history.slice(-30) })
      .catch(() => {});
  }

  const container = document.getElementById("ai-chat-messages");
  if (container) container.scrollTop = container.scrollHeight;
}

function appendPopupSetupPrompt() {
  const container = document.getElementById("ai-chat-messages");
  if (!container) return;

  const row = document.createElement("div");
  row.style.cssText = "align-self:flex-start;margin-bottom:12px;width:100%;";

  const card = document.createElement("div");
  card.style.cssText =
    "background:var(--surface);border:1px solid #5c1c1c;border-radius:10px;padding:12px;";

  const title = document.createElement("div");
  title.style.cssText =
    "font-size:13px;font-weight:600;color:var(--error);margin-bottom:4px;";
  title.textContent = "⚡ AI Setup Required";

  const desc = document.createElement("div");
  desc.style.cssText =
    "font-size:12px;color:var(--muted);margin-bottom:10px;line-height:1.5;";
  desc.textContent =
    "Add your OpenRouter API key in settings to start generating diagrams.";

  const link = document.createElement("a");
  link.style.cssText =
    "display:inline-flex;align-items:center;gap:4px;font-size:12px;color:var(--accent);cursor:pointer;text-decoration:none;font-weight:600;";
  link.textContent = "Open Settings →";
  link.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  card.appendChild(title);
  card.appendChild(desc);
  card.appendChild(link);
  row.appendChild(card);
  container.appendChild(row);
  container.scrollTop = container.scrollHeight;
}

// Init chat panel
function initPopupChat() {
  if (popupChatState.initialized) return;
  popupChatState.initialized = true;

  chrome.storage.local
    .get("popupAiHistory")
    .then(({ popupAiHistory = [] }) => {
      popupChatState.history = popupAiHistory;
      if (popupChatState.history.length > 0) {
        const container = document.getElementById("ai-chat-messages");
        if (container) {
          container.innerHTML = "";
          for (const msg of popupChatState.history) {
            if (msg.role === "user") appendPopupMessage(msg.content, "user");
            else if (msg.role === "assistant")
              appendPopupMessage(msg.content, "assistant");
          }
        }
      } else {
        // Show suggestions on empty history
        showChatPanel();
        renderPopupSuggestions();
      }
    })
    .catch(() => {});

  // Send button
  document.getElementById("ai-chat-send")?.addEventListener("click", () => {
    const input = document.getElementById("ai-chat-input");
    if (input) handlePopupSend(input.value.trim());
  });

  // Input handling
  const input = document.getElementById("ai-chat-input");
  if (input) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handlePopupSend(input.value.trim());
      }
    });
    input.addEventListener("input", () => {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 60) + "px";
    });
  }

  document
    .getElementById("ai-chat-clear-btn")
    ?.addEventListener("click", () => {
      popupChatState.history = [];
      chrome.storage.local.remove("popupAiHistory").catch(() => {});
      const container = document.getElementById("ai-chat-messages");
      if (container) container.innerHTML = "";
      renderPopupSuggestions();
    });

  // Context toggle
  const contextBtn = document.getElementById("ai-chat-context-btn");
  contextBtn?.addEventListener("click", () => {
    popupChatState.contextIncluded = !popupChatState.contextIncluded;
    contextBtn.classList.toggle("active", popupChatState.contextIncluded);
    contextBtn.textContent = popupChatState.contextIncluded
      ? "Context: ON"
      : "Context: OFF";
  });

  // Quick action buttons now open the chat panel with pre-filled text
  document
    .getElementById("ai-quick-generate")
    ?.addEventListener("click", () => {
      showChatPanel();
      const input = document.getElementById("ai-chat-input");
      if (input) {
        input.value = "Generate a diagram of ";
        input.focus();
        input.style.height = "auto";
        input.style.height = Math.min(input.scrollHeight, 60) + "px";
      }
    });

  document
    .getElementById("ai-quick-analyze")
    ?.addEventListener("click", async () => {
      const tab = await getActiveExcalidrawTab();
      if (!tab) {
        showToast("Open Excalidraw first.", "error");
        return;
      }
      showChatPanel();
      handlePopupSend(
        "Analyze this diagram. Describe what it shows and suggest improvements.",
      );
    });
}

// ─── Boot ────────────────────────────────────────────────────────────────────
init();

// Init chat when DOM is ready (but only in 'ready' state)
const observer = new MutationObserver(() => {
  if (document.getElementById("state-ready")?.classList.contains("active")) {
    initPopupChat();
  }
});
observer.observe(document.body, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ["class"],
});
