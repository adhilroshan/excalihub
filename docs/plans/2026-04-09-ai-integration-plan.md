# AI Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add AI chat capabilities to ExcaliHub — users can generate diagrams, analyze drawings, get improvement suggestions, and chat with a drawing assistant via OpenRouter.

**Architecture:** AI calls go through `background.js` (service worker) to OpenRouter API. Two chat UIs are injected into `excalidraw.com` by `content.js`: a floating draggable chatbox and a sidebar tab. Element validation/repair happens in `content.js` before injecting onto canvas.

**Tech Stack:** Chrome Extension (MV3), OpenRouter API (chat completions, SSE streaming), vanilla JS/CSS/HTML.

**Design doc:** `docs/plans/2026-04-09-ai-integration-design.md`

---

### Task 1: Update manifest.json for OpenRouter permission

**Files:**
- Modify: `manifest.json:8-10`

**Step 1: Add OpenRouter host permission**

In `manifest.json`, add `https://openrouter.ai/*` to `host_permissions`:

```json
"host_permissions": [
  "https://excalidraw.com/*",
  "https://api.github.com/*",
  "https://github.com/*",
  "https://openrouter.ai/*"
],
```

**Step 2: Verify manifest is valid JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add manifest.json
git commit -m "feat(ai): add openrouter.ai host permission"
```

---

### Task 2: Add AI settings storage and handlers in background.js

**Files:**
- Modify: `background.js` (append new handlers after existing message listeners)

**Step 1: Add OpenRouter API call function**

Append the following to `background.js` after the auto-save section (after line 941):

```javascript
// ─── AI Integration ──────────────────────────────────────────────────────────

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const EXCALIDRAW_SYSTEM_PROMPT = `You are an Excalidraw diagram assistant integrated into a Chrome extension called ExcaliHub. You help users create, analyze, and improve diagrams.

When generating diagrams, respond ONLY with valid JSON in this exact format:
{
  "action": "generate",
  "elements": [
    {
      "type": "rectangle|ellipse|diamond|text|line|arrow",
      "x": <number>,
      "y": <number>,
      "width": <number>,
      "height": <number>,
      "strokeColor": "<hex>",
      "backgroundColor": "<hex or transparent>",
      "strokeWidth": <number>,
      "roughness": <0|1|2>,
      "opacity": <100>,
      "angle": <0>,
      "fillStyle": "<solid|hachure|cross-hatch>",
      "strokeStyle": "<solid|dashed|dotted>",
      "roundness": null or { "type": 3 },
      "text": "<only for text type>",
      "fontSize": <number, only for text>,
      "fontFamily": <1|2|3|4|5>,
      "textAlign": "<left|center|right, only for text>",
      "verticalAlign": "<top|middle, only for text with container>",
      "points": "<array of [x,y] for line/arrow>",
      "startBinding": null,
      "endBinding": null,
      "startArrowhead": null,
      "endArrowhead": "<arrow for arrow type>",
      "groupIds": [],
      "boundElements": null,
      "locked": false
    }
  ]
}

Font families: 1=Virgil(hand), 2=Helvetica(sans), 3=Cascadia(mono), 4=Excalidraw(sans), 5=Nunito
Roughness: 0=sharp/architect, 1=round/artist(default), 2=funky/cartoonist

When analyzing diagrams, respond with:
{
  "action": "analyze",
  "analysis": "<markdown explanation>"
}

When improving diagrams, respond with:
{
  "action": "improve",
  "elements": [<complete updated elements array>],
  "summary": "<what you changed>"
}

For general questions, respond with:
{
  "action": "chat",
  "message": "<markdown response>"
}

IMPORTANT: Always respond with valid JSON. Use reasonable coordinates (x: 0-2000, y: 0-1000). Text elements must have a "text" field. Lines/arrows must have a "points" array like [[0,0],[100,0]].`;

function compressCanvasContext(scene) {
  if (!scene || !scene.elements || scene.elements.length === 0) return null;
  const elements = scene.elements
    .filter((el) => !el.isDeleted)
    .slice(0, 200)
    .map((el) => {
      const compressed = {
        type: el.type,
        x: Math.round(el.x),
        y: Math.round(el.y),
        width: Math.round(el.width || 0),
        height: Math.round(el.height || 0),
      };
      if (el.text) compressed.text = el.text.slice(0, 100);
      if (el.strokeColor) compressed.strokeColor = el.strokeColor;
      if (el.backgroundColor && el.backgroundColor !== "transparent")
        compressed.backgroundColor = el.backgroundColor;
      if (el.points) compressed.points = el.points;
      if (el.boundElements) compressed.boundElements = el.boundElements;
      if (el.type === "arrow") {
        compressed.startArrowhead = el.startArrowhead;
        compressed.endArrowhead = el.endArrowhead;
      }
      return compressed;
    });
  return JSON.stringify({ elements, elementCount: elements.length });
}

async function callOpenRouter(messages, settings) {
  const apiKey = settings.aiApiKey;
  if (!apiKey) throw new Error("No API key configured");

  const body = {
    model: settings.aiModel || "openai/gpt-4o",
    messages,
    max_tokens: settings.aiMaxTokens || 2048,
    temperature: settings.aiTemperature ?? 0.3,
    stream: true,
  };

  const resp = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://excalidraw.com",
      "X-Title": "ExcaliHub AI",
    },
    body: JSON.stringify(body),
  });

  if (resp.status === 401) throw new Error("Invalid API key");
  if (resp.status === 429) throw new Error("Rate limited — please wait a moment");
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error: ${resp.status}`);
  }

  return resp.body;
}

let activeAIStream = null;

function handleAIStream(stream, sendResponse) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let fullContent = "";
  let buffer = "";

  activeAIStream = reader;

  const processChunk = async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") break;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              fullContent += delta;
              chrome.runtime.sendMessage({
                type: "AI_STREAM_CHUNK",
                chunk: delta,
                fullContent,
              }).catch(() => {});
            }
          } catch {}
        }
      }

      chrome.runtime.sendMessage({
        type: "AI_STREAM_DONE",
        fullContent,
      }).catch(() => {});

      sendResponse({ ok: true, content: fullContent });
    } catch (err) {
      if (err.name !== "AbortError") {
        chrome.runtime.sendMessage({
          type: "AI_STREAM_ERROR",
          error: err.message,
        }).catch(() => {});
        sendResponse({ error: err.message });
      }
    } finally {
      activeAIStream = null;
    }
  };

  processChunk();
}
```

