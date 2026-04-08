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
      <div style="display: flex; gap: 6px; align-items: center;">
        <button class="sidebar-theme-toggle" id="excalihub-theme-toggle" title="Toggle theme">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" class="theme-icon-light">
            <circle cx="7" cy="7" r="3" stroke="currentColor" stroke-width="1.3"/>
            <path d="M7 1v2M7 11v2M1 7h2M11 7h2M2.8 2.8l1.4 1.4M9.8 9.8l1.4 1.4M2.8 11.2l1.4-1.4M9.8 4.2l1.4-1.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
          </svg>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" class="theme-icon-dark" style="display: none;">
            <path d="M12 8.5A5.5 5.5 0 015.5 2 5.5 5.5 0 1012 8.5z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <button class="sidebar-close" id="excalihub-close" title="Close sidebar">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
    </div>

    <div class="sidebar-content" id="excalihub-content">
      <div class="sidebar-section">
        <div class="section-header">
          <span>Saved Files</span>
          <div style="display: flex; gap: 6px;">
            <button class="new-drawing-btn" id="excalihub-new-drawing" title="Create new drawing">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 1.5h6l4 4v7a1 1 0 01-1 1H3a1 1 0 01-1-1v-9a1 1 0 011-1z" stroke="currentColor" stroke-width="1.2"/>
                <path d="M8 1.5v4h4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M5.5 8h3M7 6.5v3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
              </svg>
            </button>
            <button class="import-btn" id="excalihub-import" title="Import .excalidraw file from disk">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 1v8M3 6l4 4 4-4M2 10v2a1 1 0 001 1h8a1 1 0 001-1v-2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <button class="refresh-btn" id="excalihub-refresh" title="Refresh file list">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1.5 7a5.5 5.5 0 019.8-3.2M12.5 7a5.5 5.5 0 01-9.8 3.2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                <path d="M11.5 1v3h-3M2.5 13v-3h3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
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
            <button id="excalihub-batch-select" title="Select all files" style="
              background: #0d0f11;
              border: 1px solid #252b33;
              color: #6b7685;
              border-radius: 6px;
              padding: 6px 10px;
              cursor: pointer;
              font-size: 11px;
              transition: color 0.15s, border-color 0.15s;
              font-family: 'DM Sans', sans-serif;
            ">
              ☐
            </button>
          </div>
          <div id="excalihub-batch-actions" style="display: none; margin-top: 8px; padding: 8px; background: #0d0f11; border: 1px solid #252b33; border-radius: 6px;">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
              <span style="font-size: 11px; color: #6b7685;"><span id="batch-selected-count">0</span> files selected</span>
              <button id="excalihub-batch-delete" style="
                background: #331414;
                border: 1px solid #5c1c1c;
                color: #f76f6f;
                border-radius: 5px;
                padding: 5px 10px;
                cursor: pointer;
                font-size: 11px;
                font-weight: 500;
                font-family: 'DM Sans', sans-serif;
                transition: opacity 0.15s;
              ">
                Delete Selected
              </button>
            </div>
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
    /* Theme Variables */
    #excalihub-sidebar {
      --bg: #0d0f11;
      --surface: #161a1f;
      --surface-hover: #1e3259;
      --border: #252b33;
      --text: #e8edf2;
      --muted: #6b7685;
      --accent: #4f8ef7;
      --accent-dim: #1e3259;
      --success: #3dd68c;
      --success-dim: #0f3326;
      --error: #f76f6f;
      --error-dim: #331414;
      --shadow: rgba(0, 0, 0, 0.3);
    }

    #excalihub-sidebar.theme-light {
      --bg: #ffffff;
      --surface: #f5f7fa;
      --surface-hover: #e8f0fe;
      --border: #d1d5db;
      --text: #1f2937;
      --muted: #6b7280;
      --accent: #4f8ef7;
      --accent-dim: #e8f0fe;
      --success: #10b981;
      --success-dim: #d1fae5;
      --error: #ef4444;
      --error-dim: #fee2e2;
      --shadow: rgba(0, 0, 0, 0.1);
    }

    #excalihub-sidebar {
      position: fixed;
      top: 0;
      right: 0;
      width: 280px;
      height: 100vh;
      background: var(--bg);
      border-left: 1px solid var(--border);
      color: var(--text);
      font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 13px;
      z-index: 999999;
      display: flex;
      flex-direction: column;
      box-shadow: -4px 0 20px var(--shadow);
    }

    #excalihub-sidebar.hidden {
      display: none;
    }

    .sidebar-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 14px;
      border-bottom: 1px solid var(--border);
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
      color: var(--muted);
      cursor: pointer;
      padding: 4px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      transition: color 0.15s, background 0.15s;
    }

    .sidebar-close:hover {
      color: var(--text);
      background: var(--surface);
    }

    .sidebar-theme-toggle {
      background: none;
      border: none;
      color: var(--muted);
      cursor: pointer;
      padding: 4px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      transition: color 0.15s, background 0.15s;
    }

    .sidebar-theme-toggle:hover {
      color: var(--text);
      background: var(--surface);
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
      color: var(--muted);
      margin-bottom: 8px;
    }

    .new-drawing-btn {
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--text);
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      transition: background 0.15s, color 0.15s, border-color 0.15s;
    }

    .new-drawing-btn:hover {
      background: var(--border);
      color: var(--accent);
      border-color: var(--accent);
    }

    .refresh-btn {
      background: none;
      border: none;
      color: var(--muted);
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      transition: color 0.15s, transform 0.2s;
    }

    .refresh-btn:hover {
      color: var(--accent);
    }

    .refresh-btn.spinning svg {
      animation: spin 0.7s linear infinite;
    }

    .import-btn {
      background: none;
      border: none;
      color: var(--muted);
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      transition: color 0.15s, transform 0.2s;
    }

    .import-btn:hover {
      color: var(--success);
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
      color: var(--muted);
      font-size: 12px;
      padding: 20px 10px;
      line-height: 1.5;
    }

    .file-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s;
      position: relative;
    }

    .file-item:hover {
      border-color: var(--accent);
      background: var(--surface-hover);
    }

    .file-item.loading {
      pointer-events: none;
      opacity: 0.6;
    }

    .file-item .file-icon {
      flex-shrink: 0;
      color: var(--accent);
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

    .file-item .file-action-btn.preview:hover {
      color: #4f8ef7;
      background: #1e3259;
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

    /* Preview modal */
    .preview-dialog {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000000;
    }

    .preview-dialog .preview-box {
      background: #161a1f;
      border: 1px solid #252b33;
      border-radius: 12px;
      padding: 0;
      max-width: 480px;
      width: 90%;
      max-height: 80vh;
      box-shadow: 0 12px 48px rgba(0, 0, 0, 0.6);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .preview-dialog .preview-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 18px;
      border-bottom: 1px solid #252b33;
    }

    .preview-dialog .preview-title {
      font-size: 14px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1;
      margin-right: 12px;
    }

    .preview-dialog .preview-close {
      background: none;
      border: none;
      color: #6b7685;
      cursor: pointer;
      padding: 4px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      transition: color 0.15s, background 0.15s;
      flex-shrink: 0;
    }

    .preview-dialog .preview-close:hover {
      color: #e8edf2;
      background: #252b33;
    }

    .preview-dialog .preview-content {
      padding: 18px;
      overflow-y: auto;
      flex: 1;
    }

    .preview-dialog .preview-info {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .preview-dialog .info-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 0;
      border-bottom: 1px solid #252b33;
    }

    .preview-dialog .info-row:last-child {
      border-bottom: none;
    }

    .preview-dialog .info-label {
      font-size: 11px;
      color: #6b7685;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-weight: 500;
    }

    .preview-dialog .info-value {
      font-size: 12px;
      color: #e8edf2;
      font-family: 'DM Mono', monospace;
      max-width: 240px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .preview-dialog .preview-actions {
      display: flex;
      gap: 8px;
      padding: 14px 18px;
      border-top: 1px solid #252b33;
    }

    .preview-dialog .preview-btn {
      flex: 1;
      padding: 10px 14px;
      border-radius: 8px;
      border: none;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      font-family: 'DM Sans', sans-serif;
      transition: opacity 0.15s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }

    .preview-dialog .preview-btn.primary {
      background: #4f8ef7;
      color: #fff;
    }

    .preview-dialog .preview-btn.secondary {
      background: #0d0f11;
      color: #e8edf2;
      border: 1px solid #252b33;
    }

    .preview-dialog .preview-btn.secondary:hover {
      border-color: #4f8ef7;
      color: #4f8ef7;
    }

    /* Version history modal */
    .version-history-dialog {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000001;
    }

    .version-history-dialog .version-box {
      background: #161a1f;
      border: 1px solid #252b33;
      border-radius: 12px;
      padding: 0;
      max-width: 520px;
      width: 90%;
      max-height: 85vh;
      box-shadow: 0 12px 48px rgba(0, 0, 0, 0.6);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .version-history-dialog .version-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 18px;
      border-bottom: 1px solid #252b33;
    }

    .version-history-dialog .version-title {
      font-size: 14px;
      font-weight: 600;
    }

    .version-history-dialog .version-close {
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

    .version-history-dialog .version-close:hover {
      color: #e8edf2;
      background: #252b33;
    }

    .version-history-dialog .version-content {
      padding: 18px;
      overflow-y: auto;
      flex: 1;
    }

    .version-history-dialog .version-timeline {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .version-history-dialog .version-item {
      display: flex;
      gap: 12px;
      padding: 10px;
      background: #0d0f11;
      border: 1px solid #252b33;
      border-radius: 8px;
      transition: border-color 0.15s;
    }

    .version-history-dialog .version-item:hover {
      border-color: #4f8ef7;
    }

    .version-history-dialog .version-item.current {
      border-color: #3dd68c;
      background: #0f3326;
    }

    .version-history-dialog .version-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #4f8ef7;
      margin-top: 4px;
      flex-shrink: 0;
    }

    .version-history-dialog .version-item.current .version-dot {
      background: #3dd68c;
    }

    .version-history-dialog .version-info {
      flex: 1;
      min-width: 0;
    }

    .version-history-dialog .version-date {
      font-size: 12px;
      font-weight: 500;
      color: #e8edf2;
      margin-bottom: 4px;
    }

    .version-history-dialog .version-message {
      font-size: 11px;
      color: #6b7685;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .version-history-dialog .version-actions {
      flex-shrink: 0;
      display: flex;
      align-items: center;
    }

    .version-history-dialog .version-restore-btn {
      padding: 5px 10px;
      border-radius: 6px;
      border: 1px solid #252b33;
      background: transparent;
      color: #6b7685;
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      font-family: 'DM Sans', sans-serif;
      transition: color 0.15s, border-color 0.15s;
    }

    .version-history-dialog .version-restore-btn:hover {
      color: #4f8ef7;
      border-color: #4f8ef7;
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
  let batchMode = false;
  let selectedFiles = new Map();

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

  // Theme toggle
  const themeToggleBtn = document.getElementById("excalihub-theme-toggle");
  const themeIconLight = themeToggleBtn?.querySelector(".theme-icon-light");
  const themeIconDark = themeToggleBtn?.querySelector(".theme-icon-dark");

  async function applyTheme(theme) {
    if (theme === "light") {
      sidebarEl.classList.add("theme-light");
      if (themeIconLight) themeIconLight.style.display = "none";
      if (themeIconDark) themeIconDark.style.display = "block";
    } else {
      sidebarEl.classList.remove("theme-light");
      if (themeIconLight) themeIconLight.style.display = "block";
      if (themeIconDark) themeIconDark.style.display = "none";
    }
  }

  async function getTheme() {
    try {
      const { theme } = await chrome.storage.local.get("theme");
      return theme || "dark";
    } catch {
      return "dark";
    }
  }

  // Load and apply theme
  getTheme().then(applyTheme);

  // Theme toggle button click
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", async () => {
      const currentTheme = await getTheme();
      const newTheme = currentTheme === "dark" ? "light" : "dark";
      await chrome.storage.local.set({ theme: newTheme });
      applyTheme(newTheme);
    });
  }

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

  // Load thumbnail for a file item
  async function loadThumbnailForFile(file, item) {
    const thumbnailContainer = item.querySelector(".file-thumbnail");
    const img = thumbnailContainer?.querySelector("img");
    const placeholder = thumbnailContainer?.querySelector(
      ".thumbnail-placeholder",
    );

    if (!img || !placeholder) return;

    // Try to get cached thumbnail
    try {
      const cached = await chrome.runtime.sendMessage({
        type: "GET_CACHED_THUMBNAIL",
        path: file.path,
      });

      if (cached?.ok && cached.thumbnail) {
        img.src = cached.thumbnail;
        img.style.display = "block";
        placeholder.style.display = "none";
        return;
      }
    } catch (err) {
      // Continue to generate
    }

    // Generate thumbnail
    try {
      const result = await chrome.runtime.sendMessage({
        type: "GENERATE_THUMBNAIL",
        path: file.path,
      });

      if (result?.ok && result.thumbnail) {
        img.src = result.thumbnail;
        img.style.display = "block";
        placeholder.style.display = "none";
      }
    } catch (err) {
      console.error("Failed to generate thumbnail:", err);
    }
  }

  // Load thumbnail for preview modal
  async function loadThumbnailForPreview(file, img, placeholder) {
    // Try to get cached thumbnail
    try {
      const cached = await chrome.runtime.sendMessage({
        type: "GET_CACHED_THUMBNAIL",
        path: file.path,
      });

      if (cached?.ok && cached.thumbnail) {
        img.src = cached.thumbnail;
        img.style.display = "block";
        placeholder.style.display = "none";
        return;
      }
    } catch (err) {
      // Continue to generate
    }

    // Generate thumbnail
    try {
      const result = await chrome.runtime.sendMessage({
        type: "GENERATE_THUMBNAIL",
        path: file.path,
      });

      if (result?.ok && result.thumbnail) {
        img.src = result.thumbnail;
        img.style.display = "block";
        placeholder.style.display = "none";
      }
    } catch (err) {
      console.error("Failed to generate thumbnail:", err);
    }
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

      // Add checkbox if in batch mode
      const checkboxHtml = batchMode
        ? `<input type="checkbox" class="file-checkbox" data-path="${file.path}" data-sha="${file.sha}" ${selectedFiles.has(file.path) ? "checked" : ""} style="margin-right: 6px; cursor: pointer; accent-color: #4f8ef7;" />`
        : "";

      item.innerHTML = `
        ${checkboxHtml}
        <div class="file-thumbnail" style="width: 50px; height: 38px; border-radius: 4px; overflow: hidden; flex-shrink: 0; background: var(--surface); display: flex; align-items: center; justify-content: center;">
          <img src="" alt="" style="width: 100%; height: 100%; object-fit: cover; display: none;" />
          <svg width="20" height="20" viewBox="0 0 14 14" fill="none" class="thumbnail-placeholder" style="color: var(--muted);">
            <path d="M2 1.5h6l4 4v7a1 1 0 01-1 1H3a1 1 0 01-1-1v-9a1 1 0 011-1z" stroke="currentColor" stroke-width="1.2"/>
            <path d="M8 1.5v4h4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="file-info" style="flex: 1; min-width: 0;">
          <div class="file-name">${file.name}</div>
          <div class="file-meta">${formatSize(file.size)}</div>
        </div>
        <div class="file-actions">
          <button class="file-action-btn preview" title="Preview file" data-path="${file.path}">
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
              <path d="M1 7s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z" stroke="currentColor" stroke-width="1.2"/>
              <circle cx="7" cy="7" r="1.5" stroke="currentColor" stroke-width="1.2"/>
            </svg>
          </button>
          <button class="file-action-btn delete" title="Delete file" data-path="${file.path}" data-sha="${file.sha}">
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
              <path d="M3 4h8M5 4V3a1 1 0 011-1h2a1 1 0 011 1v1M10 4v7a1 1 0 01-1 1H5a1 1 0 01-1-1V4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M6 6v4M8 6v4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      `;

      // Load thumbnail
      loadThumbnailForFile(file, item);

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

    // Add preview button listeners
    document.querySelectorAll(".file-action-btn.preview").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const path = btn.dataset.path;
        const file = currentFiles.find((f) => f.path === path);
        if (file) showFilePreview(file);
      });
    });

    // Add checkbox listeners for batch selection
    if (batchMode) {
      document.querySelectorAll(".file-checkbox").forEach((checkbox) => {
        checkbox.addEventListener("change", (e) => {
          e.stopPropagation();
          const path = checkbox.dataset.path;
          const sha = checkbox.dataset.sha;

          if (checkbox.checked) {
            selectedFiles.set(path, { path, sha });
          } else {
            selectedFiles.delete(path);
          }

          // Update batch actions bar
          batchSelectedCount.textContent = selectedFiles.size;
          batchActionsBar.style.display =
            selectedFiles.size > 0 ? "block" : "none";
        });
      });
    }
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

  // Import button
  const importBtn = document.getElementById("excalihub-import");
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".excalidraw,.json";
  fileInput.style.display = "none";
  document.body.appendChild(fileInput);

  importBtn.addEventListener("click", () => {
    fileInput.click();
  });

  // New Drawing button
  const newDrawingBtn = document.getElementById("excalihub-new-drawing");
  newDrawingBtn.addEventListener("click", () => {
    showConfirmation(
      "Create New Drawing",
      "This will clear the current canvas. Make sure to save your work first!",
      () => {
        // Clear Excalidraw canvas
        localStorage.setItem("excalidraw", JSON.stringify([]));
        localStorage.setItem("excalidraw-state", JSON.stringify({}));
        localStorage.removeItem("excalidraw-files");

        showToast("✓ New drawing created", "success");

        // Reload the page to apply changes
        setTimeout(() => window.location.reload(), 300);
      },
      "Create New",
      "primary",
    );
  });

  fileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file
    if (!file.name.endsWith(".excalidraw") && !file.name.endsWith(".json")) {
      showToast("Please select a valid .excalidraw file", "error");
      return;
    }

    try {
      const content = await file.text();
      const sceneData = JSON.parse(content);

      // Validate it's a proper Excalidraw file
      if (!sceneData.type || sceneData.type !== "excalidraw") {
        throw new Error("Invalid Excalidraw file format");
      }

      // Show confirmation dialog
      showConfirmation(
        "Import File",
        `Import <strong>${file.name}</strong> to GitHub?`,
        async () => {
          try {
            // Upload to GitHub
            const jsonStr = JSON.stringify(sceneData, null, 2);
            const b64 = btoa(unescape(encodeURIComponent(jsonStr)));

            const settings = await chrome.storage.sync.get([
              "owner",
              "repo",
              "branch",
              "savePath",
            ]);

            if (!settings.owner || !settings.repo) {
              throw new Error("Please configure your repository first.");
            }

            const { token } = await chrome.storage.local.get("token");
            if (!token) {
              throw new Error("Please connect your GitHub account.");
            }

            const response = await chrome.runtime.sendMessage({
              type: "IMPORT_FILE",
              fileName: file.name,
              content: b64,
              settings: {
                owner: settings.owner,
                repo: settings.repo,
                branch: settings.branch || "main",
                savePath: settings.savePath || "drawings/",
              },
            });

            if (response?.error) {
              throw new Error(response.error);
            }

            showToast(`✓ Imported ${file.name} to GitHub`, "success");
            // Reload file list
            loadFileList();
          } catch (err) {
            showToast(err.message, "error");
          }
        },
        "Import",
        "primary",
      );
    } catch (err) {
      showToast(`Invalid file: ${err.message}`, "error");
    }

    // Reset file input
    fileInput.value = "";
  });

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

  // Batch select all button
  const batchSelectBtn = document.getElementById("excalihub-batch-select");
  const batchActionsBar = document.getElementById("excalihub-batch-actions");
  const batchSelectedCount = document.getElementById("batch-selected-count");
  const batchDeleteBtn = document.getElementById("excalihub-batch-delete");

  batchSelectBtn.addEventListener("click", () => {
    batchMode = !batchMode;
    batchSelectBtn.textContent = batchMode ? "☑" : "☐";
    batchSelectBtn.style.borderColor = batchMode ? "#4f8ef7" : "#252b33";
    batchSelectBtn.style.color = batchMode ? "#4f8ef7" : "#6b7685";

    if (batchMode) {
      // Show checkboxes
      renderFiles();
    } else {
      // Clear selection and hide batch actions
      selectedFiles.clear();
      batchActionsBar.style.display = "none";
      renderFiles();
    }
  });

  // Batch delete button
  batchDeleteBtn.addEventListener("click", () => {
    if (selectedFiles.size === 0) return;

    showConfirmation(
      "Delete Selected Files",
      `Are you sure you want to delete <strong>${selectedFiles.size} files</strong>? This action cannot be undone.`,
      async () => {
        batchDeleteBtn.disabled = true;
        batchDeleteBtn.textContent = "Deleting...";

        let successCount = 0;
        let errorCount = 0;

        for (const { path, sha } of selectedFiles.values()) {
          try {
            const response = await chrome.runtime.sendMessage({
              type: "DELETE_FILE",
              path,
              sha,
            });

            if (response?.error) {
              errorCount++;
              console.error("Failed to delete:", path, response.error);
            } else {
              successCount++;
            }
          } catch (err) {
            errorCount++;
            console.error("Failed to delete:", path, err);
          }
        }

        selectedFiles.clear();
        batchActionsBar.style.display = "none";
        batchDeleteBtn.disabled = false;
        batchDeleteBtn.textContent = "Delete Selected";

        if (successCount > 0) {
          showToast(`✓ Deleted ${successCount} files`, "success");
        }
        if (errorCount > 0) {
          showToast(`Failed to delete ${errorCount} files`, "error");
        }

        // Reload file list
        loadFileList();
      },
      "Delete All",
      "danger",
    );
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

  // Show file preview modal
  function showFilePreview(file) {
    const overlay = document.createElement("div");
    overlay.className = "preview-dialog";
    overlay.innerHTML = `
      <div class="preview-box">
        <div class="preview-header">
          <div class="preview-title">${file.name}</div>
          <button class="preview-close" title="Close preview">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
        <div class="preview-content">
          <div class="preview-thumbnail" style="
            width: 100%;
            height: 180px;
            border-radius: 8px;
            overflow: hidden;
            background: var(--surface);
            border: 1px solid var(--border);
            margin-bottom: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
          ">
            <img src="" alt="" style="width: 100%; height: 100%; object-fit: contain; display: none;" />
            <svg width="40" height="40" viewBox="0 0 14 14" fill="none" class="thumbnail-placeholder" style="color: var(--muted);">
              <path d="M2 1.5h6l4 4v7a1 1 0 01-1 1H3a1 1 0 01-1-1v-9a1 1 0 011-1z" stroke="currentColor" stroke-width="1.2"/>
              <path d="M8 1.5v4h4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="preview-info">
            <div class="info-row">
              <span class="info-label">File Name</span>
              <span class="info-value" title="${file.name}">${file.name}</span>
            </div>
            <div class="info-row">
              <span class="info-label">File Size</span>
              <span class="info-value">${formatSize(file.size)}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Path</span>
              <span class="info-value" title="${file.path}">${file.path}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Type</span>
              <span class="info-value">Excalidraw Drawing</span>
            </div>
          </div>
        </div>
        <div class="preview-actions">
          <button class="preview-btn secondary" id="preview-open-github">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M6 1v4H2v8h10V5H8V1H6z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            View on GitHub
          </button>
          <button class="preview-btn secondary" id="preview-version-history">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1v6l3 2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
              <circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1.2"/>
            </svg>
            History
          </button>
          <button class="preview-btn primary" id="preview-load-file">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Load Drawing
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Load thumbnail for preview
    const thumbnailContainer = overlay.querySelector(".preview-thumbnail");
    const img = thumbnailContainer?.querySelector("img");
    const placeholder = thumbnailContainer?.querySelector(
      ".thumbnail-placeholder",
    );

    if (img && placeholder) {
      loadThumbnailForPreview(file, img, placeholder);
    }

    // Event listeners
    overlay
      .querySelector(".preview-close")
      .addEventListener("click", () => overlay.remove());

    document
      .getElementById("preview-open-github")
      .addEventListener("click", () => {
        window.open(file.url, "_blank");
        overlay.remove();
      });

    document
      .getElementById("preview-load-file")
      .addEventListener("click", async () => {
        overlay.remove();
        const fileItem = document.querySelector(
          `.file-item[data-path="${file.path}"]`,
        );
        if (fileItem) {
          await loadFile(file.path, fileItem);
        }
      });

    document
      .getElementById("preview-version-history")
      .addEventListener("click", async () => {
        overlay.remove();
        await showVersionHistory(file);
      });

    // Close on overlay click
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });

    // Close on Escape key
    const escHandler = (e) => {
      if (e.key === "Escape") {
        overlay.remove();
        document.removeEventListener("keydown", escHandler);
      }
    };
    document.addEventListener("keydown", escHandler);
  }

  // Show version history modal
  async function showVersionHistory(file) {
    const overlay = document.createElement("div");
    overlay.className = "version-history-dialog";
    overlay.innerHTML = `
      <div class="version-box">
        <div class="version-header">
          <div class="version-title">Version History</div>
          <button class="version-close" title="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
        <div class="version-content">
          <div class="version-timeline">
            <div style="text-align: center; color: #6b7685; font-size: 12px; padding: 20px;">
              Loading history...
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Event listeners
    overlay
      .querySelector(".version-close")
      .addEventListener("click", () => overlay.remove());
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });

    // Fetch commit history from GitHub
    try {
      const response = await chrome.runtime.sendMessage({
        type: "GET_FILE_HISTORY",
        path: file.path,
      });

      if (response?.error) {
        throw new Error(response.error);
      }

      const timeline = overlay.querySelector(".version-timeline");
      timeline.innerHTML = "";

      if (!response.commits || response.commits.length === 0) {
        timeline.innerHTML =
          '<div style="text-align: center; color: #6b7685; font-size: 12px; padding: 20px;">No history found</div>';
        return;
      }

      response.commits.forEach((commit, index) => {
        const item = document.createElement("div");
        item.className = `version-item${index === 0 ? " current" : ""}`;
        item.innerHTML = `
          <div class="version-dot"></div>
          <div class="version-info">
            <div class="version-date">${commit.date}</div>
            <div class="version-message">${commit.message}</div>
          </div>
          ${
            index > 0
              ? `
            <div class="version-actions">
              <button class="version-restore-btn" data-sha="${commit.sha}">Restore</button>
            </div>
          `
              : '<div style="font-size: 10px; color: #3dd68c; font-weight: 500;">Current</div>'
          }
        `;
        timeline.appendChild(item);
      });

      // Add restore button handlers
      timeline.querySelectorAll(".version-restore-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const sha = btn.dataset.sha;
          try {
            // Load the file content from that commit
            const loadResponse = await chrome.runtime.sendMessage({
              type: "LOAD_FILE_AT_COMMIT",
              path: file.path,
              sha,
            });

            if (loadResponse?.error) {
              throw new Error(loadResponse.error);
            }

            overlay.remove();
            showToast("Version restored! Refreshing...", "success");

            // Import the scene
            const scene = loadResponse.scene;
            localStorage.setItem(
              "excalidraw",
              JSON.stringify(scene.elements || []),
            );
            localStorage.setItem(
              "excalidraw-state",
              JSON.stringify(scene.appState || {}),
            );
            if (scene.files) {
              localStorage.setItem(
                "excalidraw-files",
                JSON.stringify(scene.files),
              );
            }

            setTimeout(() => window.location.reload(), 500);
          } catch (err) {
            showToast(err.message, "error");
          }
        });
      });
    } catch (err) {
      const timeline = overlay.querySelector(".version-timeline");
      timeline.innerHTML = `<div style="text-align: center; color: #f76f6f; font-size: 12px; padding: 20px;">Failed to load history: ${err.message}</div>`;
    }
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
