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

// ─── AI Element Validator ─────────────────────────────────────────────────────

function validateAndRepairElements(rawElements) {
  if (!Array.isArray(rawElements)) return { error: "Invalid: not an array" };

  const repaired = [];
  const errors = [];

  for (let i = 0; i < rawElements.length; i++) {
    const el = rawElements[i];
    if (!el || typeof el !== "object") {
      errors.push(`Element ${i}: not an object`);
      continue;
    }

    const validTypes = [
      "rectangle",
      "ellipse",
      "diamond",
      "text",
      "line",
      "arrow",
      "freedraw",
    ];
    if (!validTypes.includes(el.type)) {
      errors.push(`Element ${i}: invalid type "${el.type}"`);
      continue;
    }

    const repaired_el = {
      id:
        el.id ||
        (crypto.randomUUID
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2)),
      type: el.type,
      x: Number(el.x) || 0,
      y: Number(el.y) || 0,
      width: Math.max(Number(el.width) || 50, 1),
      height: Math.max(Number(el.height) || 50, 1),
      angle: Number(el.angle) || 0,
      strokeColor: el.strokeColor || "#1e1e1e",
      backgroundColor: el.backgroundColor || "transparent",
      fillStyle: el.fillStyle || "hachure",
      strokeWidth: Number(el.strokeWidth) || 2,
      strokeStyle: el.strokeStyle || "solid",
      roughness: el.roughness !== undefined ? Number(el.roughness) : 1,
      opacity: Number(el.opacity) || 100,
      groupIds: Array.isArray(el.groupIds) ? el.groupIds : [],
      frameId: null,
      index: el.index || `a${i}`,
      roundness: el.roundness !== undefined ? el.roundness : null,
      seed: el.seed || Math.floor(Math.random() * 2000000000),
      version: el.version || 1,
      versionNonce: el.versionNonce || Math.floor(Math.random() * 2000000000),
      isDeleted: false,
      boundElements: el.boundElements || null,
      updated: Date.now(),
      link: null,
      locked: false,
    };

    if (el.type === "text") {
      repaired_el.text = el.text || "Text";
      repaired_el.fontSize = Number(el.fontSize) || 20;
      repaired_el.fontFamily = Number(el.fontFamily) || 1;
      repaired_el.textAlign = el.textAlign || "left";
      repaired_el.verticalAlign = el.verticalAlign || "top";
      repaired_el.containerId = null;
      repaired_el.originalText = el.originalText || repaired_el.text;
      repaired_el.autoResize = true;
      repaired_el.lineHeight = 1.25;
    }

    if (el.type === "line" || el.type === "arrow") {
      repaired_el.points =
        Array.isArray(el.points) && el.points.length > 0
          ? el.points.map((p) => [Number(p[0]) || 0, Number(p[1]) || 0])
          : [
              [0, 0],
              [100, 0],
            ];
      repaired_el.startBinding = el.startBinding || null;
      repaired_el.endBinding = el.endBinding || null;
      repaired_el.startArrowhead = el.startArrowhead || null;
      repaired_el.endArrowhead =
        el.endArrowhead || (el.type === "arrow" ? "arrow" : null);
      repaired_el.lastCommittedPoint = null;
    }

    if (el.type === "freedraw") {
      repaired_el.points = Array.isArray(el.points) ? el.points : [[0, 0]];
      repaired_el.pressures = [];
      repaired_el.simulatePressure = true;
    }

    repaired.push(repaired_el);
  }

  if (repaired.length === 0) {
    return { error: "No valid elements generated", errors };
  }

  return {
    elements: repaired,
    warnings: errors.length > 0 ? errors : undefined,
  };
}

function centerElementsOnCanvas(elements) {
  if (!elements || elements.length === 0) return elements;

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const el of elements) {
    minX = Math.min(minX, el.x);
    minY = Math.min(minY, el.y);
    maxX = Math.max(maxX, el.x + (el.width || 0));
    maxY = Math.max(maxY, el.y + (el.height || 0));
  }

  const centerX = (window.innerWidth || 1200) / 2;
  const centerY = (window.innerHeight || 800) / 2;
  const diagramCenterX = (minX + maxX) / 2;
  const diagramCenterY = (minY + maxY) / 2;
  const offsetX = centerX - diagramCenterX;
  const offsetY = centerY - diagramCenterY;

  return elements.map((el) => ({
    ...el,
    x: Math.round(el.x + offsetX),
    y: Math.round(el.y + offsetY),
  }));
}

function applyElementsToCanvas(elements) {
  try {
    // Try Excalidraw's global API first (more reliable than storage events)
    const excalidrawAPI = window.__EXCALIDRAW_API__ || window.excalidrawAPI;
    if (excalidrawAPI && typeof excalidrawAPI.updateScene === "function") {
      try {
        const existing = localStorage.getItem("excalidraw");
        const existingElements = existing ? JSON.parse(existing) : [];
        const allElements = [...existingElements, ...elements];
        excalidrawAPI.updateScene({
          elements: allElements,
          appState: {},
        });
        return { ok: true };
      } catch (apiErr) {
        console.warn(
          "Excalidraw API updateScene failed, falling back:",
          apiErr,
        );
      }
    }

    // Fallback: localStorage + StorageEvent
    const existing = localStorage.getItem("excalidraw");
    const existingElements = existing ? JSON.parse(existing) : [];

    const allElements = [...existingElements, ...elements];
    localStorage.setItem("excalidraw", JSON.stringify(allElements));

    window.dispatchEvent(new StorageEvent("storage", { key: "excalidraw" }));

    return { ok: true };
  } catch (err) {
    return { error: err.message };
  }
}

