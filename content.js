// content.js
// Injected into excalidraw.com — extracts scene data from localStorage and injects sidebar

// ─── Scene Extraction ────────────────────────────────────────────────────────

function getExcalidrawScene() {
  try {
    const elementsRaw = localStorage.getItem("excalidraw");
    const stateRaw = localStorage.getItem("excalidraw-state");
    const filesRaw = localStorage.getItem("excalidraw-files");

    const elements = elementsRaw ? JSON.parse(elementsRaw) : [];
    if (!elements || elements.length === 0) {
      return { error: "Canvas is empty — nothing to save." };
    }

    const appState = stateRaw ? JSON.parse(stateRaw) : {};
    const files = filesRaw ? JSON.parse(filesRaw) : {};

    const firstText = elements.find(
      (el) => el.type === "text" && el.text?.trim(),
    );
    const title = firstText
      ? firstText.text
          .trim()
          .slice(0, 40)
          .replace(/[^a-z0-9_\-\s]/gi, "")
          .trim()
          .replace(/\s+/g, "_")
      : "untitled";

    const scene = {
      type: "excalidraw",
      version: 2,
      source: "https://excalidraw.com",
      elements,
      appState: {
        gridSize: appState.gridSize ?? null,
        viewBackgroundColor: appState.viewBackgroundColor ?? "#ffffff",
      },
      files,
    };

    return { scene, title };
  } catch (err) {
    return { error: "Failed to read scene: " + err.message };
  }
}

// ─── Sidebar Injection ───────────────────────────────────────────────────────