**Step 2: Add AI message handlers**

Append these handlers inside the `chrome.runtime.onMessage.addListener` block in `background.js` (before the closing `});` of the first listener, around line 738 — add before `if (msg.type === "GET_CACHED_THUMBNAIL")` block ends, or add a second listener after the existing ones):

Actually, there's already a second `onMessage.addListener` at line 932 for `UPDATE_AUTOSAVE`. Add a third listener after it:

```javascript
// ─── AI Message Handlers ────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "AI_CHAT") {
    (async () => {
      try {
        const settings = await chrome.storage.sync.get([
          "aiApiKey",
          "aiModel",
          "aiMaxTokens",
          "aiTemperature",
          "aiContextMode",
        ]);

        if (!settings.aiApiKey) {
          sendResponse({ error: "No API key. Open extension settings to add one." });
          return;
        }

        const messages = [{ role: "system", content: EXCALIDRAW_SYSTEM_PROMPT }];

        if (msg.history && msg.history.length > 0) {
          const recentHistory = msg.history.slice(-20);
          for (const h of recentHistory) {
            messages.push({ role: h.role, content: h.content });
          }
        }

        let userContent = msg.prompt;
        if (msg.canvasContext) {
          const contextStr = compressCanvasContext(msg.canvasContext);
          if (contextStr) {
            userContent += `\n\nCurrent canvas state:\n${contextStr}`;
          }
        }
        messages.push({ role: "user", content: userContent });

        const stream = await callOpenRouter(messages, settings);
        handleAIStream(stream, sendResponse);
      } catch (err) {
        sendResponse({ error: err.message });
      }
    })();
    return true;
  }

  if (msg.type === "AI_STOP_GENERATION") {
    if (activeAIStream) {
      activeAIStream.cancel().catch(() => {});
      activeAIStream = null;
      sendResponse({ ok: true });
    } else {
      sendResponse({ ok: false });
    }
    return true;
  }

  if (msg.type === "AI_GET_SETTINGS") {
    chrome.storage.sync.get([
      "aiApiKey",
      "aiModel",
      "aiMaxTokens",
      "aiTemperature",
      "aiContextMode",
    ]).then((settings) => {
      sendResponse({
        ok: true,
        settings: {
          hasApiKey: !!settings.aiApiKey,
          model: settings.aiModel || "openai/gpt-4o",
          maxTokens: settings.aiMaxTokens || 2048,
          temperature: settings.aiTemperature ?? 0.3,
          contextMode: settings.aiContextMode || "auto",
        },
      });
    });
    return true;
  }

  if (msg.type === "AI_SAVE_SETTINGS") {
    chrome.storage.sync.set({
      aiApiKey: msg.settings.apiKey,
      aiModel: msg.settings.model,
      aiMaxTokens: msg.settings.maxTokens,
      aiTemperature: msg.settings.temperature,
      aiContextMode: msg.settings.contextMode,
    }).then(() => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === "AI_GET_HISTORY") {
    chrome.storage.local.get("aiConversationHistory").then(({ aiConversationHistory }) => {
      sendResponse({ ok: true, history: aiConversationHistory || [] });
    });
    return true;
  }

  if (msg.type === "AI_CLEAR_HISTORY") {
    chrome.storage.local.set({ aiConversationHistory: [] }).then(() => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === "AI_TEST_KEY") {
    (async () => {
      try {
        const { aiApiKey } = await chrome.storage.sync.get("aiApiKey");
        if (!aiApiKey) {
          sendResponse({ ok: false, error: "No API key" });
          return;
        }
        const resp = await fetch(OPENROUTER_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${aiApiKey}`,
          },
          body: JSON.stringify({
            model: "openai/gpt-4o-mini",
            messages: [{ role: "user", content: "Hi" }],
            max_tokens: 5,
          }),
        });
        if (resp.ok) {
          sendResponse({ ok: true });
        } else {
          const err = await resp.json().catch(() => ({}));
          sendResponse({ ok: false, error: err.error?.message || `HTTP ${resp.status}` });
        }
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }

  if (msg.type === "AI_GET_MODELS") {
    (async () => {
      try {
        const { aiApiKey } = await chrome.storage.sync.get("aiApiKey");
        if (!aiApiKey) {
          sendResponse({ ok: false, error: "No API key" });
          return;
        }
        const resp = await fetch("https://openrouter.ai/api/v1/models", {
          headers: { Authorization: `Bearer ${aiApiKey}` },
        });
        const data = await resp.json();
        const models = data.data
          ?.filter((m) => m.id)
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((m) => ({
            id: m.id,
            name: m.name || m.id,
            contextLength: m.context_length,
            pricing: m.pricing,
          }));
        sendResponse({ ok: true, models: models || [] });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }
});
```

**Step 3: Verify background.js has no syntax errors**

Run: `node -c background.js`
Expected: No output (no syntax errors)

**Step 4: Commit**

```bash
git add background.js
git commit -m "feat(ai): add OpenRouter API handlers, streaming, and AI message types"
```

---

### Task 3: Add AI settings section to options page

**Files:**
- Modify: `options.html` (add AI section before closing `</main>`)
- Modify: `options.js` (add AI settings load/save logic)

**Step 1: Add AI settings HTML section**

In `options.html`, find the closing `</main>` tag (around line 1128) and insert this section before it:

```html
<!-- AI Assistant Section -->
<div class="section-header" style="margin-top: 32px;">
  <div class="section-title">AI Assistant</div>
  <div class="section-description">
    Configure your AI provider for diagram generation, analysis, and chat
  </div>
</div>

<div class="card">
  <div class="form-group">
    <label class="form-label" for="aiApiKey">OpenRouter API Key</label>
    <div style="display: flex; gap: 8px;">
      <input type="password" id="aiApiKey" placeholder="sk-or-v1-..." style="flex: 1;" />
      <button class="btn-primary" id="btn-test-ai-key" style="padding: 8px 16px; white-space: nowrap; min-width: auto;">
        Test
      </button>
    </div>
    <div id="ai-key-status" class="form-hint" style="display: none;"></div>
  </div>

  <div class="form-group">
    <label class="form-label" for="aiModel">Model</label>
    <select id="aiModel" style="width: 100%;">
      <option value="openai/gpt-4o">GPT-4o</option>
      <option value="openai/gpt-4o-mini">GPT-4o Mini</option>
      <option value="anthropic/claude-3.5-sonnet">Claude 3.5 Sonnet</option>
      <option value="anthropic/claude-3-haiku">Claude 3 Haiku</option>
      <option value="google/gemini-2.0-flash-001">Gemini 2.0 Flash</option>
      <option value="google/gemini-2.0-pro-exp-02-05:free">Gemini 2.0 Pro (free)</option>
      <option value="meta-llama/llama-3.1-70b-instruct">Llama 3.1 70B</option>
    </select>
    <div class="form-hint">Select which AI model to use via OpenRouter</div>
  </div>

  <div class="form-group">
    <label class="form-label">Context Mode</label>
    <div style="display: flex; gap: 12px;">
      <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 13px; color: var(--text-secondary);">
        <input type="radio" name="aiContextMode" value="auto" checked /> Auto (always send canvas)
      </label>
      <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 13px; color: var(--text-secondary);">
        <input type="radio" name="aiContextMode" value="manual" /> Manual (toggle per message)
      </label>
    </div>
  </div>

  <div class="form-group">
    <label class="form-label" for="aiMaxTokens">Max Tokens: <span id="aiMaxTokensValue">2048</span></label>
    <input type="range" id="aiMaxTokens" min="500" max="4096" step="256" value="2048"
      style="width: 100%; accent-color: #4f8ef7;" />
  </div>

  <div class="form-group">
    <label class="form-label" for="aiTemperature">Temperature: <span id="aiTemperatureValue">0.3</span></label>
    <input type="range" id="aiTemperature" min="0" max="1" step="0.1" value="0.3"
      style="width: 100%; accent-color: #4f8ef7;" />
  </div>

  <div style="display: flex; justify-content: flex-end;">
    <button class="btn-primary" id="btn-save-ai-settings">Save AI Settings</button>
  </div>
  <div id="ai-save-status" class="status"></div>
</div>
```

**Step 2: Add AI settings JS logic**

In `options.js`, append the following after the existing `formatSize` function (after line 237):

```javascript
// ─── AI Settings ──────────────────────────────────────────────────────────────

async function loadAISettings() {
  const settings = await chrome.storage.sync.get([
    "aiApiKey",
    "aiModel",
    "aiMaxTokens",
    "aiTemperature",
    "aiContextMode",
  ]);
  if (settings.aiApiKey) document.getElementById("aiApiKey").value = settings.aiApiKey;
  if (settings.aiModel) document.getElementById("aiModel").value = settings.aiModel;
  if (settings.aiMaxTokens) {
    document.getElementById("aiMaxTokens").value = settings.aiMaxTokens;
    document.getElementById("aiMaxTokensValue").textContent = settings.aiMaxTokens;
  }
  if (settings.aiTemperature !== undefined) {
    document.getElementById("aiTemperature").value = settings.aiTemperature;
    document.getElementById("aiTemperatureValue").textContent = settings.aiTemperature;
  }
  const contextRadio = document.querySelector(
    `input[name="aiContextMode"][value="${settings.aiContextMode || "auto"}"]`
  );
  if (contextRadio) contextRadio.checked = true;
}

function showAIStatus(msg, type) {
  const el = document.getElementById("ai-save-status");
  el.textContent = msg;
  el.className = `status show ${type}`;
  setTimeout(() => el.classList.remove("show"), 3000);
}

document.getElementById("aiMaxTokens")?.addEventListener("input", (e) => {
  document.getElementById("aiMaxTokensValue").textContent = e.target.value;
});

document.getElementById("aiTemperature")?.addEventListener("input", (e) => {
  document.getElementById("aiTemperatureValue").textContent = e.target.value;
});

document.getElementById("btn-save-ai-settings")?.addEventListener("click", async () => {
  const apiKey = document.getElementById("aiApiKey").value.trim();
  const model = document.getElementById("aiModel").value;
  const maxTokens = parseInt(document.getElementById("aiMaxTokens").value, 10);
  const temperature = parseFloat(document.getElementById("aiTemperature").value);
  const contextMode =
    document.querySelector('input[name="aiContextMode"]:checked')?.value || "auto";

  await chrome.storage.sync.set({
    aiApiKey: apiKey,
    aiModel: model,
    aiMaxTokens: maxTokens,
    aiTemperature: temperature,
    aiContextMode: contextMode,
  });

  showAIStatus("AI settings saved!", "success");
});

document.getElementById("btn-test-ai-key")?.addEventListener("click", async () => {
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
  } else {
    statusEl.textContent = `Invalid: ${resp?.error || "unknown error"}`;
    statusEl.style.color = "#f76f6f";
  }
});

