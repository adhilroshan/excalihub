# AI Integration Design for ExcaliHub

**Date:** 2026-04-09
**Status:** Approved
**Approach:** LLM generates Excalidraw JSON directly via OpenRouter API

## Overview

Integrate AI capabilities into the ExcaliHub Chrome extension, enabling users to chat with an AI assistant directly on the Excalidraw canvas. The AI can generate diagrams, analyze existing drawings, suggest improvements, and act as a general drawing assistant.

## Features (v1 — All at once)

1. **Text-to-diagram generation** — Describe what you want, AI generates Excalidraw elements on canvas
2. **Diagram analysis/explanation** — AI describes and explains the current drawing
3. **Diagram improvement suggestions** — AI suggests and applies layout/style refinements
4. **General drawing assistant** — Answers questions about diagramming best practices

## Architecture

```
content.js (injected into excalidraw.com)
├── Existing Sidebar (files)
└── AI Chat Module
    ├── Floating Chatbox (draggable/resizable)
    └── Sidebar Chat Tab (integrated w/ files sidebar)

background.js (service worker)
├── Existing: Auth, GitHub API, Auto-save
└── New: AI message handlers, OpenRouter API calls, streaming
```

- AI logic lives in `background.js` (service worker) — makes API calls to OpenRouter
- `content.js` handles the two chat UIs and injects/reads Excalidraw elements
- `popup.js` gets a quick-access AI section
- API key stored in `chrome.storage.local` (same pattern as GitHub token)

## Chat UI — Two Views

### Floating Chatbox
- Trigger: Small floating button (bottom-right) with sparkle/AI icon
- Expand: Click opens a draggable, resizable chat panel (default 380x500px, min 300x400)
- Header: Title bar with drag handle, minimize/close buttons, model selector dropdown
- Body: Scrollable message list (user right-aligned, AI left-aligned)
- Input: Text input bar with send button, context toggle to include/exclude canvas
- Position/size persisted in `chrome.storage.local`

### Sidebar Chat Tab
- Location: Second tab in existing ExcaliHub sidebar (Files | AI Chat)
- Content: Same chat interface filling sidebar width
- Shared state: Both views share conversation history

### Message Types in Chat
| Message Type | Visual | Action |
|---|---|---|
| User text | Right-aligned bubble | Sent as prompt to AI |
| AI text response | Left-aligned bubble with markdown | Displayed to user |
| AI diagram generation | Card with preview + "Apply to Canvas" button | Injects elements |
| AI diagram analysis | Text response referencing canvas elements | Informational |
| AI improvement suggestion | Side-by-side with "Apply" button | Replaces elements |
| Error | Red-tinted bubble | Shows error message |

## AI Backend — OpenRouter Integration

### API Call Flow
1. User sends message → `content.js` sends `AI_CHAT` to `background.js`
2. `background.js` builds prompt (system + history + optional canvas context)
3. Calls OpenRouter API (`https://openrouter.ai/api/v1/chat/completions`) streaming SSE
4. Streams chunks back to `content.js` for real-time display

### Settings (chrome.storage.sync)
- `aiApiKey` — OpenRouter API key
- `aiModel` — selected model ID (default: `openai/gpt-4o`)
- `aiContextMode` — `"auto"` (always send canvas) or `"manual"` (only when toggled)
- `aiMaxTokens` — 500–4096 (default 2048)
- `aiTemperature` — 0.0–1.0 (default 0.3)

### System Prompt Strategy

Three prompt modes:

**Generation:** Teaches Excalidraw element schema, requests JSON `{ "elements": [...] }` output.

**Analysis:** Sends current scene JSON, asks for markdown explanation.

**Improvement:** Sends current scene, requests complete updated elements array.

### Element Validation & Repair
1. Check required fields per element type
2. Generate missing `seed` and `version` fields
3. Normalize coordinates to center on canvas
4. Clamp invalid values
5. Show error with retry option if unrepairable

### Conversation History
- Stored in `chrome.storage.local` under `aiConversationHistory`
- Max 50 messages, trimmed oldest-first
- Format: `{ role, content, timestamp, attachedCanvas? }`
- "New conversation" button clears history
- Canvas context snapshotted per-message when context mode is "auto"

## New Message Types

| Message | Direction | Description |
|---|---|---|
| `AI_CHAT` | content/popup → background | Send chat prompt with optional canvas context |
| `AI_GENERATE` | content → background | Request diagram generation |
| `AI_ANALYZE` | content → background | Analyze current canvas |
| `AI_IMPROVE` | content → background | Get improvement suggestions |
| `AI_APPLY_ELEMENTS` | content → content (self) | Validate and inject elements |
| `AI_GET_SETTINGS` | popup/content → background | Retrieve AI settings |
| `AI_SAVE_SETTINGS` | popup/options → background | Save AI configuration |
| `AI_GET_HISTORY` | content → background | Load conversation history |
| `AI_CLEAR_HISTORY` | content → background | Clear conversation history |
| `AI_STOP_GENERATION` | content → background | Abort streaming response |

## Data Flow: Diagram Generation

```
User types: "Draw a login flowchart"
  → content.js captures message + snapshots canvas
  → sends AI_CHAT { prompt, canvasContext, history }
  → background.js builds system prompt + calls OpenRouter (streaming)
  → streams chunks to content.js
  → content.js displays text in chat bubble
  → if JSON detected: validate → show "Apply to Canvas" button
  → on click: AI_APPLY_ELEMENTS validates, repairs, centers
  → writes to localStorage["excalidraw"]
  → dispatches storage event to refresh canvas
```

## Streaming Implementation

- `background.js` uses `fetch()` with `ReadableStream` for SSE chunks
- Each chunk forwarded to `content.js` via `chrome.runtime.sendMessage`
- "Stop" button during generation aborts via `AI_STOP_GENERATION`

## AI Settings UI

New "AI Assistant" section in `options.html`:
- API key input (password field with show/hide + "Test Connection")
- Model selector dropdown (fetched from OpenRouter, grouped by provider, shows cost)
- Context mode toggle
- Max tokens slider (500–4096)
- Temperature slider (0.0–1.0)

## Error Handling

| Scenario | Behavior |
|---|---|
| No API key | Setup prompt with link to options |
| Invalid key (401) | Error bubble + link to settings |
| Rate limited (429) | "Retry in X seconds" with auto-retry |
| Invalid JSON | Validator repairs; if unrepairable, error + raw output + retry |
| Network error | "Connection failed" + retry button |
| Context too large | Truncate to 200 elements, strip `points` arrays |
| Timeout (30s) | "Timed out" + retry option |

## Token Budget Management

- Canvas context compressed: strip optional fields, round coords, limit 200 elements
- Conversation history trimmed to last 20 messages
- System prompt ~500 tokens, leaving ~3500 for context + user message
- Optional token count display before sending

## Permissions

`manifest.json` addition:
```json
{
  "host_permissions": [
    "https://openrouter.ai/*"
  ]
}
```

No new Chrome permissions needed.

## Files to Modify

1. `manifest.json` — add OpenRouter host permission
2. `background.js` — add AI message handlers, OpenRouter API calls, streaming
3. `content.js` — add floating chatbox UI, sidebar chat tab, element validator, canvas injection
4. `popup.html/js` — add AI quick-access section
5. `options.html/js` — add AI settings section