function injectSidebar() {
  if (document.getElementById("excalihub-sidebar")) return;

  const fontLink = document.createElement("link");
  fontLink.href =
    "https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600&display=swap";
  fontLink.rel = "stylesheet";
  document.head.appendChild(fontLink);

  const sidebar = document.createElement("div");
  sidebar.id = "excalihub-sidebar";
  sidebar.innerHTML = `
    <div class="sidebar-header">
      <div class="sidebar-logo">
        <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
          <rect width="18" height="18" rx="5" fill="#4f8ef7" opacity="0.15"/>
          <path d="M4 13L7.5 6L10 10.5L12 8L14 13" stroke="#4f8ef7" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>ExcaliHub</span>
      </div>
      <button class="sidebar-close" id="excalihub-close" title="Close sidebar">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
    </div>

    <div class="sidebar-content" id="excalihub-content">
      <div class="sidebar-section">
        <div class="section-header">
          <span>Saved Files</span>
          <button class="refresh-btn" id="excalihub-refresh" title="Refresh file list">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1.5 7a5.5 5.5 0 019.8-3.2M12.5 7a5.5 5.5 0 01-9.8 3.2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
              <path d="M11.5 1v3h-3M2.5 13v-3h3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
        <div class="file-list" id="excalihub-file-list">
          <div class="file-list-empty">Click refresh to load files</div>
        </div>
      </div>
    </div>
  `;

  // Floating button to reopen sidebar
  const floatingBtn = document.createElement("div");
  floatingBtn.id = "excalihub-float-btn";
  floatingBtn.title = "ExcaliHub — Saved Files";
  floatingBtn.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect width="18" height="18" rx="5" fill="#4f8ef7" opacity="0.2"/>
      <path d="M4 13L7.5 6L10 10.5L12 8L14 13" stroke="#4f8ef7" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;

  // Add styles
  const style = document.createElement("style");
  style.id = "excalihub-styles";
  style.textContent = `
    #excalihub-sidebar {
      position: fixed;
      top: 0;
      right: 0;
      width: 280px;
      height: 100vh;
      background: #161a1f;
      border-left: 1px solid #252b33;
      color: #e8edf2;
      font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 13px;
      z-index: 999999;
      display: flex;
      flex-direction: column;
      box-shadow: -4px 0 20px rgba(0, 0, 0, 0.3);
    }

    #excalihub-sidebar.hidden {
      display: none;
    }

    .sidebar-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 14px;
      border-bottom: 1px solid #252b33;
      flex-shrink: 0;
    }

    .sidebar-logo {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
      font-size: 14px;
    }

    .sidebar-close {
      background: none;
      border: none;
      color: #6b7685;
      cursor: pointer;
      padding: 4px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      transition: color 0.15s, background 0.15s;
    }

    .sidebar-close:hover {
      color: #e8edf2;
      background: #0d0f11;
    }

    .sidebar-content {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
    }

    .sidebar-section {
      margin-bottom: 16px;
    }

    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #6b7685;
      margin-bottom: 8px;
    }

    .refresh-btn {
      background: none;
      border: none;
      color: #6b7685;
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      transition: color 0.15s, transform 0.2s;
    }

    .refresh-btn:hover {
      color: #4f8ef7;
    }

    .refresh-btn.spinning svg {
      animation: spin 0.7s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .file-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .file-list-empty {
      text-align: center;
      color: #6b7685;
      font-size: 12px;
      padding: 20px 10px;
      line-height: 1.5;
    }

    .file-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      background: #0d0f11;
      border: 1px solid #252b33;
      border-radius: 6px;
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s;
      position: relative;
    }

    .file-item:hover {
      border-color: #4f8ef7;
      background: #1e3259;
    }

    .file-item.loading {
      pointer-events: none;
      opacity: 0.6;
    }

    .file-item .file-icon {
      flex-shrink: 0;
      color: #4f8ef7;
    }

    .file-item .file-info {
      flex: 1;
      min-width: 0;
    }

    .file-item .file-name {
      font-size: 12px;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .file-item .file-meta {
      font-size: 10px;
      color: #6b7685;
      margin-top: 2px;
    }

    .file-item .file-spinner {
      width: 12px;
      height: 12px;
      border: 2px solid rgba(79, 142, 247, 0.2);
      border-top-color: #4f8ef7;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
      flex-shrink: 0;
    }

    #excalihub-float-btn {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 44px;
      height: 44px;
      background: #161a1f;
      border: 1px solid #252b33;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 999998;
      transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }

    #excalihub-float-btn:hover {
      background: #1e3259;
      border-color: #4f8ef7;
      box-shadow: 0 4px 16px rgba(79, 142, 247, 0.2);
    }

    #excalihub-float-btn.hidden {
      display: none;
    }

    .toast-notification {
      position: fixed;
      bottom: 20px;
      right: 300px;
      padding: 10px 14px;
      border-radius: 7px;
      font-size: 12px;
      z-index: 999999;
      transition: opacity 0.2s, transform 0.2s;
      max-width: 300px;
    }

    .toast-notification.success {
      background: #0f3326;
      color: #3dd68c;
      border: 1px solid #1c5c3e;
    }

    .toast-notification.error {
      background: #331414;
      color: #f76f6f;
      border: 1px solid #5c1c1c;
    }

    .toast-notification.show {
      opacity: 1;
      transform: translateY(0);
    }

    .toast-notification.hide {
      opacity: 0;
      transform: translateY(10px);
    }

    /* Scrollbar styling */
    #excalihub-content::-webkit-scrollbar {
      width: 6px;
    }

    #excalihub-content::-webkit-scrollbar-track {
      background: transparent;
    }

    #excalihub-content::-webkit-scrollbar-thumb {
      background: #252b33;
      border-radius: 3px;
    }

    #excalihub-content::-webkit-scrollbar-thumb:hover {
      background: #3a4250;
    }
  `;

  document.head.appendChild(style);
  document.body.appendChild(sidebar);
  document.body.appendChild(floatingBtn);

  // ─── Sidebar Logic ───────────────────────────────────────────────────────

  const sidebarEl = document.getElementById("excalihub-sidebar");
  const closeBtn = document.getElementById("excalihub-close");
  const refreshBtn = document.getElementById("excalihub-refresh");
  const fileListEl = document.getElementById("excalihub-file-list");

  // Close sidebar
  closeBtn.addEventListener("click", () => {
    sidebarEl.classList.add("hidden");
    floatingBtn.classList.remove("hidden");
  });

  // Reopen sidebar
  floatingBtn.addEventListener("click", () => {
    sidebarEl.classList.remove("hidden");
    floatingBtn.classList.add("hidden");
  });

  // Show toast notification
  function showToast(msg, type = "success") {
    const existing = document.querySelector(".toast-notification");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.className = `toast-notification ${type} show`;
    toast.textContent = msg;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.remove("show");
      toast.classList.add("hide");
      setTimeout(() => toast.remove(), 200);
    }, 3000);
  }

  // Format file size
  function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // Format relative time
  function formatTime(date) {
    const now = new Date();
    const diff = now - date;
    if (diff < 60000) return "just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
  }

  // Load file list from GitHub
  async function loadFileList() {
    refreshBtn.classList.add("spinning");
    fileListEl.innerHTML =
      '<div class="file-list-empty">Loading files...</div>';

    try {
      const response = await chrome.runtime.sendMessage({ type: "LIST_FILES" });

      if (response?.error) {
        fileListEl.innerHTML = `<div class="file-list-empty">Error: ${response.error}</div>`;
        showToast(response.error, "error");
        return;
      }

      if (!response?.files || response.files.length === 0) {
        fileListEl.innerHTML =
          '<div class="file-list-empty">No saved files found</div>';
        return;
      }

      fileListEl.innerHTML = "";
      response.files.forEach((file) => {
        const item = document.createElement("div");
        item.className = "file-item";
        item.dataset.path = file.path;
        item.innerHTML = `
          <div class="file-icon">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 1.5h6l4 4v7a1 1 0 01-1 1H3a1 1 0 01-1-1v-9a1 1 0 011-1z" stroke="currentColor" stroke-width="1.2"/>
              <path d="M8 1.5v4h4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="file-info">
            <div class="file-name">${file.name}</div>
            <div class="file-meta">${formatSize(file.size)}</div>
          </div>
        `;

        item.addEventListener("click", () => loadFile(file.path, item));
        fileListEl.appendChild(item);
      });

      showToast(`Loaded ${response.files.length} files`, "success");
    } catch (err) {
      fileListEl.innerHTML = `<div class="file-list-empty">Failed to load: ${err.message}</div>`;
      showToast(err.message, "error");
    } finally {
      refreshBtn.classList.remove("spinning");
    }
  }

  // Load a specific file and import it into Excalidraw
  async function loadFile(path, itemEl) {
    itemEl.classList.add("loading");
    const originalContent = itemEl.innerHTML;
    itemEl.innerHTML = `
      <div class="file-spinner"></div>
      <div class="file-info">
        <div class="file-name">Loading...</div>
      </div>
    `;

    try {
      const response = await chrome.runtime.sendMessage({
        type: "LOAD_FILE",
        path,
      });

      if (response?.error) {
        throw new Error(response.error);
      }

      // Import the scene into Excalidraw via localStorage
      const scene = response.scene;
      localStorage.setItem("excalidraw", JSON.stringify(scene.elements || []));
      localStorage.setItem(
        "excalidraw-state",
        JSON.stringify(scene.appState || {}),
      );
      if (scene.files) {
        localStorage.setItem("excalidraw-files", JSON.stringify(scene.files));
      }

      // Reload the page to apply the scene
      showToast("File loaded! Refreshing...", "success");
      setTimeout(() => window.location.reload(), 500);
    } catch (err) {
      itemEl.classList.remove("loading");
      itemEl.innerHTML = originalContent;
      showToast(err.message, "error");
    }
  }

  // Refresh button
  refreshBtn.addEventListener("click", loadFileList);

  // Auto-load file list when sidebar is injected
  loadFileList();
}

// ─── Message Listener ────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "GET_SCENE") {
    sendResponse(getExcalidrawScene());
  }
});

// ─── Initialize ──────────────────────────────────────────────────────────────

// Wait for the page to be fully loaded
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", injectSidebar);
} else {
  injectSidebar();
}