loadAISettings();
```

**Step 3: Verify no syntax errors**

Run: `node -c options.js`
Expected: No output (no syntax errors)

**Step 4: Commit**

```bash
git add options.html options.js
git commit -m "feat(ai): add AI settings section to options page"
```

---

### Task 4: Add AI chat floating chatbox to content.js

**Files:**
- Modify: `content.js` (append AI chat module after existing sidebar code)

This is the largest task. It adds the floating chatbox UI, the element validator, and the canvas injection logic.

**Step 1: Add element validation and repair functions**

Append the following after the `getExcalidrawScene()` function (after line 48):

```javascript
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

    const validTypes = ["rectangle", "ellipse", "diamond", "text", "line", "arrow", "freedraw"];
    if (!validTypes.includes(el.type)) {
      errors.push(`Element ${i}: invalid type "${el.type}"`);
      continue;
    }

    const repaired_el = {
      id: el.id || crypto.randomUUID?.() || Math.random().toString(36).slice(2),
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
      repaired_el.points = Array.isArray(el.points) && el.points.length > 0
        ? el.points.map((p) => [Number(p[0]) || 0, Number(p[1]) || 0])
        : [[0, 0], [100, 0]];
      repaired_el.startBinding = el.startBinding || null;
      repaired_el.endBinding = el.endBinding || null;
      repaired_el.startArrowhead = el.startArrowhead || null;
      repaired_el.endArrowhead = el.endArrowhead || (el.type === "arrow" ? "arrow" : null);
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

  return { elements: repaired, warnings: errors.length > 0 ? errors : undefined };
}