function parseAIResponse(content) {
  try {
    // Try to find JSON object - look for action field to identify our response format
    // This handles cases where reasoning text appears before the JSON
    const jsonMatch = content.match(
      /\{[\s\S]*"action"\s*:\s*"(generate|improve|analyze|chat)"[\s\S]*\}/,
    );
    if (!jsonMatch) return { action: "chat", message: content };

    const raw = jsonMatch[0];

    // Detect truncated JSON by trying to parse it — brace-counting fails
    // when text contains { or } inside string values.
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (parseErr) {
      if (parseErr instanceof SyntaxError) {
        return {
          action: "error",
          message:
            "The AI response was cut off mid-JSON (token limit reached). Try a simpler request or raise Max Tokens in settings.",
        };
      }
      throw parseErr;
    }

    if (parsed.action === "generate" && Array.isArray(parsed.elements)) {
      const result = validateAndRepairElements(parsed.elements);
      if (result.error) return { action: "error", message: result.error };
      return {
        action: "generate",
        elements: centerElementsOnCanvas(result.elements),
        warnings: result.warnings,
      };
    }
    if (parsed.action === "analyze") {
      return { action: "analyze", analysis: parsed.analysis };
    }
    if (parsed.action === "improve" && Array.isArray(parsed.elements)) {
      const result = validateAndRepairElements(parsed.elements);
      if (result.error) return { action: "error", message: result.error };
      return {
        action: "improve",
        elements: centerElementsOnCanvas(result.elements),
        summary: parsed.summary,
        warnings: result.warnings,
      };
    }
    if (parsed.action === "chat") {
      return { action: "chat", message: parsed.message };
    }
    if (parsed.elements && Array.isArray(parsed.elements)) {
      const result = validateAndRepairElements(parsed.elements);
      if (result.error) return { action: "error", message: result.error };
      return {
        action: "generate",
        elements: centerElementsOnCanvas(result.elements),
        warnings: result.warnings,
      };
    }
    return { action: "chat", message: content };
  } catch {
    return { action: "chat", message: content };
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
        <div class="sidebar-tabs" style="display: flex; background: #0d0f11; border-radius: 6px; padding: 2px; border: 1px solid #252b33;">
          <button class="sidebar-tab active" id="tab-files" style="padding: 3px 10px; border-radius: 4px; border: none; font-size: 11px; cursor: pointer; font-family: 'DM Sans', sans-serif; background: #4f8ef7; color: white;">Files</button>
          <button class="sidebar-tab" id="tab-ai" style="padding: 3px 10px; border-radius: 4px; border: none; font-size: 11px; cursor: pointer; font-family: 'DM Sans', sans-serif; background: transparent; color: #6b7685;">AI</button>
        </div>
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

        <!-- AI Chat Panel (hidden by default) -->
        <div id="excalihub-ai-sidebar-panel" style="display: none; flex-direction: column; height: calc(100vh - 120px);">
          <!-- AI Header with controls -->
          <div id="excalihub-ai-sidebar-header" style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border-bottom: 1px solid var(--border); flex-shrink: 0;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <button id="excalihub-ai-context-toggle" title="Include canvas context" style="
                background: #1a2a1a;
                border: 1px solid #2d5a2d;
                color: #4ade80;
                border-radius: 4px;
                padding: 3px 8px;
                font-size: 10px;
                cursor: pointer;
                font-family: 'DM Sans', sans-serif;
                transition: all 0.15s;
              ">Context: ON</button>
            </div>
            <div style="display: flex; align-items: center; gap: 4px;">
              <button id="excalihub-ai-clear" title="New conversation" style="
                background: none; border: none; color: var(--muted); cursor: pointer; padding: 4px; display: flex; align-items: center; border-radius: 4px; transition: color 0.15s, background 0.15s;
              ">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 4h10M5 4V2.5a1 1 0 011-1h2a1 1 0 011 1V4M11 4v7.5a1 1 0 01-1 1H4a1 1 0 01-1-1V4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            </div>
          </div>
          <div id="excalihub-ai-sidebar-messages" style="flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px;">
            <div style="text-align: center; color: var(--muted); font-size: 12px; padding: 16px;">
              Ask me to generate, analyze, or improve your diagrams.
            </div>
          </div>
          <div style="display: flex; gap: 8px; padding: 10px 12px; border-top: 1px solid var(--border);">
            <textarea id="excalihub-ai-sidebar-input" placeholder="Ask AI..." rows="1" style="
              flex: 1; background: var(--bg); border: 1px solid var(--border); color: var(--text);
              border-radius: 6px; padding: 7px 10px; font-size: 12px; outline: none;
              resize: none; font-family: 'DM Sans', sans-serif; max-height: 80px;
              transition: border-color 0.15s;
            "></textarea>
            <button id="excalihub-ai-sidebar-send" style="
              background: linear-gradient(135deg, #7c3aed, #4f8ef7); border: none;
              border-radius: 6px; padding: 0 12px; cursor: pointer; display: flex; align-items: center;
              transition: opacity 0.15s;
            ">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 8l12-6-6 12V8H2z" fill="white"/></svg>
            </button>
            <button id="excalihub-ai-sidebar-stop" style="
              background: #5c1c1c; border: 1px solid #f76f6f; border-radius: 6px; padding: 0 12px;
              cursor: pointer; display: none; align-items: center; justify-content: center;
              color: #f76f6f; font-size: 11px; font-weight: 600; font-family: 'DM Sans', sans-serif;
            ">Stop</button>
          </div>
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

    @keyframes thinkingDot {
      0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
      30% { transform: translateY(-4px); opacity: 1; }
    }

    /* ── AI message markdown ── */
    .eai-msg-text strong { font-weight: 600; color: var(--text); }
    .eai-msg-text em { font-style: italic; opacity: 0.85; }
    .eai-msg-text code {
      font-family: 'DM Mono', monospace;
      font-size: 11px;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 3px;
      padding: 1px 4px;
    }
    .eai-msg-text p { margin: 0 0 6px 0; }
    .eai-msg-text p:last-child { margin-bottom: 0; }
    .eai-msg-text ul, .eai-msg-text ol {
      margin: 4px 0 6px 16px;
      padding: 0;
    }
    .eai-msg-text li { margin-bottom: 2px; line-height: 1.5; }
    .eai-msg-text h3 {
      font-size: 12px; font-weight: 600;
      margin: 6px 0 3px 0; color: var(--text);
    }

    /* ── Message row hover actions ── */
    .eai-msg-row { position: relative; }
    .eai-msg-row:hover .eai-msg-actions { opacity: 1; }
    .eai-msg-actions {
      opacity: 0;
      transition: opacity 0.15s;
      position: absolute;
      bottom: -18px;
      right: 0;
      display: flex;
      gap: 4px;
      z-index: 2;
    }
    .eai-action-btn {
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--muted);
      border-radius: 4px;
      padding: 2px 6px;
      font-size: 10px;
      cursor: pointer;
      font-family: 'DM Sans', sans-serif;
      transition: color 0.15s, border-color 0.15s;
      white-space: nowrap;
    }
    .eai-action-btn:hover { color: var(--text); border-color: var(--accent); }
    .eai-action-btn.copied { color: var(--success); border-color: var(--success); }

    /* ── Generate card ── */
    .eai-gen-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      overflow: hidden;
      transition: border-color 0.15s;
    }
    .eai-gen-card:hover { border-color: var(--accent); }
    .eai-gen-card-header {
      padding: 8px 10px 6px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .eai-gen-badge {
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      padding: 2px 6px;
      border-radius: 3px;
      background: var(--accent-dim);
      color: var(--accent);
    }
    .eai-gen-badge.improve { background: #1a2a1a; color: #4ade80; }
    .eai-gen-count {
      font-size: 11px;
      color: var(--muted);
      flex: 1;
    }
    .eai-gen-summary {
      font-size: 11px;
      color: var(--text);
      padding: 6px 10px;
      border-bottom: 1px solid var(--border);
      line-height: 1.5;
    }
    .eai-gen-footer {
      padding: 8px 10px;
      display: flex;
      gap: 6px;
      align-items: center;
    }
    .eai-apply-btn {
      flex: 1;
      background: linear-gradient(135deg, #1a2f1a, #1e3a1e);
      border: 1px solid #2d5a2d;
      color: #4ade80;
      border-radius: 6px;
      padding: 6px 10px;
      cursor: pointer;
      font-size: 11px;
      font-weight: 600;
      font-family: 'DM Sans', sans-serif;
      transition: opacity 0.15s, transform 0.1s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
    }
    .eai-apply-btn:hover { opacity: 0.88; }
    .eai-apply-btn:active { transform: scale(0.97); }
    .eai-apply-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .eai-apply-btn.applied {
      background: var(--bg);
      border-color: var(--border);
      color: var(--muted);
    }

    /* ── Suggested prompts ── */
    .eai-suggestions {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 12px;
      align-items: stretch;
    }
    .eai-suggestions-title {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
      margin-bottom: 2px;
    }
    .eai-suggestion-chip {
      background: var(--bg);
      border: 1px solid var(--border);
      color: var(--text);
      border-radius: 6px;
      padding: 7px 10px;
      font-size: 11px;
      cursor: pointer;
      font-family: 'DM Sans', sans-serif;
      text-align: left;
      transition: border-color 0.15s, background 0.15s;
      line-height: 1.4;
    }
    .eai-suggestion-chip:hover {
      border-color: var(--accent);
      background: var(--accent-dim);
      color: var(--accent);
    }

    /* ── Char counter ── */
    .eai-char-counter {
      font-size: 10px;
      color: var(--muted);
      text-align: right;
      padding: 2px 4px 0;
      transition: color 0.15s;
    }
    .eai-char-counter.warn { color: var(--warn); }

    /* ── Streaming cursor ── */
    .eai-cursor {
      display: inline-block;
      width: 2px;
      height: 12px;
      background: var(--accent);
      border-radius: 1px;
      margin-left: 2px;
      vertical-align: text-bottom;
      animation: eai-blink 0.8s step-end infinite;
    }
    @keyframes eai-blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0; }
    }

    /* ── Message fade-in ── */
    @keyframes eai-fadein {
      from { opacity: 0; transform: translateY(4px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .eai-msg-row { animation: eai-fadein 0.18s ease; }
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

  // Tab switching
  const tabFiles = document.getElementById("tab-files");
  const tabAI = document.getElementById("tab-ai");
  const filesSection = sidebarEl.querySelector(".sidebar-section");
  const aiSidebarPanel = document.getElementById("excalihub-ai-sidebar-panel");

  let aiChatInitialized = false;

  if (tabFiles && tabAI && filesSection && aiSidebarPanel) {
    tabFiles.addEventListener("click", () => {
      tabFiles.style.background = "#4f8ef7";
      tabFiles.style.color = "white";
      tabAI.style.background = "transparent";
      tabAI.style.color = "#6b7685";
      filesSection.style.display = "block";
      aiSidebarPanel.style.display = "none";
    });

    tabAI.addEventListener("click", () => {
      tabAI.style.background = "#4f8ef7";
      tabAI.style.color = "white";
      tabFiles.style.background = "transparent";
      tabFiles.style.color = "#6b7685";
      filesSection.style.display = "none";
      aiSidebarPanel.style.display = "flex";

      // Lazy initialize AI chat on first tab click
      if (!aiChatInitialized) {
        aiChatInitialized = true;
        initSidebarAIChat();
      } else {
        // On subsequent opens, restore history if messages div is empty
        const messagesEl = document.getElementById(
          "excalihub-ai-sidebar-messages",
        );
        if (
          messagesEl &&
          messagesEl.children.length === 0 &&
          aiChatState.history.length > 0
        ) {
          renderSidebarHistory(messagesEl);
        }
      }
    });
  }

  // ─── Sidebar AI Chat ───────────────────────────────────────────────────────

  function renderSidebarHistory(messagesEl) {
    if (!messagesEl || aiChatState.history.length === 0) return;
    messagesEl.innerHTML = "";
    for (const msg of aiChatState.history) {
      if (msg.role === "user") {
        const row = document.createElement("div");
        row.className = "eai-msg-row";
        row.style.cssText =
          "align-self: flex-end; max-width: 88%; margin-bottom: 18px;";
        const bubble = document.createElement("div");
        bubble.style.cssText =
          "background: var(--accent-dim); color: var(--text); padding: 8px 12px; border-radius: 12px 12px 4px 12px; font-size: 12px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; border: 1px solid rgba(79,142,247,0.2);";
        bubble.textContent = msg.content;
        row.appendChild(bubble);
        messagesEl.appendChild(row);
      } else {
        const row = document.createElement("div");
        row.className = "eai-msg-row";
        row.style.cssText =
          "align-self: flex-start; max-width: 92%; margin-bottom: 18px;";
        if (
          msg.parsed &&
          (msg.parsed.action === "generate" ||
            msg.parsed.action === "improve") &&
          Array.isArray(msg.parsed.elements)
        ) {
          row.appendChild(buildGenerateCard(msg.parsed));
        } else {
          const bubble = document.createElement("div");
          bubble.style.cssText =
            "background: var(--surface); padding: 8px 12px; border-radius: 12px 12px 12px 4px; border: 1px solid var(--border);";
          const text =
            msg.parsed?.analysis || msg.parsed?.message || msg.content;
          bubble.appendChild(renderMarkdown(text));
          row.appendChild(bubble);
        }
        messagesEl.appendChild(row);
      }
    }
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function initSidebarAIChat() {
    const input = document.getElementById("excalihub-ai-sidebar-input");
    const sendBtn = document.getElementById("excalihub-ai-sidebar-send");
    const stopBtn = document.getElementById("excalihub-ai-sidebar-stop");
    const messagesEl = document.getElementById("excalihub-ai-sidebar-messages");
    const clearBtn = document.getElementById("excalihub-ai-clear");
    const contextToggle = document.getElementById(
      "excalihub-ai-context-toggle",
    );

    if (!input || !sendBtn || !messagesEl) return;

    // Load persisted conversation history
    (async function loadHistory() {
      try {
        const stored = await chrome.storage.local.get("aiConversationHistory");
        if (
          stored.aiConversationHistory &&
          Array.isArray(stored.aiConversationHistory)
        ) {
          aiChatState.history = stored.aiConversationHistory;
          if (aiChatState.history.length > 0) {
            messagesEl.innerHTML = "";
            for (const msg of aiChatState.history) {
              if (msg.role === "user") {
                appendUserMessage(msg.content);
              } else {
                appendAIMessage(msg.content, msg.parsed);
              }
            }
            messagesEl.scrollTop = messagesEl.scrollHeight;
            return;
          }
        }
      } catch (err) {
        console.error("Failed to load AI history:", err);
      }
      // Default welcome with suggested prompts
      messagesEl.innerHTML = "";
      renderSuggestedPrompts();
    })();

    // Load context mode from settings
    (async function loadContextMode() {
      try {
        const aiSettings = await chrome.runtime.sendMessage({
          type: "AI_GET_SETTINGS",
        });
        if (aiSettings?.ok) {
          aiChatState.contextIncluded =
            aiSettings.settings.contextMode === "auto";
          if (contextToggle) {
            updateContextToggle();
          }
        }
      } catch (err) {
        console.error("Failed to load AI settings:", err);
      }
    })();

    function updateContextToggle() {
      contextToggle.textContent = aiChatState.contextIncluded
        ? "Context: ON"
        : "Context: OFF";
      contextToggle.style.background = aiChatState.contextIncluded
        ? "#1a2a1a"
        : "var(--surface)";
      contextToggle.style.borderColor = aiChatState.contextIncluded
        ? "#2d5a2d"
        : "var(--border)";
      contextToggle.style.color = aiChatState.contextIncluded
        ? "#4ade80"
        : "var(--muted)";
    }

    // Context toggle
    if (contextToggle) {
      contextToggle.addEventListener("click", () => {
        aiChatState.contextIncluded = !aiChatState.contextIncluded;
        updateContextToggle();
      });
    }

    // Clear conversation
    if (clearBtn) {
      clearBtn.addEventListener("click", async () => {
        aiChatState.history = [];
        try {
          await chrome.storage.local.set({ aiConversationHistory: [] });
        } catch (err) {
          console.error("Failed to clear history:", err);
        }
        messagesEl.innerHTML = `
          <div style="text-align: center; color: var(--muted); font-size: 12px; padding: 16px;">
            Conversation cleared. Ask me anything!
          </div>`;
        renderSuggestedPrompts();
      });
    }

    // Auto-resize textarea
    input.addEventListener("input", () => {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 80) + "px";
    });

    // Enter to send
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendBtn.click();
      }
    });

    // Debounced send
    let lastSendTime = 0;
    const SEND_DEBOUNCE_MS = 500;

    sendBtn.addEventListener("click", async () => {
      const now = Date.now();
      if (now - lastSendTime < SEND_DEBOUNCE_MS) return;

      const text = input.value.trim();
      if (!text || aiChatState.isStreaming) return;

      lastSendTime = now;
      input.value = "";
      input.style.height = "auto";

      // Clear welcome message if present
      if (
        messagesEl.querySelector('[style*="text-align: center"]') &&
        aiChatState.history.length === 0
      ) {
        messagesEl.innerHTML = "";
      }

      // Append user message
      appendUserMessage(text);

      // Show thinking indicator
      showThinkingIndicator();

      // Show stop button, hide send
      aiChatState.isStreaming = true;
      sendBtn.style.display = "none";
      if (stopBtn) stopBtn.style.display = "flex";

      const canvasContext = aiChatState.contextIncluded
        ? getExcalidrawScene().scene
        : null;

      aiChatState.history.push({
        role: "user",
        content: text,
        timestamp: Date.now(),
      });

      try {
        // Open a port for streaming before sending the message
        const PORT_NAME = "ai-stream-sidebar";
        let streamPort = null;
        const streamPromise = new Promise((resolve) => {
          streamPort = chrome.runtime.connect({ name: PORT_NAME });
          let accumulatedContent = "";
          streamPort.onMessage.addListener((portMsg) => {
            if (portMsg.type === "chunk") {
              accumulatedContent = portMsg.fullContent;
              updateStreamingMessage(portMsg.fullContent);
            } else if (portMsg.type === "done") {
              accumulatedContent = portMsg.fullContent;
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
          history: aiChatState.history.filter((m) => m.role !== "system"),
          _portName: PORT_NAME,
        });

        const response = await streamPromise;
        try {
          streamPort.disconnect();
        } catch (_) {}

        removeThinkingIndicator();

        aiChatState.isStreaming = false;
        sendBtn.style.display = "flex";
        if (stopBtn) stopBtn.style.display = "none";

        if (response?.error) {
          appendErrorMessage(response.error);
          return;
        }

        const fullContent = response?.content || "";
        const parsed = parseAIResponse(fullContent);

        if (parsed.action === "generate" || parsed.action === "improve") {
          const displayText = parsed.summary || fullContent;
          appendAIMessage(displayText, parsed);
        } else if (parsed.action === "analyze") {
          appendAIMessage(parsed.analysis || fullContent, parsed);
        } else {
          appendAIMessage(parsed.message || fullContent, parsed);
        }

        // Persist history (last 50 messages)
        aiChatState.history.push({
          role: "assistant",
          content: fullContent,
          parsed,
          timestamp: Date.now(),
        });
        persistHistory();
      } catch (err) {
        removeThinkingIndicator();
        aiChatState.isStreaming = false;
        sendBtn.style.display = "flex";
        if (stopBtn) stopBtn.style.display = "none";
        appendErrorMessage("Network error: " + err.message);
      }

      messagesEl.scrollTop = messagesEl.scrollHeight;
    });

    // Stop button
    if (stopBtn) {
      stopBtn.addEventListener("click", () => {
        chrome.runtime.sendMessage({ type: "AI_STOP_GENERATION" });
        aiChatState.isStreaming = false;
        sendBtn.style.display = "flex";
        stopBtn.style.display = "none";
        removeThinkingIndicator();
        appendAIMessage("Response stopped.", { action: "chat" });
      });
    }

    // ── Markdown renderer (minimal, no deps) ──
    function renderMarkdown(text) {
      const el = document.createElement("div");
      el.className = "eai-msg-text";
      el.style.cssText =
        "font-size: 12px; line-height: 1.6; color: var(--text); word-break: break-word;";
      // Split into lines and process
      let html = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        .replace(/`([^`]+)`/g, "<code>$1</code>")
        .replace(/^### (.+)$/gm, "<h3>$1</h3>")
        .replace(/^## (.+)$/gm, "<h3>$1</h3>")
        .replace(/^[-•] (.+)$/gm, "<li>$1</li>")
        .replace(/(<li>.*<\/li>)/gs, "<ul>$1</ul>")
        .replace(/\n{2,}/g, "</p><p>")
        .replace(/\n/g, "<br>");
      el.innerHTML = "<p>" + html + "</p>";
      return el;
    }

    // ── Message rendering helpers ──

    function appendUserMessage(text) {
      const row = document.createElement("div");
      row.className = "eai-msg-row";
      row.style.cssText =
        "align-self: flex-end; max-width: 88%; margin-bottom: 18px;";

      const bubble = document.createElement("div");
      bubble.style.cssText =
        "background: var(--accent-dim); color: var(--text); padding: 8px 12px; border-radius: 12px 12px 4px 12px; font-size: 12px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; border: 1px solid rgba(79,142,247,0.2);";
      bubble.textContent = text;
      row.appendChild(bubble);

      const actions = document.createElement("div");
      actions.className = "eai-msg-actions";
      actions.style.right = "0";
      const copyBtn = makeCopyBtn(text);
      actions.appendChild(copyBtn);
      row.appendChild(actions);

      messagesEl.appendChild(row);
    }

    function makeCopyBtn(text) {
      const btn = document.createElement("button");
      btn.className = "eai-action-btn";
      btn.textContent = "Copy";
      btn.addEventListener("click", () => {
        navigator.clipboard.writeText(text).then(() => {
          btn.textContent = "Copied!";
          btn.classList.add("copied");
          setTimeout(() => {
            btn.textContent = "Copy";
            btn.classList.remove("copied");
          }, 1500);
        });
      });
      return btn;
    }

    function appendAIMessage(text, parsed) {
      const row = document.createElement("div");
      row.className = "eai-msg-row";
      row.style.cssText =
        "align-self: flex-start; max-width: 92%; margin-bottom: 18px;";

      if (
        parsed &&
        (parsed.action === "generate" || parsed.action === "improve") &&
        Array.isArray(parsed.elements)
      ) {
        const card = buildGenerateCard(parsed);
        row.appendChild(card);
      } else {
        const bubble = document.createElement("div");
        bubble.style.cssText =
          "background: var(--surface); padding: 8px 12px; border-radius: 12px 12px 12px 4px; border: 1px solid var(--border);";
        bubble.appendChild(renderMarkdown(text));
        row.appendChild(bubble);

        const actions = document.createElement("div");
        actions.className = "eai-msg-actions";
        actions.appendChild(makeCopyBtn(text));
        row.appendChild(actions);
      }

      messagesEl.appendChild(row);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function buildGenerateCard(parsed) {
      const isImprove = parsed.action === "improve";
      const card = document.createElement("div");
      card.className = "eai-gen-card";

      // Header
      const header = document.createElement("div");
      header.className = "eai-gen-card-header";
      const badge = document.createElement("span");
      badge.className = "eai-gen-badge" + (isImprove ? " improve" : "");
      badge.textContent = isImprove ? "Improved" : "Generated";
      const count = document.createElement("span");
      count.className = "eai-gen-count";
      count.textContent = parsed.elements.length + " elements";
      header.appendChild(badge);
      header.appendChild(count);
      card.appendChild(header);

      // Summary
      if (parsed.summary) {
        const summary = document.createElement("div");
        summary.className = "eai-gen-summary";
        summary.textContent = parsed.summary;
        card.appendChild(summary);
      }

      // Footer with Apply button
      const footer = document.createElement("div");
      footer.className = "eai-gen-footer";

      const applyBtn = document.createElement("button");
      applyBtn.className = "eai-apply-btn";
      applyBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg> Apply to Canvas`;

      // Auto-apply elements immediately to canvas
      const applyResult = applyElementsToCanvas(parsed.elements);
      if (applyResult.ok) {
        applyBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg> Applied! (click to undo)`;
        applyBtn.classList.add("applied");

        // Allow undo by removing the last applied elements
        applyBtn.addEventListener("click", () => {
          try {
            const existing = localStorage.getItem("excalidraw");
            if (existing) {
              const allElements = JSON.parse(existing);
              const idsToRemove = parsed.elements.map((e) => e.id);
              const filtered = allElements.filter(
                (e) => !idsToRemove.includes(e.id),
              );
              localStorage.setItem("excalidraw", JSON.stringify(filtered));
              window.dispatchEvent(
                new StorageEvent("storage", { key: "excalidraw" }),
              );
              applyBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg> Removed`;
              applyBtn.disabled = true;
            }
          } catch (err) {
            console.error("Failed to remove elements:", err);
          }
        });
      } else {
        applyBtn.textContent = "Error applying — retry?";
        applyBtn.addEventListener("click", () => {
          const retryResult = applyElementsToCanvas(parsed.elements);
          if (retryResult.ok) {
            applyBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg> Applied!`;
            applyBtn.classList.add("applied");
            applyBtn.disabled = true;
          }
        });
      }

      footer.appendChild(applyBtn);
      card.appendChild(footer);
      return card;
    }

    function showThinkingIndicator() {
      const wrapper = document.createElement("div");
      wrapper.id = "excalihub-ai-thinking";
      wrapper.className = "eai-msg-row";
      wrapper.style.cssText =
        "align-self: flex-start; max-width: 90%; margin-bottom: 18px;";

      const bubble = document.createElement("div");
      bubble.style.cssText =
        "background: var(--surface); color: var(--muted); padding: 8px 12px; border-radius: 12px 12px 12px 4px; font-size: 12px; border: 1px solid var(--border); display: flex; flex-direction: column; gap: 6px;";
      bubble.innerHTML = `
        <div style="display:flex;align-items:center;gap:6px;">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style="flex-shrink:0;opacity:.6">
            <circle cx="6" cy="6" r="5" stroke="currentColor" stroke-width="1.2"/>
            <path d="M6 3v3l2 1" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
          </svg>
          <span style="font-style:italic">Thinking</span>
          <span style="display:inline-flex;gap:2px;margin-left:2px;">
            <span style="width:4px;height:4px;background:currentColor;border-radius:50%;animation:thinkingDot 1.2s infinite;"></span>
            <span style="width:4px;height:4px;background:currentColor;border-radius:50%;animation:thinkingDot 1.2s infinite 0.2s;"></span>
            <span style="width:4px;height:4px;background:currentColor;border-radius:50%;animation:thinkingDot 1.2s infinite 0.4s;"></span>
          </span>
        </div>
        <div id="excalihub-ai-stream-bubble" style="color: var(--text); font-size: 12px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; margin-top: 4px; padding-top: 6px; border-top: 1px solid var(--border);"></div>`;
      wrapper.appendChild(bubble);
      messagesEl.appendChild(wrapper);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function removeThinkingIndicator() {
      const el = document.getElementById("excalihub-ai-thinking");
      if (el) el.remove();
    }

    function replaceThinkingWithError(errorText) {
      const el = document.getElementById("excalihub-ai-thinking");
      if (el) {
        el.id = "";
        el.innerHTML = "";
        el.style.alignSelf = "flex-start";

        const card = document.createElement("div");
        card.style.cssText =
          "background: var(--error-dim); border: 1px solid #5c1c1c; border-radius: 8px; padding: 8px 10px;";

        const msg = document.createElement("div");
        msg.style.cssText =
          "color: var(--error); font-size: 12px; margin-bottom: 8px;";
        msg.textContent = errorText;
        card.appendChild(msg);

        const actions = document.createElement("div");
        actions.style.cssText = "display: flex; gap: 6px;";

        const retryBtn = document.createElement("button");
        retryBtn.style.cssText =
          "background: transparent; border: 1px solid var(--border); color: var(--muted); border-radius: 5px; padding: 4px 8px; cursor: pointer; font-size: 11px; font-family: 'DM Sans', sans-serif;";
        retryBtn.textContent = "Retry";
        retryBtn.addEventListener("click", () => {
          // Find last user message and resend
          const lastUser = [...aiChatState.history]
            .reverse()
            .find((m) => m.role === "user");
          if (lastUser) {
            card.remove();
            appendUserMessage(lastUser.content);
            showThinkingIndicator();
            aiChatState.isStreaming = true;
            sendBtn.style.display = "none";
            if (stopBtn) stopBtn.style.display = "flex";
            resendMessage(lastUser.content);
          }
        });
        actions.appendChild(retryBtn);

        const settingsLink = document.createElement("a");
        settingsLink.style.cssText =
          "color: var(--accent); font-size: 11px; cursor: pointer; text-decoration: none; display: flex; align-items: center;";
        settingsLink.textContent = "Check AI Settings";
        settingsLink.addEventListener("click", () => {
          chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" });
        });
        actions.appendChild(settingsLink);

        card.appendChild(actions);
        el.appendChild(card);
        return;
      }
      // Fallback: append new error message
      appendErrorMessage(errorText);
    }

    function appendErrorMessage(errorText) {
      const wrapper = document.createElement("div");
      wrapper.style.cssText = "align-self: flex-start; max-width: 90%;";

      const card = document.createElement("div");
      card.style.cssText =
        "background: var(--error-dim); border: 1px solid #5c1c1c; border-radius: 8px; padding: 8px 10px;";

      const msg = document.createElement("div");
      msg.style.cssText =
        "color: var(--error); font-size: 12px; margin-bottom: 8px;";
      msg.textContent = errorText;
      card.appendChild(msg);

      const actions = document.createElement("div");
      actions.style.cssText = "display: flex; gap: 6px;";

      const retryBtn = document.createElement("button");
      retryBtn.style.cssText =
        "background: transparent; border: 1px solid var(--border); color: var(--muted); border-radius: 5px; padding: 4px 8px; cursor: pointer; font-size: 11px; font-family: 'DM Sans', sans-serif;";
      retryBtn.textContent = "Retry";
      retryBtn.addEventListener("click", () => {
        const lastUser = [...aiChatState.history]
          .reverse()
          .find((m) => m.role === "user");
        if (lastUser) {
          card.closest('[style*="align-self"]').remove();
          appendUserMessage(lastUser.content);
          showThinkingIndicator();
          aiChatState.isStreaming = true;
          sendBtn.style.display = "none";
          if (stopBtn) stopBtn.style.display = "flex";
          resendMessage(lastUser.content);
        }
      });
      actions.appendChild(retryBtn);

      const settingsLink = document.createElement("a");
      settingsLink.style.cssText =
        "color: var(--accent); font-size: 11px; cursor: pointer; text-decoration: none; display: flex; align-items: center;";
      settingsLink.textContent = "Check AI Settings";
      settingsLink.addEventListener("click", () => {
        chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" });
      });
      actions.appendChild(settingsLink);

      card.appendChild(actions);
      wrapper.appendChild(card);
      messagesEl.appendChild(wrapper);
    }

    // Streaming message placeholder
    function updateStreamingMessage(content) {
      let bubble = document.getElementById("excalihub-ai-stream-bubble");
      if (!bubble) {
        const thinking = document.getElementById("excalihub-ai-thinking");
        if (thinking) {
          thinking.id = "excalihub-ai-streaming";
          thinking.className = "eai-msg-row";
          thinking.innerHTML = "";
          const b = document.createElement("div");
          b.id = "excalihub-ai-stream-bubble";
          b.style.cssText =
            "background: var(--surface); padding: 8px 12px; border-radius: 12px 12px 12px 4px; border: 1px solid var(--border);";
          thinking.appendChild(b);
          bubble = b;
        }
      }
      if (bubble) {
        // Check if content looks like JSON (diagram generation) — show skeleton
        const trimmed = content.trimStart();
        if (trimmed.startsWith("{")) {
          bubble.innerHTML = `<span style="font-style:italic;color:var(--muted);">✦ Generating diagram…</span><span style="display:inline-flex;gap:3px;margin-left:6px;"><span style="width:4px;height:4px;background:var(--muted);border-radius:50%;animation:thinkingDot 1.2s infinite;"></span><span style="width:4px;height:4px;background:var(--muted);border-radius:50%;animation:thinkingDot 1.2s infinite 0.2s;"></span><span style="width:4px;height:4px;background:var(--muted);border-radius:50%;animation:thinkingDot 1.2s infinite 0.4s;"></span></span>`;
        } else {
          bubble.innerHTML = "";
          bubble.appendChild(renderMarkdown(content));
          const cursor = document.createElement("span");
          cursor.className = "eai-cursor";
          bubble.appendChild(cursor);
        }
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }
    }

    function finalizeStreamingMessage(fullContent, parsed) {
      const streaming = document.getElementById("excalihub-ai-streaming");
      if (streaming) {
        streaming.id = "";
        streaming.innerHTML = "";
        streaming.style.cssText =
          "align-self: flex-start; max-width: 92%; margin-bottom: 18px;";
      }

      if (parsed.action === "generate" || parsed.action === "improve") {
        const streamBubble = document.getElementById(
          "excalihub-ai-stream-bubble",
        );
        const wrapper = streamBubble?.parentElement || streaming;
        if (wrapper) {
          wrapper.innerHTML = "";
          wrapper.appendChild(buildGenerateCard(parsed));
          return;
        }
      }

      // Plain text / analyze — replace with rendered markdown
      const wrapper =
        document.getElementById("excalihub-ai-stream-bubble")?.parentElement ||
        streaming;
      if (wrapper) {
        wrapper.innerHTML = "";
        const text =
          parsed.action === "analyze"
            ? parsed.analysis || fullContent
            : parsed.message || fullContent;
        const bubble = document.createElement("div");
        bubble.style.cssText =
          "background: var(--surface); padding: 8px 12px; border-radius: 12px 12px 12px 4px; border: 1px solid var(--border);";
        bubble.appendChild(renderMarkdown(text));
        wrapper.appendChild(bubble);
        const actions = document.createElement("div");
        actions.className = "eai-msg-actions";
        actions.appendChild(makeCopyBtn(text));
        wrapper.appendChild(actions);
      }
    }

    async function resendMessage(text) {
      const canvasContext = aiChatState.contextIncluded
        ? getExcalidrawScene().scene
        : null;

      // Open a port for streaming
      let streamPort = null;
      const streamPromise = new Promise((resolve) => {
        streamPort = chrome.runtime.connect({
          name: "ai-stream-sidebar-resend",
        });
        streamPort.onMessage.addListener((portMsg) => {
          if (portMsg.type === "chunk") {
            updateStreamingMessage(portMsg.fullContent);
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
        history: aiChatState.history.filter((m) => m.role !== "system"),
        _portName: "ai-stream-sidebar-resend",
      });

      const response = await streamPromise;
      try {
        streamPort.disconnect();
      } catch (_) {}

      removeThinkingIndicator();

      aiChatState.isStreaming = false;
      sendBtn.style.display = "flex";
      if (stopBtn) stopBtn.style.display = "none";

      if (response?.error) {
        appendErrorMessage(response.error);
        return;
      }

      const fullContent = response?.content || "";
      const parsed = parseAIResponse(fullContent);

      if (parsed.action === "generate" || parsed.action === "improve") {
        appendAIMessage(parsed.summary || fullContent, parsed);
      } else {
        appendAIMessage(
          parsed.message || parsed.analysis || fullContent,
          parsed,
        );
      }

      aiChatState.history.push({
        role: "assistant",
        content: fullContent,
        parsed,
        timestamp: Date.now(),
      });
      persistHistory();

      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    async function persistHistory() {
      try {
        await chrome.storage.local.set({
          aiConversationHistory: aiChatState.history.slice(-50),
        });
      } catch (err) {
        console.error("Failed to persist history:", err);
      }
    }

    // ── Suggested prompts on empty state ──
    const SUGGESTIONS = [
      "Build an org chart showing a school role structure",
      "Draw a flowchart for a student registration process",
      "Analyze my current diagram and suggest improvements",
      "Create a system architecture diagram for a web app",
    ];

    function renderSuggestedPrompts() {
      const container = document.createElement("div");
      container.className = "eai-suggestions";
      const title = document.createElement("div");
      title.className = "eai-suggestions-title";
      title.textContent = "Try asking…";
      container.appendChild(title);
      SUGGESTIONS.forEach((s) => {
        const chip = document.createElement("button");
        chip.className = "eai-suggestion-chip";
        chip.textContent = s;
        chip.addEventListener("click", () => {
          input.value = s;
          input.style.height = "auto";
          input.style.height = Math.min(input.scrollHeight, 80) + "px";
          input.focus();
          updateCharCounter();
        });
        container.appendChild(chip);
      });
      messagesEl.appendChild(container);
    }

    // ── Char counter ──
    const charCounterEl = document.createElement("div");
    charCounterEl.className = "eai-char-counter";
    charCounterEl.style.cssText =
      "font-size:10px;color:var(--muted);text-align:right;padding:2px 2px 0;";
    input.parentElement.after(charCounterEl);

    function updateCharCounter() {
      const len = input.value.length;
      charCounterEl.textContent = len > 200 ? `${len} chars` : "";
      charCounterEl.classList.toggle("warn", len > 800);
    }
    input.addEventListener("input", updateCharCounter);
  } // end initSidebarAIChat
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
        // Extract date from filename (format: name_YYYY-MM-DD.excalidraw)
        const extractDate = (name) => {
          const match = name.match(/(\d{4}-\d{2}-\d{2})/);
          if (match) return new Date(match[1]).getTime();
          return 0; // Files without dates sort first
        };
        return modifier * (extractDate(a.name) - extractDate(b.name));
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
  if (msg.type === "APPLY_ELEMENTS") {
    const result = applyElementsToCanvas(msg.elements || []);
    sendResponse(result);
    return true;
  }

  if (msg.type === "REMOVE_ELEMENTS") {
    try {
      const existing = localStorage.getItem("excalidraw");
      if (existing) {
        const allElements = JSON.parse(existing);
        const idsToRemove = msg.elementIds || [];
        const filtered = allElements.filter((e) => !idsToRemove.includes(e.id));
        localStorage.setItem("excalidraw", JSON.stringify(filtered));
        window.dispatchEvent(
          new StorageEvent("storage", { key: "excalidraw" }),
        );
        sendResponse({ ok: true });
      } else {
        sendResponse({ error: "No canvas data found" });
      }
    } catch (err) {
      sendResponse({ error: err.message });
    }
    return true;
  }

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

// ─── AI Chat UI ──────────────────────────────────────────────────────────────

let aiChatState = {
  history: [],
  isStreaming: false,
  contextIncluded: true,
  floatingInitialized: false,
};

async function injectAIChat() {
  if (document.getElementById("excalihub-ai-float")) return;

  const settings = await chrome.runtime.sendMessage({
    type: "AI_GET_SETTINGS",
  });
  const hasApiKey = settings?.ok && settings.settings.hasApiKey;

  // Load saved history
  const savedHistory = await chrome.runtime.sendMessage({
    type: "AI_GET_HISTORY",
  });
  if (savedHistory?.ok) aiChatState.history = savedHistory.history || [];

  const aiFloat = document.createElement("div");
  aiFloat.id = "excalihub-ai-float";
  aiFloat.innerHTML = `
    <div id="excalihub-ai-trigger" style="
      position: fixed; bottom: 24px; right: 64px; width: 44px; height: 44px;
      background: linear-gradient(135deg, #7c3aed, #4f8ef7); border-radius: 50%;
      display: flex; align-items: center; justify-content: center; cursor: pointer;
      box-shadow: 0 4px 16px rgba(79, 142, 247, 0.3); z-index: 999999;
      transition: transform 0.2s, box-shadow 0.2s;
    " title="ExcaliHub AI Chat">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
      </svg>
    </div>

    <div id="excalihub-ai-panel" style="
      position: fixed; bottom: 80px; right: 64px; width: 380px; height: 500px;
      background: var(--bg, #0d0f11); border: 1px solid var(--border, #252b33);
      border-radius: 12px; display: none; flex-direction: column; z-index: 1000000;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5); font-family: 'DM Sans', sans-serif;
      overflow: hidden; resize: both; min-width: 300px; min-height: 400px;
    ">
      <div id="excalihub-ai-header" style="
        display: flex; align-items: center; justify-content: space-between;
        padding: 12px 16px; background: var(--surface, #161a1f); border-bottom: 1px solid var(--border, #252b33);
        cursor: move; user-select: none;
      ">
        <div style="display: flex; align-items: center; gap: 8px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
          </svg>
          <span style="color: var(--text, #e8edf2); font-size: 13px; font-weight: 600;">AI Assistant</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <select id="excalihub-ai-model-select" title="Switch model" style="
            background: var(--bg, #0d0f11); border: 1px solid var(--border, #252b33); color: var(--text, #e8edf2);
            border-radius: 4px; padding: 2px 6px; font-size: 10px; cursor: pointer; font-family: 'DM Sans', sans-serif;
            outline: none; max-width: 120px;
          ">
            <option value="openai/gpt-4o">GPT-4o</option>
            <option value="openai/gpt-4o-mini">GPT-4o mini</option>
            <option value="anthropic/claude-3.5-sonnet">Claude 3.5 Sonnet</option>
            <option value="google/gemini-2.0-flash-exp:free">Gemini 2.0 Flash</option>
            <option value="meta-llama/llama-3.1-70b-instruct">Llama 3.1 70B</option>
          </select>
          <button id="excalihub-ai-context-toggle" title="Include canvas context" style="
            background: #1a2a1a; border: 1px solid #2d5a2d; color: #4ade80; border-radius: 4px;
            padding: 3px 8px; font-size: 11px; cursor: pointer; font-family: 'DM Sans', sans-serif;
            transition: all 0.15s;
          ">Context: ON</button>
          <button id="excalihub-ai-clear" title="New conversation" style="
            background: none; border: none; color: var(--muted, #6b7685); cursor: pointer; padding: 4px; display: flex; align-items: center; border-radius: 4px;
          ">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 4h10M5 4V2.5a1 1 0 011-1h2a1 1 0 011 1V4M11 4v7.5a1 1 0 01-1 1H4a1 1 0 01-1-1V4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <button id="excalihub-ai-close" style="
            background: none; border: none; color: var(--muted, #6b7685); cursor: pointer; padding: 4px; display: flex; align-items: center;
          ">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </div>

      <div id="excalihub-ai-messages" style="
        flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px;
      ">
        <div style="text-align: center; color: var(--muted, #6b7685); font-size: 12px; padding: 20px;">
          Ask me to generate a diagram, analyze your drawing, or suggest improvements.
        </div>
      </div>

      <div id="excalihub-ai-input-area" style="
        display: flex; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--border, #252b33); background: var(--surface, #161a1f);
      ">
        <textarea id="excalihub-ai-input" placeholder="Describe a diagram or ask a question..." rows="1" style="
          flex: 1; background: var(--bg, #0d0f11); border: 1px solid var(--border, #252b33); color: var(--text, #e8edf2);
          border-radius: 8px; padding: 8px 12px; font-size: 13px; outline: none; resize: none;
          font-family: 'DM Sans', sans-serif; max-height: 100px; line-height: 1.4; transition: border-color 0.15s;
        "></textarea>
        <button id="excalihub-ai-send" style="
          background: linear-gradient(135deg, #7c3aed, #4f8ef7); border: none; border-radius: 8px;
          padding: 0 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: opacity 0.15s;
        " title="Send">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 8l12-6-6 12V8H2z" fill="white"/></svg>
        </button>
        <button id="excalihub-ai-stop" style="
          background: #5c1c1c; border: 1px solid #f76f6f; border-radius: 8px; padding: 0 14px;
          cursor: pointer; display: none; align-items: center; justify-content: center;
          color: #f76f6f; font-size: 12px; font-weight: 600; font-family: 'DM Sans', sans-serif;
        ">Stop</button>
      </div>
    </div>
  `;

  document.body.appendChild(aiFloat);

  const trigger = document.getElementById("excalihub-ai-trigger");
  const panel = document.getElementById("excalihub-ai-panel");
  const closeBtn = document.getElementById("excalihub-ai-close");
  const sendBtn = document.getElementById("excalihub-ai-send");
  const stopBtn = document.getElementById("excalihub-ai-stop");
  const input = document.getElementById("excalihub-ai-input");
  const messagesEl = document.getElementById("excalihub-ai-messages");
  const clearBtn = document.getElementById("excalihub-ai-clear");
  const contextToggle = document.getElementById("excalihub-ai-context-toggle");
  const modelSelect = document.getElementById("excalihub-ai-model-select");
  const header = document.getElementById("excalihub-ai-header");

  // Model selector: load saved model and wire change handler
  if (modelSelect) {
    // Load saved model on init
    (async () => {
      try {
        const aiSettings = await chrome.runtime.sendMessage({
          type: "AI_GET_SETTINGS",
        });
        if (aiSettings?.ok && aiSettings.settings.model) {
          // Try to match the saved model; fall back to default
          const savedModel = aiSettings.settings.model;
          const option = modelSelect.querySelector(
            `option[value="${savedModel}"]`,
          );
          if (option) {
            modelSelect.value = savedModel;
          }
        }
      } catch (_) {}
    })();

    modelSelect.addEventListener("change", () => {
      chrome.runtime
        .sendMessage({
          type: "AI_SAVE_SETTINGS",
          settings: { model: modelSelect.value },
        })
        .catch(() => {});
    });
  }

  // Trigger button hover effects
  trigger.addEventListener("mouseenter", () => {
    trigger.style.transform = "scale(1.1)";
    trigger.style.boxShadow = "0 6px 24px rgba(79, 142, 247, 0.4)";
  });
  trigger.addEventListener("mouseleave", () => {
    trigger.style.transform = "scale(1)";
    trigger.style.boxShadow = "0 4px 16px rgba(79, 142, 247, 0.3)";
  });

  trigger.addEventListener("click", () => {
    panel.style.display = "flex";
    trigger.style.display = "none";
    input.focus();
    renderFloatingHistory();
  });

  closeBtn.addEventListener("click", () => {
    panel.style.display = "none";
    trigger.style.display = "flex";
  });

  // Draggable panel
  let isDragging = false,
    dragOffX = 0,
    dragOffY = 0;
  header.addEventListener("mousedown", (e) => {
    if (e.target.tagName === "BUTTON" || e.target.closest("button")) return;
    isDragging = true;
    dragOffX = e.clientX - panel.getBoundingClientRect().left;
    dragOffY = e.clientY - panel.getBoundingClientRect().top;
    panel.style.transition = "none";
  });
  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    panel.style.left = `${e.clientX - dragOffX}px`;
    panel.style.top = `${e.clientY - dragOffY}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
  });
  document.addEventListener("mouseup", () => {
    isDragging = false;
    panel.style.transition = "";
  });

  // Context toggle
  contextToggle.addEventListener("click", () => {
    aiChatState.contextIncluded = !aiChatState.contextIncluded;
    contextToggle.textContent = aiChatState.contextIncluded
      ? "Context: ON"
      : "Context: OFF";
    contextToggle.style.background = aiChatState.contextIncluded
      ? "#1a2a1a"
      : "var(--bg, #0d0f11)";
    contextToggle.style.borderColor = aiChatState.contextIncluded
      ? "#2d5a2d"
      : "var(--border, #252b33)";
    contextToggle.style.color = aiChatState.contextIncluded
      ? "#4ade80"
      : "var(--muted, #6b7685)";
  });

  // Input auto-resize
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 100) + "px";
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleFloatingSend();
    }
  });

  input.addEventListener("focus", () => {
    input.style.borderColor = "#4f8ef7";
  });
  input.addEventListener("blur", () => {
    input.style.borderColor = "var(--border, #252b33)";
  });

  // Clear conversation
  clearBtn.addEventListener("click", async () => {
    aiChatState.history = [];
    await chrome.runtime
      .sendMessage({ type: "AI_CLEAR_HISTORY" })
      .catch(() => {});
    await chrome.storage.local.remove("aiConversationHistory").catch(() => {});
    messagesEl.innerHTML = `<div style="text-align: center; color: var(--muted, #6b7685); font-size: 12px; padding: 20px;">Conversation cleared. Ask me anything!</div>`;
  });
  clearBtn.addEventListener("mouseenter", () => {
    clearBtn.style.color = "var(--text, #e8edf2)";
    clearBtn.style.background = "var(--surface, #161a1f)";
  });
  clearBtn.addEventListener("mouseleave", () => {
    clearBtn.style.color = "var(--muted, #6b7685)";
    clearBtn.style.background = "none";
  });

  // Send handler
  async function handleFloatingSend() {
    const text = input.value.trim();
    if (!text || aiChatState.isStreaming) return;

    // Check for API key first
    if (!hasApiKey) {
      appendFloatingSetupPrompt();
      return;
    }

    input.value = "";
    input.style.height = "auto";

    aiChatState.isStreaming = true;
    sendBtn.style.display = "none";
    stopBtn.style.display = "flex";

    appendFloatingUserMessage(text);
    appendFloatingThinking();

    const canvasContext = aiChatState.contextIncluded
      ? getExcalidrawScene().scene
      : null;
    aiChatState.history.push({
      role: "user",
      content: text,
      timestamp: Date.now(),
    });

    // Open a port for streaming before sending
    const PORT_NAME = "ai-stream-floating";
    let streamPort = null;
    const streamPromise = new Promise((resolve) => {
      streamPort = chrome.runtime.connect({ name: PORT_NAME });
      streamPort.onMessage.addListener((portMsg) => {
        if (portMsg.type === "chunk") {
          updateFloatingStreamingMessage(portMsg.fullContent);
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
      history: aiChatState.history.filter((m) => m.role !== "system"),
      _portName: PORT_NAME,
    });

    const response = await streamPromise;
    try {
      streamPort.disconnect();
    } catch (_) {}

    aiChatState.isStreaming = false;
    sendBtn.style.display = "flex";
    stopBtn.style.display = "none";

    if (response?.error) {
      const streamEl = document.getElementById("excalihub-ai-streaming");
      if (streamEl) {
        const bubble = streamEl.querySelector("div");
        bubble.textContent = "Error: " + response.error;
        bubble.style.color = "var(--error, #f76f6f)";
        bubble.style.borderColor = "#5c1c1c";
        streamEl.id = "";
      }
      return;
    }

    const fullContent = response?.content || "";
    const parsed = parseAIResponse(fullContent);

    const displayText =
      parsed.action === "chat" || parsed.action === "analyze"
        ? parsed.message || parsed.analysis || fullContent
        : parsed.summary || fullContent;

    finalizeFloatingStreamingMessage(fullContent, parsed);

    aiChatState.history.push({
      role: "assistant",
      content: fullContent,
      parsed,
      timestamp: Date.now(),
    });

    chrome.storage.local
      .set({
        aiConversationHistory: aiChatState.history.slice(-50),
      })
      .catch(() => {});

    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  sendBtn.addEventListener("click", handleFloatingSend);

  stopBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "AI_STOP_GENERATION" });
    aiChatState.isStreaming = false;
    sendBtn.style.display = "flex";
    stopBtn.style.display = "none";
  });

  // Floating panel streaming message helpers
  function updateFloatingStreamingMessage(content) {
    let bubble = document.getElementById("excalihub-ai-stream-bubble");
    if (!bubble) {
      const thinking = document.getElementById("excalihub-ai-streaming");
      if (thinking) {
        thinking.id = "excalihub-ai-floating-streaming";
        const b = document.createElement("div");
        b.id = "excalihub-ai-stream-bubble";
        b.style.cssText =
          "background: var(--surface, #161a1f); padding: 8px 12px; border-radius: 12px 12px 12px 4px; border: 1px solid var(--border, #252b33);";
        thinking.innerHTML = "";
        thinking.appendChild(b);
        bubble = b;
      }
    }
    if (bubble) {
      // Check if content looks like JSON (diagram generation) — show skeleton
      const trimmed = content.trimStart();
      if (trimmed.startsWith("{")) {
        bubble.innerHTML = `<span style="font-style:italic;color:var(--muted,#6b7685);">✦ Generating diagram…</span><span style="display:inline-flex;gap:3px;margin-left:6px;"><span style="width:4px;height:4px;background:var(--muted,#6b7685);border-radius:50%;animation:thinkingDot 1.2s infinite;"></span><span style="width:4px;height:4px;background:var(--muted,#6b7685);border-radius:50%;animation:thinkingDot 1.2s infinite 0.2s;"></span><span style="width:4px;height:4px;background:var(--muted,#6b7685);border-radius:50%;animation:thinkingDot 1.2s infinite 0.4s;"></span></span>`;
      } else {
        bubble.innerHTML = "";
        const textNode = document.createElement("span");
        textNode.style.cssText =
          "font-size: 13px; line-height: 1.5; color: var(--text, #e8edf2); white-space: pre-wrap; word-break: break-word;";
        textNode.textContent = content;
        bubble.appendChild(textNode);
        const cursor = document.createElement("span");
        cursor.className = "eai-cursor";
        bubble.appendChild(cursor);
      }
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  }

  function finalizeFloatingStreamingMessage(fullContent, parsed) {
    const streaming = document.getElementById(
      "excalihub-ai-floating-streaming",
    );
    if (streaming) {
      streaming.id = "";
      streaming.innerHTML = "";
      streaming.style.cssText = "align-self: flex-start; max-width: 90%;";
    }

    if (parsed.action === "generate" || parsed.action === "improve") {
      // Remove streaming element and append gen card
      const streamEl =
        document.getElementById("excalihub-ai-floating-streaming") || streaming;
      if (streamEl) {
        streamEl.innerHTML = "";
        const card = buildFloatingGenerateCard(parsed);
        streamEl.appendChild(card);
      }
      return;
    }

    // Plain text / analyze — render with markdown
    const wrapper =
      document.getElementById("excalihub-ai-floating-streaming") || streaming;
    if (wrapper) {
      wrapper.innerHTML = "";
      const text =
        parsed.action === "analyze"
          ? parsed.analysis || fullContent
          : parsed.message || fullContent;
      const bubble = document.createElement("div");
      bubble.style.cssText =
        "background: var(--surface, #161a1f); padding: 8px 12px; border-radius: 12px 12px 12px 4px; border: 1px solid var(--border, #252b33);";
      bubble.appendChild(renderFloatingMarkdown(text));
      wrapper.appendChild(bubble);
    }
  }

  function buildFloatingGenerateCard(parsed) {
    const card = document.createElement("div");
    card.style.cssText =
      "background: var(--surface, #161a1f); border: 1px solid var(--border, #252b33); border-radius: 10px; overflow: hidden;";
    const label = document.createElement("div");
    label.style.cssText =
      "padding: 8px 12px; font-size: 11px; color: var(--muted, #6b7685); border-bottom: 1px solid var(--border, #252b33);";
    label.textContent =
      (parsed.action === "generate" ? "Generated" : "Improved") +
      " diagram" +
      (parsed.summary ? " — " + parsed.summary : "");
    card.appendChild(label);

    const actions = document.createElement("div");
    actions.style.cssText = "padding: 10px 12px; display: flex; gap: 8px;";
    const applyBtn = document.createElement("button");
    applyBtn.style.cssText =
      "flex: 1; background: #1a2a1a; border: 1px solid #2d5a2d; color: #4ade80; border-radius: 6px; padding: 7px 12px; cursor: pointer; font-size: 12px; font-weight: 600; font-family: 'DM Sans', sans-serif;";
    applyBtn.textContent = "Apply to Canvas";

    const result = applyElementsToCanvas(parsed.elements);
    if (result.ok) {
      applyBtn.textContent = "Applied!";
      applyBtn.style.color = "var(--muted, #6b7685)";
      applyBtn.style.borderColor = "var(--border, #252b33)";
      applyBtn.style.background = "var(--bg, #0d0f11)";
      applyBtn.disabled = true;
    } else {
      applyBtn.textContent = "Error — retry?";
      applyBtn.addEventListener("click", () => {
        const retryResult = applyElementsToCanvas(parsed.elements);
        if (retryResult.ok) {
          applyBtn.textContent = "Applied!";
          applyBtn.disabled = true;
        }
      });
    }

    actions.appendChild(applyBtn);
    const countLabel = document.createElement("span");
    countLabel.style.cssText =
      "display: flex; align-items: center; font-size: 11px; color: var(--muted, #6b7685);";
    countLabel.textContent = parsed.elements.length + " elements";
    actions.appendChild(countLabel);
    card.appendChild(actions);
    return card;
  }

  function renderFloatingMarkdown(text) {
    const el = document.createElement("div");
    el.style.cssText =
      "font-size:13px;line-height:1.6;word-break:break-word;color:var(--text,#e8edf2);";
    let html = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(
        /`([^`]+)`/g,
        `<code style="font-family:'DM Mono',monospace;font-size:11px;background:rgba(0,0,0,.2);border-radius:3px;padding:1px 4px;">$1</code>`,
      )
      .replace(/^[-•] (.+)$/gm, "<li>$1</li>")
      .replace(
        /(<li>.*<\/li>)/gs,
        "<ul style='margin:3px 0 3px 14px;padding:0'>$1</ul>",
      )
      .replace(/\n{2,}/g, "</p><p style='margin:0 0 4px'>")
      .replace(/\n/g, "<br>");
    el.innerHTML = "<p style='margin:0 0 4px'>" + html + "</p>";
    return el;
  }

  function appendFloatingUserMessage(text) {
    const div = document.createElement("div");
    div.style.cssText =
      "align-self: flex-end; max-width: 80%; background: #1e3a5f; color: var(--text, #e8edf2); padding: 8px 12px; border-radius: 12px 12px 4px 12px; font-size: 13px; line-height: 1.5; white-space: pre-wrap; word-break: break-word;";
    div.textContent = text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function appendFloatingThinking() {
    const wrapper = document.createElement("div");
    wrapper.id = "excalihub-ai-streaming";
    wrapper.style.cssText = "align-self: flex-start; max-width: 90%;";
    const bubble = document.createElement("div");
    bubble.style.cssText =
      "background: var(--surface, #161a1f); color: var(--muted, #6b7685); padding: 8px 12px; border-radius: 12px 12px 12px 4px; font-size: 13px; line-height: 1.5; border: 1px solid var(--border, #252b33); display: flex; align-items: center; gap: 8px;";
    bubble.innerHTML = `<span>Thinking</span><span style="display:inline-flex;gap:3px;"><span style="width:4px;height:4px;background:var(--muted,#6b7685);border-radius:50%;animation:thinkingDot 1.2s infinite;"></span><span style="width:4px;height:4px;background:var(--muted,#6b7685);border-radius:50%;animation:thinkingDot 1.2s infinite 0.2s;"></span><span style="width:4px;height:4px;background:var(--muted,#6b7685);border-radius:50%;animation:thinkingDot 1.2s infinite 0.4s;"></span></span>`;
    wrapper.appendChild(bubble);
    messagesEl.appendChild(wrapper);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function appendFloatingSetupPrompt() {
    // Remove any existing setup prompt
    const existing = document.getElementById("excalihub-ai-setup-prompt");
    if (existing) existing.remove();

    const wrapper = document.createElement("div");
    wrapper.id = "excalihub-ai-setup-prompt";
    wrapper.style.cssText = "align-self: flex-start; max-width: 90%;";

    const card = document.createElement("div");
    card.style.cssText =
      "background: var(--surface, #161a1f); border: 1px solid #5c1c1c; border-radius: 10px; padding: 12px;";

    const title = document.createElement("div");
    title.style.cssText =
      "font-size: 13px; font-weight: 600; color: #f76f6f; margin-bottom: 4px;";
    title.textContent = "⚡ AI Setup Required";

    const desc = document.createElement("div");
    desc.style.cssText =
      "font-size: 12px; color: var(--muted, #6b7685); margin-bottom: 10px; line-height: 1.5;";
    desc.textContent =
      "Add your OpenRouter API key in settings to start generating diagrams.";

    const link = document.createElement("a");
    link.style.cssText =
      "display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: #4f8ef7; cursor: pointer; text-decoration: none; font-weight: 600;";
    link.textContent = "Open Settings →";
    link.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" });
    });

    card.appendChild(title);
    card.appendChild(desc);
    card.appendChild(link);
    wrapper.appendChild(card);
    messagesEl.appendChild(wrapper);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function renderFloatingHistory() {
    if (aiChatState.history.length === 0) return;
    messagesEl.innerHTML = "";
    for (const msg of aiChatState.history) {
      if (msg.role === "user") {
        appendFloatingUserMessage(msg.content);
      } else if (msg.role === "assistant") {
        const wrapper = document.createElement("div");
        wrapper.style.cssText = "align-self: flex-start; max-width: 90%;";
        if (
          msg.parsed &&
          (msg.parsed.action === "generate" || msg.parsed.action === "improve")
        ) {
          wrapper.appendChild(buildFloatingGenerateCard(msg.parsed));
        } else {
          const text =
            msg.parsed?.message || msg.parsed?.analysis || msg.content;
          const bubble = document.createElement("div");
          bubble.style.cssText =
            "background: var(--surface, #161a1f); color: var(--text, #e8edf2); padding: 8px 12px; border-radius: 12px 12px 12px 4px; font-size: 13px; line-height: 1.5; border: 1px solid var(--border, #252b33);";
          bubble.appendChild(renderFloatingMarkdown(text));
          wrapper.appendChild(bubble);
        }
        messagesEl.appendChild(wrapper);
      }
    }
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // Load settings
  const aiSettings = await chrome.runtime.sendMessage({
    type: "AI_GET_SETTINGS",
  });
  if (aiSettings?.ok) {
    aiChatState.contextIncluded = aiSettings.settings.contextMode === "auto";
    contextToggle.textContent = aiChatState.contextIncluded
      ? "Context: ON"
      : "Context: OFF";
    contextToggle.style.background = aiChatState.contextIncluded
      ? "#1a2a1a"
      : "var(--bg, #0d0f11)";
    contextToggle.style.borderColor = aiChatState.contextIncluded
      ? "#2d5a2d"
      : "var(--border, #252b33)";
    contextToggle.style.color = aiChatState.contextIncluded
      ? "#4ade80"
      : "var(--muted, #6b7685)";
  }
}

// ─── Initialize ──────────────────────────────────────────────────────────────

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    injectSidebar();
    injectAIChat();
  });
} else {
  injectSidebar();
  injectAIChat();
}
