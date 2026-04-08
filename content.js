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

        <!-- Search and Sort Controls -->
        <div class="search-sort-controls" style="margin-bottom: 12px;">
          <div class="search-box" style="position: relative; margin-bottom: 8px;">
            <input type="text" id="excalihub-search" placeholder="Search files..." style="
              width: 85%;
              background: #0d0f11;
              border: 1px solid #252b33;
              color: #e8edf2;
              border-radius: 6px;
              padding: 7px 10px 7px 30px;
              font-size: 12px;
              outline: none;
              transition: border-color 0.15s;
              font-family: 'DM Sans', sans-serif;
            " />
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style="
              position: absolute;
              left: 9px;
              top: 50%;
              transform: translateY(-50%);
              color: #6b7685;
              pointer-events: none;
            ">
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.3"/>
              <path d="M9.5 9.5L12.5 12.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
            </svg>
            <button class="clear-search" id="excalihub-clear-search" title="Clear search" style="
              position: absolute;
              right: 8px;
              top: 50%;
              transform: translateY(-50%);
              background: none;
              border: none;
              color: #6b7685;
              cursor: pointer;
              padding: 2px;
              display: none;
              border-radius: 3px;
            ">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
          <div class="sort-controls" style="display: flex; gap: 6px;">
            <select id="excalihub-sort-by" title="Sort by" style="
              flex: 1;
              background: #0d0f11;
              border: 1px solid #252b33;
              color: #e8edf2;
              border-radius: 6px;
              padding: 6px 8px;
              font-size: 11px;
              outline: none;
              cursor: pointer;
              font-family: 'DM Sans', sans-serif;
            ">
              <option value="name">Name</option>
              <option value="date">Date Modified</option>
              <option value="size">Size</option>
            </select>
            <button class="sort-order-btn" id="excalihub-sort-order" title="Toggle sort order" style="
              background: #0d0f11;
              border: 1px solid #252b33;
              color: #6b7685;
              border-radius: 6px;
              padding: 6px 10px;
              cursor: pointer;
              font-size: 11px;
              transition: color 0.15s, border-color 0.15s;
            ">
              ↑
            </button>
          </div>
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

    .file-item .file-actions {
      display: flex;
      gap: 4px;
      flex-shrink: 0;
    }

    .file-item .file-action-btn {
      background: none;
      border: none;
      color: #6b7685;
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      transition: color 0.15s, background 0.15s;
    }

    .file-item .file-action-btn:hover {
      color: #e8edf2;
      background: #252b33;
    }

    .file-item .file-action-btn.delete:hover {
      color: #f76f6f;
      background: #331414;
    }

    /* Confirmation dialog */
    .confirmation-dialog {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000000;
    }

    .confirmation-dialog .dialog-box {
      background: #161a1f;
      border: 1px solid #252b33;
      border-radius: 10px;
      padding: 20px;
      max-width: 320px;
      width: 90%;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    }

    .confirmation-dialog .dialog-title {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 8px;
    }

    .confirmation-dialog .dialog-message {
      font-size: 12px;
      color: #6b7685;
      margin-bottom: 16px;
      line-height: 1.5;
    }

    .confirmation-dialog .dialog-actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }

    .confirmation-dialog .dialog-btn {
      padding: 6px 12px;
      border-radius: 6px;
      border: none;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: opacity 0.15s;
    }

    .confirmation-dialog .dialog-btn.cancel {
      background: #0d0f11;
      color: #6b7685;
      border: 1px solid #252b33;
    }

    .confirmation-dialog .dialog-btn.cancel:hover {
      border-color: #4f8ef7;
      color: #4f8ef7;
    }

    .confirmation-dialog .dialog-btn.primary {
      background: #4f8ef7;
      color: #fff;
    }

    .confirmation-dialog .dialog-btn.primary:hover {
      opacity: 0.88;
    }

    .confirmation-dialog .dialog-btn.danger {
      background: #f76f6f;
      color: #fff;
    }

    .confirmation-dialog .dialog-btn.danger:hover {
      opacity: 0.88;
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
  const searchInput = document.getElementById("excalihub-search");
  const clearSearchBtn = document.getElementById("excalihub-clear-search");
  const sortBySelect = document.getElementById("excalihub-sort-by");
  const sortOrderBtn = document.getElementById("excalihub-sort-order");

  // State for search and sort
  let currentFiles = [];
  let currentSortBy = "name";
  let currentSortOrder = "asc"; // 'asc' or 'desc'

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

  // Load settings from storage
  async function loadSortSettings() {
    try {
      const settings = await chrome.storage.local.get(["sortBy", "sortOrder"]);
      if (settings.sortBy) {
        currentSortBy = settings.sortBy;
        sortBySelect.value = currentSortBy;
      }
      if (settings.sortOrder) {
        currentSortOrder = settings.sortOrder;
        sortOrderBtn.textContent = currentSortOrder === "asc" ? "↑" : "↓";
      }
    } catch (err) {
      console.error("Failed to load sort settings:", err);
    }
  }

  // Save sort settings to storage
  async function saveSortSettings() {
    try {
      await chrome.storage.local.set({
        sortBy: currentSortBy,
        sortOrder: currentSortOrder,
      });
    } catch (err) {
      console.error("Failed to save sort settings:", err);
    }
  }

  // Sort files based on current sort settings
  function sortFiles(files) {
    const sorted = [...files];
    const modifier = currentSortOrder === "asc" ? 1 : -1;

    sorted.sort((a, b) => {
      if (currentSortBy === "name") {
        return modifier * a.name.localeCompare(b.name);
      } else if (currentSortBy === "size") {
        return modifier * (a.size - b.size);
      } else if (currentSortBy === "date") {
        return modifier * a.name.localeCompare(b.name);
      }
      return 0;
    });

    return sorted;
  }

  // Filter files based on search term
  function filterFiles(files, searchTerm) {
    if (!searchTerm.trim()) return files;
    const term = searchTerm.toLowerCase().trim();
    return files.filter((file) => file.name.toLowerCase().includes(term));
  }

  // Render files with current search and sort applied
  function renderFiles() {
    const searchTerm = searchInput.value;
    const filtered = filterFiles(currentFiles, searchTerm);
    const sorted = sortFiles(filtered);

    // Show/hide clear search button
    clearSearchBtn.style.display = searchTerm ? "block" : "none";

    if (sorted.length === 0) {
      if (searchTerm) {
        fileListEl.innerHTML = `<div class="file-list-empty">No files matching "${searchTerm}"</div>`;
      } else {
        fileListEl.innerHTML =
          '<div class="file-list-empty">No saved files found</div>';
      }
      return;
    }

    fileListEl.innerHTML = "";
    sorted.forEach((file) => {
      const item = document.createElement("div");
      item.className = "file-item";
      item.dataset.path = file.path;
      item.dataset.sha = file.sha;
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
        <div class="file-actions">
          <button class="file-action-btn delete" title="Delete file" data-path="${file.path}" data-sha="${file.sha}">
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
              <path d="M3 4h8M5 4V3a1 1 0 011-1h2a1 1 0 011 1v1M10 4v7a1 1 0 01-1 1H5a1 1 0 01-1-1V4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M6 6v4M8 6v4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      `;

      item.addEventListener("click", (e) => {
        if (e.target.closest(".file-action-btn")) return;
        loadFile(file.path, item);
      });
      fileListEl.appendChild(item);
    });

    // Add delete button listeners
    document.querySelectorAll(".file-action-btn.delete").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const path = btn.dataset.path;
        const sha = btn.dataset.sha;
        confirmDeleteFile(path, sha);
      });
    });
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

      // Store files and apply current sort/search
      currentFiles = response.files;
      renderFiles();

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

  // Search input
  searchInput.addEventListener("input", () => {
    renderFiles();
  });

  // Clear search button
  clearSearchBtn.addEventListener("click", () => {
    searchInput.value = "";
    renderFiles();
    searchInput.focus();
  });

  // Sort by dropdown
  sortBySelect.addEventListener("change", async () => {
    currentSortBy = sortBySelect.value;
    await saveSortSettings();
    renderFiles();
  });

  // Sort order toggle button
  sortOrderBtn.addEventListener("click", async () => {
    currentSortOrder = currentSortOrder === "asc" ? "desc" : "asc";
    sortOrderBtn.textContent = currentSortOrder === "asc" ? "↑" : "↓";
    await saveSortSettings();
    renderFiles();
  });

  // Show confirmation dialog
  function showConfirmation(
    title,
    message,
    onConfirm,
    confirmText = "Confirm",
    confirmClass = "primary",
  ) {
    const overlay = document.createElement("div");
    overlay.className = "confirmation-dialog";
    overlay.innerHTML = `
      <div class="dialog-box">
        <div class="dialog-title">${title}</div>
        <div class="dialog-message">${message}</div>
        <div class="dialog-actions">
          <button class="dialog-btn cancel">Cancel</button>
          <button class="dialog-btn ${confirmClass}">${confirmText}</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay
      .querySelector(".cancel")
      .addEventListener("click", () => overlay.remove());
    overlay.querySelector(`.${confirmClass}`).addEventListener("click", () => {
      overlay.remove();
      onConfirm();
    });

    // Close on overlay click
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });
  }

  // Confirm and delete file
  function confirmDeleteFile(path, sha) {
    const fileName = path.split("/").pop();
    showConfirmation(
      "Delete File",
      `Are you sure you want to delete <strong>${fileName}</strong>? This action cannot be undone.`,
      async () => {
        try {
          const response = await chrome.runtime.sendMessage({
            type: "DELETE_FILE",
            path,
            sha,
          });

          if (response?.error) {
            throw new Error(response.error);
          }

          showToast("File deleted successfully", "success");
          // Reload file list
          loadFileList();
        } catch (err) {
          showToast(err.message, "error");
        }
      },
      "Delete",
      "danger",
    );
  }

  // Auto-load file list when sidebar is injected
  loadSortSettings();
  loadFileList();
}

// ─── Message Listener ────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "GET_SCENE") {
    sendResponse(getExcalidrawScene());
  }

  if (msg.type === "SHOW_TOAST") {
    // Show toast from keyboard shortcut
    const existing = document.querySelector(".toast-notification");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.className = `toast-notification ${msg.toastType} show`;
    toast.textContent = msg.message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.remove("show");
      toast.classList.add("hide");
      setTimeout(() => toast.remove(), 200);
    }, 3000);
  }
});

// ─── Initialize ──────────────────────────────────────────────────────────────

// Wait for the page to be fully loaded
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", injectSidebar);
} else {
  injectSidebar();
}