function centerElementsOnCanvas(elements) {
  if (!elements || elements.length === 0) return elements;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
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
    const existing = localStorage.getItem("excalidraw");
    const existingElements = existing ? JSON.parse(existing) : [];

    const allElements = [...existingElements, ...elements];
    localStorage.setItem("excalidraw", JSON.stringify(allElements));

    window.dispatchEvent(new StorageEvent("storage", { key: "excalidraw" }));

    const canvas = document.querySelector("canvas");
    if (canvas) {
      canvas.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      canvas.dispatchEvent(new Event("pointerup", { bubbles: true }));
    }

    return { ok: true };
  } catch (err) {
    return { error: err.message };
  }
}

function parseAIResponse(content) {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { action: "chat", message: content };

    const parsed = JSON.parse(jsonMatch[0]);
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
```

**Step 2: Add floating chatbox injection function**

Append after the `injectSidebar()` function's closing (after line 1969) and before the message listener:

```javascript
// ─── AI Chat UI ──────────────────────────────────────────────────────────────

let aiChatState = {
  history: [],
  isStreaming: false,
  contextIncluded: true,
};

async function injectAIChat() {
  if (document.getElementById("excalihub-ai-float")) return;

  const settings = await chrome.runtime.sendMessage({ type: "AI_GET_SETTINGS" });
  if (!settings?.ok || !settings.settings.hasApiKey) return;

  const savedHistory = await chrome.runtime.sendMessage({ type: "AI_GET_HISTORY" });
  if (savedHistory?.ok) aiChatState.history = savedHistory.history || [];

  const aiFloat = document.createElement("div");
  aiFloat.id = "excalihub-ai-float";
  aiFloat.innerHTML = `
    <div id="excalihub-ai-trigger" style="
      position: fixed;
      bottom: 24px;
      right: 64px;
      width: 44px;
      height: 44px;
      background: linear-gradient(135deg, #7c3aed, #4f8ef7);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 4px 16px rgba(79, 142, 247, 0.3);
      z-index: 999999;
      transition: transform 0.2s, box-shadow 0.2s;
    " title="ExcaliHub AI Chat">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/>
        <path d="M2 17l10 5 10-5"/>
        <path d="M2 12l10 5 10-5"/>
      </svg>
    </div>

    <div id="excalihub-ai-panel" style="
      position: fixed;
      bottom: 80px;
      right: 64px;
      width: 380px;
      height: 500px;
      background: #0d0f11;
      border: 1px solid #252b33;
      border-radius: 12px;
      display: none;
      flex-direction: column;
      z-index: 1000000;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      font-family: 'DM Sans', -apple-system, sans-serif;
      overflow: hidden;
      resize: both;
      min-width: 300px;
      min-height: 400px;
    ">
      <div id="excalihub-ai-header" style="
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        background: #161a1f;
        border-bottom: 1px solid #252b33;
        cursor: move;
        user-select: none;
      ">
        <div style="display: flex; align-items: center; gap: 8px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
          </svg>
          <span style="color: #e8edf2; font-size: 13px; font-weight: 600;">AI Assistant</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <button id="excalihub-ai-context-toggle" title="Include canvas context" style="
            background: ${aiChatState.contextIncluded ? '#1a2a1a' : '#0d0f11'};
            border: 1px solid ${aiChatState.contextIncluded ? '#2d5a2d' : '#252b33'};
            color: ${aiChatState.contextIncluded ? '#4ade80' : '#6b7685'};
            border-radius: 4px;
            padding: 3px 8px;
            font-size: 11px;
            cursor: pointer;
            font-family: 'DM Sans', sans-serif;
          ">
            ${aiChatState.contextIncluded ? "Context: ON" : "Context: OFF"}
          </button>
          <button id="excalihub-ai-clear" title="New conversation" style="
            background: none;
            border: none;
            color: #6b7685;
            cursor: pointer;
            padding: 4px;
            display: flex;
            align-items: center;
          ">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 4h10M5 4V2.5a1 1 0 011-1h2a1 1 0 011 1V4M11 4v7.5a1 1 0 01-1 1H4a1 1 0 01-1-1V4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <button id="excalihub-ai-close" style="
            background: none;
            border: none;
            color: #6b7685;
            cursor: pointer;
            padding: 4px;
            display: flex;
            align-items: center;
          ">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </div>

      <div id="excalihub-ai-messages" style="
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      ">
        <div style="text-align: center; color: #6b7685; font-size: 12px; padding: 20px;">
          Ask me to generate a diagram, analyze your drawing, or suggest improvements.
        </div>
      </div>

      <div id="excalihub-ai-input-area" style="
        display: flex;
        gap: 8px;
        padding: 12px 16px;
        border-top: 1px solid #252b33;
        background: #161a1f;
      ">
        <textarea id="excalihub-ai-input" placeholder="Describe a diagram or ask a question..." rows="1" style="
          flex: 1;
          background: #0d0f11;
          border: 1px solid #252b33;
          color: #e8edf2;
          border-radius: 8px;
          padding: 8px 12px;
          font-size: 13px;
          outline: none;
          resize: none;
          font-family: 'DM Sans', sans-serif;
          max-height: 100px;
          line-height: 1.4;
        "></textarea>
        <button id="excalihub-ai-send" style="
          background: linear-gradient(135deg, #7c3aed, #4f8ef7);
          border: none;
          border-radius: 8px;
          padding: 0 14px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: opacity 0.15s;
        " title="Send">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 8l12-6-6 12V8H2z" fill="white"/>
          </svg>
        </button>
        <button id="excalihub-ai-stop" style="
          background: #5c1c1c;
          border: 1px solid #f76f6f;
          border-radius: 8px;
          padding: 0 14px;
          cursor: pointer;
          display: none;
          align-items: center;
          justify-content: center;
          color: #f76f6f;
          font-size: 12px;
          font-weight: 600;
          font-family: 'DM Sans', sans-serif;
        " title="Stop">
          Stop
        </button>
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
  const header = document.getElementById("excalihub-ai-header");

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
    renderHistory();
  });

  closeBtn.addEventListener("click", () => {
    panel.style.display = "none";
    trigger.style.display = "flex";
  });

  // Draggable header
  let isDragging = false, dragOffX = 0, dragOffY = 0;
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
    contextToggle.textContent = aiChatState.contextIncluded ? "Context: ON" : "Context: OFF";
    contextToggle.style.background = aiChatState.contextIncluded ? "#1a2a1a" : "#0d0f11";
    contextToggle.style.borderColor = aiChatState.contextIncluded ? "#2d5a2d" : "#252b33";
    contextToggle.style.color = aiChatState.contextIncluded ? "#4ade80" : "#6b7685";
  });

  // Auto-resize textarea
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 100) + "px";
  });

  // Send on Enter (Shift+Enter for newline)
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendBtn.click();
    }
  });

  clearBtn.addEventListener("click", async () => {
    aiChatState.history = [];
    await chrome.runtime.sendMessage({ type: "AI_CLEAR_HISTORY" });
    messagesEl.innerHTML = `
      <div style="text-align: center; color: #6b7685; font-size: 12px; padding: 20px;">
        Conversation cleared. Ask me anything!
      </div>
    `;
  });

  function renderHistory() {
    if (aiChatState.history.length === 0) return;
    messagesEl.innerHTML = "";
    for (const msg of aiChatState.history) {
      if (msg.role === "user") {
        appendUserMessage(msg.content);
      } else {
        appendAIMessage(msg.content, msg.parsed);
      }
    }
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function appendUserMessage(text) {
    const div = document.createElement("div");
    div.style.cssText = "align-self: flex-end; max-width: 80%; background: #1e3a5f; color: #e8edf2; padding: 8px 12px; border-radius: 12px 12px 4px 12px; font-size: 13px; line-height: 1.5; white-space: pre-wrap; word-break: break-word;";
    div.textContent = text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function appendAIMessage(text, parsed) {
    const wrapper = document.createElement("div");
    wrapper.style.cssText = "align-self: flex-start; max-width: 90%;";

    if (parsed && (parsed.action === "generate" || parsed.action === "improve")) {
      const card = document.createElement("div");
      card.style.cssText = "background: #161a1f; border: 1px solid #252b33; border-radius: 10px; overflow: hidden;";

      const label = document.createElement("div");
      label.style.cssText = "padding: 8px 12px; font-size: 11px; color: #6b7685; border-bottom: 1px solid #252b33;";
      label.textContent = parsed.action === "generate" ? "Generated diagram" : "Improved diagram";
      if (parsed.summary) label.textContent += ` — ${parsed.summary}`;
      card.appendChild(label);

      const actions = document.createElement("div");
      actions.style.cssText = "padding: 10px 12px; display: flex; gap: 8px;";

      const applyBtn = document.createElement("button");
      applyBtn.style.cssText = "flex: 1; background: #1a2a1a; border: 1px solid #2d5a2d; color: #4ade80; border-radius: 6px; padding: 7px 12px; cursor: pointer; font-size: 12px; font-weight: 600; font-family: 'DM Sans', sans-serif;";
      applyBtn.textContent = "Apply to Canvas";
      applyBtn.addEventListener("click", () => {
        const result = applyElementsToCanvas(parsed.elements);
        if (result.ok) {
          applyBtn.textContent = "Applied!";
          applyBtn.style.color = "#6b7685";
          applyBtn.style.borderColor = "#252b33";
          applyBtn.style.background = "#0d0f11";
          applyBtn.disabled = true;
        }
      });
      actions.appendChild(applyBtn);

      const countLabel = document.createElement("span");
      countLabel.style.cssText = "display: flex; align-items: center; font-size: 11px; color: #6b7685;";
      countLabel.textContent = `${parsed.elements.length} elements`;
      actions.appendChild(countLabel);

      card.appendChild(actions);
      wrapper.appendChild(card);
    } else {
      const bubble = document.createElement("div");
      bubble.style.cssText = "background: #161a1f; color: #e8edf2; padding: 8px 12px; border-radius: 12px 12px 12px 4px; font-size: 13px; line-height: 1.5; border: 1px solid #252b33; white-space: pre-wrap; word-break: break-word;";
      bubble.textContent = text;
      wrapper.appendChild(bubble);
    }

    messagesEl.appendChild(wrapper);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function appendStreamingMessage() {
    const wrapper = document.createElement("div");
    wrapper.id = "excalihub-ai-streaming";
    wrapper.style.cssText = "align-self: flex-start; max-width: 90%;";

    const bubble = document.createElement("div");
    bubble.style.cssText = "background: #161a1f; color: #e8edf2; padding: 8px 12px; border-radius: 12px 12px 12px 4px; font-size: 13px; line-height: 1.5; border: 1px solid #252b33; white-space: pre-wrap; word-break: break-word;";
    bubble.id = "excalihub-ai-stream-bubble";
    bubble.innerHTML = '<span style="color: #6b7685;">Thinking...</span>';

    wrapper.appendChild(bubble);
    messagesEl.appendChild(wrapper);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // Send message
  sendBtn.addEventListener("click", async () => {
    const text = input.value.trim();
    if (!text || aiChatState.isStreaming) return;

    input.value = "";
    input.style.height = "auto";

    aiChatState.isStreaming = true;
    sendBtn.style.display = "none";
    stopBtn.style.display = "flex";

    appendUserMessage(text);
    appendStreamingMessage();

    const canvasContext = aiChatState.contextIncluded ? getExcalidrawScene().scene : null;

    aiChatState.history.push({ role: "user", content: text, timestamp: Date.now() });

    const response = await chrome.runtime.sendMessage({
      type: "AI_CHAT",
      prompt: text,
      canvasContext,
      history: aiChatState.history.filter((m) => m.role !== "system"),
    });

    aiChatState.isStreaming = false;
    sendBtn.style.display = "flex";
    stopBtn.style.display = "none";

    if (response?.error) {
      const streamEl = document.getElementById("excalihub-ai-streaming");
      if (streamEl) {
        const bubble = streamEl.querySelector("div");
        bubble.textContent = `Error: ${response.error}`;
        bubble.style.color = "#f76f6f";
        bubble.style.borderColor = "#5c1c1c";
        streamEl.id = "";
      }
      return;
    }

    const streamBubble = document.getElementById("excalihub-ai-stream-bubble");
    const fullContent = response?.content || "";

    const parsed = parseAIResponse(fullContent);
    const displayText = parsed.action === "chat" || parsed.action === "analyze"
      ? (parsed.message || parsed.analysis || fullContent)
      : parsed.summary || fullContent;

    if (streamBubble) streamBubble.textContent = displayText;
    const streamEl = document.getElementById("excalihub-ai-streaming");
    if (streamEl) streamEl.id = "";

    aiChatState.history.push({
      role: "assistant",
      content: fullContent,
      parsed,
      timestamp: Date.now(),
    });

    // Re-render to show proper action cards
    if (parsed.action === "generate" || parsed.action === "improve") {
      const lastMsg = messagesEl.lastElementChild;
      if (lastMsg) lastMsg.remove();
      appendAIMessage(displayText, parsed);
    }

    // Save history
    chrome.storage.local.set({
      aiConversationHistory: aiChatState.history.slice(-50),
    }).catch(() => {});

    messagesEl.scrollTop = messagesEl.scrollHeight;
  });

  // Stop generation
  stopBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "AI_STOP_GENERATION" });
    aiChatState.isStreaming = false;
    sendBtn.style.display = "flex";
    stopBtn.style.display = "none";
  });

  // Listen for stream chunks
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "AI_STREAM_CHUNK") {
      const bubble = document.getElementById("excalihub-ai-stream-bubble");
      if (bubble) {
        bubble.textContent = msg.fullContent;
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }
    }
    if (msg.type === "AI_STREAM_ERROR") {
      const bubble = document.getElementById("excalihub-ai-stream-bubble");
      if (bubble) {
        bubble.textContent = `Error: ${msg.error}`;
        bubble.style.color = "#f76f6f";
      }
      aiChatState.isStreaming = false;
      sendBtn.style.display = "flex";
      stopBtn.style.display = "none";
    }
  });

  // Load settings for context mode
  const aiSettings = await chrome.runtime.sendMessage({ type: "AI_GET_SETTINGS" });
  if (aiSettings?.ok) {
    aiChatState.contextIncluded = aiSettings.settings.contextMode === "auto";
    if (contextToggle) {
      contextToggle.textContent = aiChatState.contextIncluded ? "Context: ON" : "Context: OFF";
      contextToggle.style.background = aiChatState.contextIncluded ? "#1a2a1a" : "#0d0f11";
      contextToggle.style.borderColor = aiChatState.contextIncluded ? "#2d5a2d" : "#252b33";
      contextToggle.style.color = aiChatState.contextIncluded ? "#4ade80" : "#6b7685";
    }
  }
}
```

**Step 3: Initialize AI chat alongside sidebar**

In `content.js`, modify the initialization section at the bottom (lines 1996-2003) to also call `injectAIChat`:

Change:
```javascript
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", injectSidebar);
} else {
  injectSidebar();
}
```

To:
```javascript
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    injectSidebar();
    injectAIChat();
  });
} else {
  injectSidebar();
  injectAIChat();
}
```

**Step 4: Verify no syntax errors**

Run: `node -c content.js`
Expected: No output (no syntax errors)

**Step 5: Commit**

```bash
git add content.js
git commit -m "feat(ai): add floating AI chatbox, element validator, and canvas injection"
```

---

### Task 5: Add AI sidebar chat tab to content.js

**Files:**
- Modify: `content.js` (integrate AI tab into existing sidebar)

**Step 1: Add tab UI to sidebar header**

In `content.js`, inside the `injectSidebar()` function, find the sidebar header HTML (around line 63-88). Replace the header section to add tab buttons.

Find this block in the `sidebar.innerHTML`:
```html
      <div class="sidebar-header">
      <div class="sidebar-logo">
```

Replace the entire `sidebar-header` div with:

```html
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
```

**Step 2: Add AI chat panel inside sidebar content**

In the same `sidebar.innerHTML`, after the closing `</div>` of the existing `sidebar-section` that contains the file list (around line 227, before `</div>` that closes `sidebar-content`), add:

```html
        <!-- AI Chat Panel (hidden by default) -->
        <div id="excalihub-ai-sidebar-panel" style="display: none; flex-direction: column; height: calc(100vh - 120px);">
          <div id="excalihub-ai-sidebar-messages" style="flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px;">
            <div style="text-align: center; color: #6b7685; font-size: 12px; padding: 16px;">
              Ask me to generate, analyze, or improve your diagrams.
            </div>
          </div>
          <div style="display: flex; gap: 8px; padding: 10px 12px; border-top: 1px solid #252b33;">
            <textarea id="excalihub-ai-sidebar-input" placeholder="Ask AI..." rows="1" style="
              flex: 1;
              background: #0d0f11;
              border: 1px solid #252b33;
              color: #e8edf2;
              border-radius: 6px;
              padding: 7px 10px;
              font-size: 12px;
              outline: none;
              resize: none;
              font-family: 'DM Sans', sans-serif;
              max-height: 80px;
            "></textarea>
            <button id="excalihub-ai-sidebar-send" style="
              background: linear-gradient(135deg, #7c3aed, #4f8ef7);
              border: none;
              border-radius: 6px;
              padding: 0 12px;
              cursor: pointer;
              display: flex;
              align-items: center;
            ">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 8l12-6-6 12V8H2z" fill="white"/></svg>
            </button>
          </div>
        </div>
```

**Step 3: Add tab switching logic**

Inside `injectSidebar()`, after the existing event listeners for close/theme buttons (around line 1060), add tab switching:

```javascript
  // Tab switching
  const tabFiles = document.getElementById("tab-files");
  const tabAI = document.getElementById("tab-ai");
  const filesSection = sidebarEl.querySelector(".sidebar-section");
  const aiSidebarPanel = document.getElementById("excalihub-ai-sidebar-panel");

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
    });
  }

  // Sidebar AI chat send
  const sidebarInput = document.getElementById("excalihub-ai-sidebar-input");
  const sidebarSend = document.getElementById("excalihub-ai-sidebar-send");
  const sidebarMessages = document.getElementById("excalihub-ai-sidebar-messages");

  if (sidebarInput && sidebarSend) {
    sidebarInput.addEventListener("input", () => {
      sidebarInput.style.height = "auto";
      sidebarInput.style.height = Math.min(sidebarInput.scrollHeight, 80) + "px";
    });

    sidebarInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sidebarSend.click();
      }
    });

    sidebarSend.addEventListener("click", async () => {
      const text = sidebarInput.value.trim();
      if (!text || aiChatState.isStreaming) return;

      sidebarInput.value = "";
      sidebarInput.style.height = "auto";

      // Add user message to sidebar
      const userDiv = document.createElement("div");
      userDiv.style.cssText = "align-self: flex-end; max-width: 85%; background: #1e3a5f; color: #e8edf2; padding: 7px 10px; border-radius: 10px 10px 4px 10px; font-size: 12px; line-height: 1.5; white-space: pre-wrap; word-break: break-word;";
      userDiv.textContent = text;
      sidebarMessages.appendChild(userDiv);

      const thinkingDiv = document.createElement("div");
      thinkingDiv.style.cssText = "align-self: flex-start; max-width: 90%; background: #161a1f; color: #6b7685; padding: 7px 10px; border-radius: 10px 10px 10px 4px; font-size: 12px; border: 1px solid #252b33;";
      thinkingDiv.textContent = "Thinking...";
      sidebarMessages.appendChild(thinkingDiv);
      sidebarMessages.scrollTop = sidebarMessages.scrollHeight;

      const canvasContext = aiChatState.contextIncluded ? getExcalidrawScene().scene : null;

      aiChatState.history.push({ role: "user", content: text, timestamp: Date.now() });
      aiChatState.isStreaming = true;
      sidebarSend.style.opacity = "0.5";

      const response = await chrome.runtime.sendMessage({
        type: "AI_CHAT",
        prompt: text,
        canvasContext,
        history: aiChatState.history.filter((m) => m.role !== "system"),
      });

      aiChatState.isStreaming = false;
      sidebarSend.style.opacity = "1";

      const fullContent = response?.content || response?.error || "No response";
      const parsed = response?.error ? null : parseAIResponse(fullContent);

      thinkingDiv.remove();

      if (response?.error) {
        const errDiv = document.createElement("div");
        errDiv.style.cssText = "align-self: flex-start; max-width: 90%; background: #1a1010; color: #f76f6f; padding: 7px 10px; border-radius: 10px 10px 10px 4px; font-size: 12px; border: 1px solid #5c1c1c;";
        errDiv.textContent = response.error;
        sidebarMessages.appendChild(errDiv);
      } else if (parsed && (parsed.action === "generate" || parsed.action === "improve")) {
        const card = document.createElement("div");
        card.style.cssText = "align-self: flex-start; max-width: 95%; background: #161a1f; border: 1px solid #252b33; border-radius: 8px; overflow: hidden;";
        card.innerHTML = `
          <div style="padding: 6px 10px; font-size: 10px; color: #6b7685; border-bottom: 1px solid #252b33;">
            ${parsed.action === "generate" ? "Generated" : "Improved"} — ${parsed.elements.length} elements
            ${parsed.summary ? `<br>${parsed.summary}` : ""}
          </div>
          <div style="padding: 8px 10px;">
            <button class="sidebar-ai-apply" style="background: #1a2a1a; border: 1px solid #2d5a2d; color: #4ade80; border-radius: 5px; padding: 5px 10px; cursor: pointer; font-size: 11px; font-weight: 600; font-family: 'DM Sans', sans-serif;">
              Apply to Canvas
            </button>
          </div>
        `;
        card.querySelector(".sidebar-ai-apply").addEventListener("click", function () {
          applyElementsToCanvas(parsed.elements);
          this.textContent = "Applied!";
          this.style.color = "#6b7685";
          this.style.borderColor = "#252b33";
          this.style.background = "#0d0f11";
          this.disabled = true;
        });
        sidebarMessages.appendChild(card);
      } else {
        const aiDiv = document.createElement("div");
        aiDiv.style.cssText = "align-self: flex-start; max-width: 90%; background: #161a1f; color: #e8edf2; padding: 7px 10px; border-radius: 10px 10px 10px 4px; font-size: 12px; line-height: 1.5; border: 1px solid #252b33; white-space: pre-wrap; word-break: break-word;";
        aiDiv.textContent = parsed?.message || parsed?.analysis || fullContent;
        sidebarMessages.appendChild(aiDiv);
      }

      aiChatState.history.push({
        role: "assistant",
        content: fullContent,
        parsed,
        timestamp: Date.now(),
      });

      chrome.storage.local.set({
        aiConversationHistory: aiChatState.history.slice(-50),
      }).catch(() => {});

      sidebarMessages.scrollTop = sidebarMessages.scrollHeight;
    });
  }
```

**Step 4: Verify no syntax errors**

Run: `node -c content.js`
Expected: No output

**Step 5: Commit**

```bash
git add content.js
git commit -m "feat(ai): add AI chat tab to sidebar with tab switching"
```

---

### Task 6: Add AI quick-actions to popup

**Files:**
- Modify: `popup.html` (add AI section in the "ready" state)
- Modify: `popup.js` (add AI quick-action handlers)

**Step 1: Add AI section to popup.html**

In `popup.html`, find the `state-ready` div and add an AI section after the save controls, before the closing `</div>` of `state-ready`. Look for the save button area and add after it:

```html
<div id="ai-quick-actions" style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #252b33;">
  <div style="font-size: 12px; font-weight: 600; color: #6b7685; margin-bottom: 8px;">AI Quick Actions</div>
  <div style="display: flex; gap: 6px; flex-wrap: wrap;">
    <button id="ai-quick-generate" style="flex: 1; min-width: 120px; background: #161a1f; border: 1px solid #252b33; color: #e8edf2; border-radius: 8px; padding: 8px 12px; cursor: pointer; font-size: 12px; font-family: 'DM Sans', sans-serif; display: flex; align-items: center; gap: 6px; justify-content: center;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/></svg>
      Generate
    </button>
    <button id="ai-quick-analyze" style="flex: 1; min-width: 120px; background: #161a1f; border: 1px solid #252b33; color: #e8edf2; border-radius: 8px; padding: 8px 12px; cursor: pointer; font-size: 12px; font-family: 'DM Sans', sans-serif; display: flex; align-items: center; gap: 6px; justify-content: center;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4f8ef7" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
      Analyze
    </button>
  </div>
</div>
```

**Step 2: Add AI quick-action handlers to popup.js**

Append to `popup.js` after the `init()` call at line 390:

```javascript
// ─── AI Quick Actions ────────────────────────────────────────────────────────

document.getElementById("ai-quick-generate")?.addEventListener("click", async () => {
  const tab = await getActiveExcalidrawTab();
  if (!tab) return;
  const prompt = window.prompt("Describe the diagram you want to generate:");
  if (!prompt) return;

  const btn = document.getElementById("ai-quick-generate");
  btn.textContent = "Generating...";
  btn.disabled = true;

  const sceneResult = await chrome.tabs.sendMessage(tab.id, { type: "GET_SCENE" });
  const response = await chrome.runtime.sendMessage({
    type: "AI_CHAT",
    prompt,
    canvasContext: sceneResult?.scene,
    history: [],
  });

  btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/></svg> Generate`;
  btn.disabled = false;

  if (response?.ok) {
    showToast("Diagram generated! Check the floating AI panel.", "success");
  } else {
    showToast(response?.error || "Generation failed", "error");
  }
});

document.getElementById("ai-quick-analyze")?.addEventListener("click", async () => {
  const tab = await getActiveExcalidrawTab();
  if (!tab) return;

  const btn = document.getElementById("ai-quick-analyze");
  btn.textContent = "Analyzing...";
  btn.disabled = true;

  const sceneResult = await chrome.tabs.sendMessage(tab.id, { type: "GET_SCENE" });
  if (!sceneResult?.scene) {
    showToast("Canvas is empty", "error");
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4f8ef7" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg> Analyze`;
    btn.disabled = false;
    return;
  }

  const response = await chrome.runtime.sendMessage({
    type: "AI_CHAT",
    prompt: "Analyze this diagram. Describe what it shows and suggest improvements.",
    canvasContext: sceneResult.scene,
    history: [],
  });

  btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4f8ef7" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg> Analyze`;
  btn.disabled = false;

  if (response?.ok) {
    showToast("Analysis ready! Check the AI panel.", "success");
  } else {
    showToast(response?.error || "Analysis failed", "error");
  }
});
```

**Step 3: Verify no syntax errors**

Run: `node -c popup.js`
Expected: No output

**Step 4: Commit**

```bash
git add popup.html popup.js
git commit -m "feat(ai): add AI quick-action buttons to popup"
```

---

### Task 7: Final verification and test

**Step 1: Verify all files have no syntax errors**

Run: `node -c manifest.json && node -c background.js && node -c content.js && node -c options.js && node -c popup.js`
Expected: No errors

**Step 2: Load extension in Chrome and test**

1. Open `chrome://extensions/`
2. Click "Load unpacked" → select `excalihub/`
3. Open `https://excalidraw.com`
4. Verify sidebar appears with "Files" and "AI" tabs
5. Verify floating AI button appears (bottom-right)
6. Open extension settings → verify "AI Assistant" section appears
7. Enter an OpenRouter API key → click "Test"
8. Click the floating AI button → verify chat panel opens
9. Type "Draw a simple flowchart" → verify response appears
10. Click "Apply to Canvas" → verify elements appear on canvas
11. Switch to sidebar "AI" tab → verify chat works there too

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat(ai): complete AI integration with OpenRouter — v1"
```
