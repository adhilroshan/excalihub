// background.js — service worker
// Handles: Device Flow auth, token storage, GitHub API save

const CLIENT_ID = "YOUR_CLIENT_ID_HERE";
const DEVICE_CODE_URL = "https://github.com/login/device/code";
const TOKEN_URL = "https://github.com/login/oauth/access_token";
const SCOPE = "repo";

let pollTimer = null;

// ─── Device Flow ────────────────────────────────────────────────────────────

async function startDeviceFlow() {
  const resp = await fetch(DEVICE_CODE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: CLIENT_ID, scope: SCOPE }),
  });
  if (!resp.ok) throw new Error("Failed to start device flow");
  return resp.json();
  // Returns: { device_code, user_code, verification_uri, expires_in, interval }
}

async function pollForToken(device_code, interval) {
  return new Promise((resolve, reject) => {
    let delay = interval * 1000;

    const attempt = async () => {
      try {
        const resp = await fetch(TOKEN_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            client_id: CLIENT_ID,
            device_code,
            grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          }),
        });
        const data = await resp.json();

        if (data.access_token) {
          clearTimeout(pollTimer);
          resolve(data.access_token);
        } else if (data.error === "authorization_pending") {
          pollTimer = setTimeout(attempt, delay);
        } else if (data.error === "slow_down") {
          delay += 5000;
          pollTimer = setTimeout(attempt, delay);
        } else if (data.error === "expired_token") {
          reject(new Error("Authorization expired. Please try again."));
        } else {
          reject(new Error(data.error_description || "Authorization failed."));
        }
      } catch (err) {
        reject(err);
      }
    };

    pollTimer = setTimeout(attempt, delay);
  });
}

// ─── GitHub User ─────────────────────────────────────────────────────────────

async function getGitHubUser(token) {
  const resp = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  });
  if (!resp.ok) throw new Error("Failed to fetch GitHub user");
  return resp.json();
}

// ─── GitHub Save ─────────────────────────────────────────────────────────────

async function saveToGitHub({
  token,
  owner,
  repo,
  branch,
  path,
  content,
  message,
  existingSha,
}) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  };

  const body = { message, content, branch };
  if (existingSha) body.sha = existingSha;

  const resp = await fetch(url, {
    method: "PUT",
    headers,
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.message || `GitHub API error: ${resp.status}`);
  }
  return resp.json();
}

// ─── GitHub List Files ────────────────────────────────────────────────────────

async function listFilesFromGitHub({ token, owner, repo, branch, path }) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
  };

  const resp = await fetch(url, { headers });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.message || `GitHub API error: ${resp.status}`);
  }

  const items = await resp.json();
  // Filter to only .excalidraw files
  return items
    .filter((item) => item.type === "file" && item.name.endsWith(".excalidraw"))
    .map((item) => ({
      name: item.name,
      path: item.path,
      sha: item.sha,
      url: item.html_url,
      size: item.size,
    }));
}

// ─── GitHub Load File ─────────────────────────────────────────────────────────

async function loadFileFromGitHub({ token, owner, repo, path, branch }) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
  };

  const resp = await fetch(url, { headers });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.message || `GitHub API error: ${resp.status}`);
  }

  const data = await resp.json();
  const content = new TextDecoder().decode(
    Uint8Array.from(atob(data.content.replace(/\n/g, "")), (c) =>
      c.charCodeAt(0),
    ),
  );
  return JSON.parse(content);
}

// ─── GitHub Delete File ────────────────────────────────────────────────────────

async function deleteFileFromGitHub({ token, owner, repo, branch, path, sha }) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  };

  const body = { message: `excalihub: delete ${path}`, branch, sha };

  const resp = await fetch(url, {
    method: "DELETE",
    headers,
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.message || `GitHub API error: ${resp.status}`);
  }
  return resp.json();
}

// ─── Thumbnail Generation ────────────────────────────────────────────────────

async function generateThumbnail(sceneData) {
  // Create an offscreen canvas to render the Excalidraw scene
  const canvas = new OffscreenCanvas(200, 150);
  const ctx = canvas.getContext("2d");

  // Fill background
  const bgColor = sceneData.appState?.viewBackgroundColor || "#ffffff";
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, 200, 150);

  // Draw simple bounding boxes for elements
  const elements = sceneData.elements || [];
  if (elements.length === 0) return null;

  // Calculate bounding box of all elements
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  elements.forEach((el) => {
    if (el.x < minX) minX = el.x;
    if (el.y < minY) minY = el.y;
    if (el.x + (el.width || 0) > maxX) maxX = el.x + (el.width || 0);
    if (el.y + (el.height || 0) > maxY) maxY = el.y + (el.height || 0);
  });

  const width = maxX - minX || 100;
  const height = maxY - minY || 100;
  const padding = 20;

  // Calculate scale to fit canvas
  const scaleX = (200 - padding * 2) / width;
  const scaleY = (150 - padding * 2) / height;
  const scale = Math.min(scaleX, scaleY);

  // Calculate offset to center the drawing
  const offsetX = (200 - width * scale) / 2 - minX * scale;
  const offsetY = (150 - height * scale) / 2 - minY * scale;

  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);

  // Draw rectangles and simple shapes
  elements.forEach((el) => {
    if (el.isDeleted) return;

    ctx.fillStyle = el.backgroundColor || "transparent";
    ctx.strokeStyle = el.strokeColor || "#000000";
    ctx.lineWidth = el.strokeWidth || 1;

    if (el.type === "rectangle") {
      ctx.beginPath();
      ctx.rect(el.x, el.y, el.width || 0, el.height || 0);
      if (el.backgroundColor && el.backgroundColor !== "transparent") {
        ctx.fill();
      }
      ctx.stroke();
    } else if (el.type === "ellipse") {
      ctx.beginPath();
      ctx.ellipse(
        el.x + (el.width || 0) / 2,
        el.y + (el.height || 0) / 2,
        (el.width || 0) / 2,
        (el.height || 0) / 2,
        0,
        0,
        Math.PI * 2,
      );
      if (el.backgroundColor && el.backgroundColor !== "transparent") {
        ctx.fill();
      }
      ctx.stroke();
    } else if (el.type === "line" || el.type === "arrow") {
      ctx.beginPath();
      if (el.points && el.points.length > 0) {
        ctx.moveTo(el.x + el.points[0][0], el.y + el.points[0][1]);
        for (let i = 1; i < el.points.length; i++) {
          ctx.lineTo(el.x + el.points[i][0], el.y + el.points[i][1]);
        }
      }
      ctx.stroke();
    } else if (el.type === "text") {
      ctx.font = `${el.fontSize || 20}px ${el.fontFamily?.split(",")[0] || "sans-serif"}`;
      ctx.fillStyle = el.strokeColor || "#000000";
      ctx.fillText(el.text || "", el.x, el.y + (el.fontSize || 20));
    }
  });

  ctx.restore();

  // Convert to blob and then to base64
  const blob = await canvas.convertToBlob({ type: "image/png" });
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

// ─── Port-based streaming: content scripts / popup connect to us ─────────────

const activePorts = new Map(); // tabId or uniqueKey -> port

chrome.runtime.onConnect.addListener((port) => {
  if (!port.name.startsWith("ai-stream-")) return;
  const sender = port.sender;
  const key = sender.tab
    ? `tab-${sender.tab.id}-${port.name}`
    : `popup-${port.name}`;
  activePorts.set(key, port);
  port.onDisconnect.addListener(() => {
    activePorts.delete(key);
  });
});

// ─── Message Handler ─────────────────────────────────────────────────────────
// IMPORTANT: The listener must NOT be async. Return true synchronously to keep
// the message channel open, then call sendResponse inside the async handler.

// Helper: wrap an async handler with a timeout so sendResponse always fires
function withTimeout(fn, sendResponse, ms = 30000) {
  const timer = setTimeout(
    () => sendResponse({ error: "Request timed out" }),
    ms,
  );
  fn()
    .catch((err) => sendResponse({ error: err.message || String(err) }))
    .finally(() => clearTimeout(timer));
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // Handle GET_AUTH_STATUS synchronously-ish via promise
  if (msg.type === "GET_AUTH_STATUS") {
    chrome.storage.local
      .get(["token", "user", "tokenTimestamp"])
      .then(({ token, user, tokenTimestamp }) => {
        // GitHub device flow tokens expire after ~8h; consider expired after 7h for safety
        const TOKEN_TTL_MS = 7 * 60 * 60 * 1000;
        let expired = false;
        if (
          token &&
          tokenTimestamp &&
          Date.now() - tokenTimestamp > TOKEN_TTL_MS
        ) {
          expired = true;
        }
        sendResponse({
          authenticated: !!token && !expired,
          user: user ?? null,
          expired,
        });
      });
    return true;
  }

  if (msg.type === "SIGN_OUT") {
    if (pollTimer) clearTimeout(pollTimer);
    chrome.storage.local.remove(["token", "user"]).then(() => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === "START_AUTH") {
    startDeviceFlow()
      .then((flow) => {
        // Open GitHub device activation page
        chrome.tabs.create({ url: flow.verification_uri });
        // Reply immediately with the user_code so UI can display it
        sendResponse({ ok: true, user_code: flow.user_code });
        // Poll in background; store token when done — UI polls storage via waitForAuth()
        return pollForToken(flow.device_code, flow.interval);
      })
      .then((token) =>
        getGitHubUser(token).then((user) =>
          chrome.storage.local.set({ token, user, tokenTimestamp: Date.now() }),
        ),
      )
      .catch(() => {}); // UI's waitForAuth timeout handles failure gracefully
    return true;
  }

  if (msg.type === "SAVE_SCENE") {
    withTimeout(async () => {
      const { token } = await chrome.storage.local.get("token");
      if (!token) {
        sendResponse({ error: "Not authenticated" });
        return;
      }

      const { scene, fileName, settings } = msg;
      const jsonStr = JSON.stringify(scene, null, 2);
      const b64 = btoa(unescape(encodeURIComponent(jsonStr)));
      const filePath = `${settings.savePath.replace(/\/$/, "")}/${fileName}`;

      // Check if file exists first
      const url = `https://api.github.com/repos/${settings.owner}/${settings.repo}/contents/${filePath}?ref=${settings.branch}`;
      const headers = {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      };

      const checkResp = await fetch(url, { headers });
      if (checkResp.ok) {
        const existing = await checkResp.json();
        sendResponse({
          conflict: true,
          existingSha: existing.sha,
          path: filePath,
          url: existing.html_url,
        });
      } else {
        const result = await saveToGitHub({
          token,
          owner: settings.owner,
          repo: settings.repo,
          branch: settings.branch,
          path: filePath,
          content: b64,
          message: `excalihub: save ${fileName}`,
        });
        sendResponse({
          ok: true,
          url: result.content.html_url,
          path: filePath,
        });
      }
    }, sendResponse);
    return true;
  }

  if (msg.type === "LIST_FILES") {
    withTimeout(async () => {
      const { token } = await chrome.storage.local.get("token");
      if (!token) {
        sendResponse({ error: "Not authenticated" });
        return;
      }
      const settings = await chrome.storage.sync.get([
        "owner",
        "repo",
        "branch",
        "savePath",
      ]);
      const files = await listFilesFromGitHub({
        token,
        owner: settings.owner,
        repo: settings.repo,
        branch: settings.branch || "main",
        path: settings.savePath || "drawings/",
      });
      sendResponse({ ok: true, files });
    }, sendResponse);
    return true;
  }

  if (msg.type === "LOAD_FILE") {
    withTimeout(async () => {
      const { token } = await chrome.storage.local.get("token");
      if (!token) {
        sendResponse({ error: "Not authenticated" });
        return;
      }
      const settings = await chrome.storage.sync.get([
        "owner",
        "repo",
        "branch",
      ]);
      const scene = await loadFileFromGitHub({
        token,
        owner: settings.owner,
        repo: settings.repo,
        path: msg.path,
        branch: settings.branch || "main",
      });
      sendResponse({ ok: true, scene });
    }, sendResponse);
    return true;
  }

  if (msg.type === "DELETE_FILE") {
    withTimeout(async () => {
      const { token } = await chrome.storage.local.get("token");
      if (!token) {
        sendResponse({ error: "Not authenticated" });
        return;
      }
      const settings = await chrome.storage.sync.get([
        "owner",
        "repo",
        "branch",
      ]);
      const result = await deleteFileFromGitHub({
        token,
        owner: settings.owner,
        repo: settings.repo,
        branch: settings.branch || "main",
        path: msg.path,
        sha: msg.sha,
      });
      sendResponse({ ok: true, result });
    }, sendResponse);
    return true;
  }

  if (msg.type === "OVERWRITE_SCENE") {
    withTimeout(async () => {
      const { token } = await chrome.storage.local.get("token");
      if (!token) {
        sendResponse({ error: "Not authenticated" });
        return;
      }
      const { scene, fileName, settings, existingSha } = msg;
      const jsonStr = JSON.stringify(scene, null, 2);
      const b64 = btoa(unescape(encodeURIComponent(jsonStr)));
      const filePath = `${settings.savePath.replace(/\/$/, "")}/${fileName}`;
      const result = await saveToGitHub({
        token,
        owner: settings.owner,
        repo: settings.repo,
        branch: settings.branch,
        path: filePath,
        content: b64,
        message: `excalihub: update ${fileName}`,
        existingSha,
      });
      sendResponse({ ok: true, url: result.content.html_url, path: filePath });
    }, sendResponse);
    return true;
  }

  if (msg.type === "IMPORT_FILE") {
    withTimeout(async () => {
      const { token } = await chrome.storage.local.get("token");
      if (!token) {
        sendResponse({ error: "Not authenticated" });
        return;
      }
      const { fileName, content, settings } = msg;
      const filePath = `${settings.savePath.replace(/\/$/, "")}/${fileName}`;
      const result = await saveToGitHub({
        token,
        owner: settings.owner,
        repo: settings.repo,
        branch: settings.branch,
        path: filePath,
        content,
        message: `excalihub: import ${fileName}`,
      });
      sendResponse({ ok: true, url: result.content.html_url, path: filePath });
    }, sendResponse);
    return true;
  }

  if (msg.type === "GET_FILE_HISTORY") {
    withTimeout(async () => {
      const { token } = await chrome.storage.local.get("token");
      if (!token) {
        sendResponse({ error: "Not authenticated" });
        return;
      }
      const settings = await chrome.storage.sync.get([
        "owner",
        "repo",
        "branch",
      ]);
      const url = `https://api.github.com/repos/${settings.owner}/${settings.repo}/commits?path=${msg.path}&sha=${settings.branch || "main"}&per_page=20`;
      const headers = {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      };
      const resp = await fetch(url, { headers });
      const commits = await resp.json();
      if (!Array.isArray(commits)) throw new Error("Failed to fetch history");
      const history = commits.map((commit) => ({
        sha: commit.sha,
        date: new Date(commit.commit.author.date).toLocaleString(),
        message: commit.commit.message,
      }));
      sendResponse({ ok: true, commits: history });
    }, sendResponse);
    return true;
  }

  if (msg.type === "LOAD_FILE_AT_COMMIT") {
    withTimeout(async () => {
      const { token } = await chrome.storage.local.get("token");
      if (!token) {
        sendResponse({ error: "Not authenticated" });
        return;
      }
      const settings = await chrome.storage.sync.get(["owner", "repo"]);
      const url = `https://api.github.com/repos/${settings.owner}/${settings.repo}/contents/${msg.path}?ref=${msg.sha}`;
      const headers = {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      };
      const resp = await fetch(url, { headers });
      const data = await resp.json();
      const content = new TextDecoder().decode(
        Uint8Array.from(atob(data.content.replace(/\n/g, "")), (c) =>
          c.charCodeAt(0),
        ),
      );
      const scene = JSON.parse(content);
      sendResponse({ ok: true, scene });
    }, sendResponse);
    return true;
  }

  if (msg.type === "GET_STATISTICS") {
    withTimeout(async () => {
      const { token } = await chrome.storage.local.get("token");
      if (!token) {
        sendResponse({ error: "Not authenticated" });
        return;
      }

      const settings = await chrome.storage.sync.get([
        "owner",
        "repo",
        "branch",
        "savePath",
      ]);

      const savePath = (settings.savePath || "drawings/").replace(/\/$/, "");
      const headers = {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      };

      // Fetch both main folder and autosave folder in parallel
      const [mainResp, autosaveResp] = await Promise.all([
        fetch(
          `https://api.github.com/repos/${settings.owner}/${settings.repo}/contents/${savePath}?ref=${settings.branch || "main"}`,
          { headers },
        ),
        fetch(
          `https://api.github.com/repos/${settings.owner}/${settings.repo}/contents/_autosave?ref=${settings.branch || "main"}`,
          { headers },
        ),
      ]);

      let allFiles = [];

      if (mainResp.ok) {
        const mainFiles = await mainResp.json();
        if (Array.isArray(mainFiles)) {
          allFiles = allFiles.concat(mainFiles);
        }
      }

      if (autosaveResp.ok) {
        const autosaveFiles = await autosaveResp.json();
        if (Array.isArray(autosaveFiles)) {
          allFiles = allFiles.concat(autosaveFiles);
        }
      }

      const excalidrawFiles = allFiles.filter(
        (f) => f.type === "file" && f.name.endsWith(".excalidraw"),
      );

      const totalFiles = excalidrawFiles.length;
      const totalSize = excalidrawFiles.reduce(
        (sum, f) => sum + (f.size || 0),
        0,
      );
      const averageSize = totalFiles > 0 ? totalSize / totalFiles : 0;

      // Get last modified file across both folders
      let lastSaved = "Never";
      if (totalFiles > 0) {
        const sorted = [...excalidrawFiles].sort((a, b) =>
          b.name.localeCompare(a.name),
        );
        const latest = sorted[0];
        // Try to extract date from filename
        const dateMatch = latest.name.match(/(\d{4}-\d{2}-\d{2})/);
        if (dateMatch) {
          lastSaved = new Date(dateMatch[1]).toLocaleDateString();
        }
      }

      sendResponse({
        ok: true,
        stats: { totalFiles, totalSize, averageSize, lastSaved },
      });
    }, sendResponse);
    return true;
  }

  if (msg.type === "GENERATE_THUMBNAIL") {
    withTimeout(async () => {
      const { token } = await chrome.storage.local.get("token");
      if (!token) {
        sendResponse({ error: "Not authenticated" });
        return;
      }

      const settings = await chrome.storage.sync.get([
        "owner",
        "repo",
        "branch",
      ]);
      const url = `https://api.github.com/repos/${settings.owner}/${settings.repo}/contents/${msg.path}?ref=${settings.branch || "main"}`;
      const headers = {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      };

      const resp = await fetch(url, { headers });
      if (!resp.ok) {
        throw new Error("Failed to fetch file");
      }

      const data = await resp.json();
      const content = new TextDecoder().decode(
        Uint8Array.from(atob(data.content.replace(/\n/g, "")), (c) =>
          c.charCodeAt(0),
        ),
      );
      const scene = JSON.parse(content);

      // Generate thumbnail
      const thumbnail = await generateThumbnail(scene);

      // Cache thumbnail in storage (max 100 entries, evict oldest)
      try {
        const { thumbnails = {} } =
          await chrome.storage.local.get("thumbnails");
        thumbnails[msg.path] = {
          data: thumbnail,
          timestamp: Date.now(),
        };
        // Evict oldest entries if cache exceeds 100
        const keys = Object.keys(thumbnails);
        if (keys.length > 100) {
          const sorted = keys.sort(
            (a, b) => thumbnails[a].timestamp - thumbnails[b].timestamp,
          );
          const toDelete = sorted.slice(0, keys.length - 100);
          for (const k of toDelete) delete thumbnails[k];
        }
        await chrome.storage.local.set({ thumbnails });
      } catch (err) {
        console.error("Failed to cache thumbnail:", err);
      }

      sendResponse({ ok: true, thumbnail, scene });
    }, sendResponse);
    return true;
  }

  if (msg.type === "GET_CACHED_THUMBNAIL") {
    chrome.storage.local.get("thumbnails").then(({ thumbnails = {} }) => {
      const thumb = thumbnails[msg.path];
      if (thumb && Date.now() - thumb.timestamp < 7 * 24 * 60 * 60 * 1000) {
        // Cache valid for 7 days
        sendResponse({ ok: true, thumbnail: thumb.data });
      } else {
        sendResponse({ ok: false });
      }
    });
    return true;
  }

  if (msg.type === "OPEN_OPTIONS") {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === "UPDATE_AUTOSAVE") {
    setupAutoSave();
    sendResponse({ ok: true });
    return true;
  }

  // ─── AI Handlers ────────────────────────────────────────────────────────────

  if (msg.type === "AI_CHAT") {
    (async () => {
      try {
        const settings = await chrome.storage.local.get([
          "aiApiKey",
          "aiModel",
          "aiMaxTokens",
          "aiTemperature",
          "aiContextMode",
        ]);

        if (!settings.aiApiKey) {
          sendResponse({
            error: "No API key. Open extension settings to add one.",
          });
          return;
        }

        const messages = [
          { role: "system", content: EXCALIDRAW_SYSTEM_PROMPT },
        ];

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

        // Find the port that the content script / popup opened before sending this message
        let port = null;
        if (msg._portName) {
          // Direct lookup by port name (most reliable — avoids race condition)
          for (const [key, p] of activePorts) {
            if (
              key.endsWith(`-${msg._portName}`) ||
              key === `popup-${msg._portName}`
            ) {
              port = p;
              break;
            }
          }
        }
        if (!port) {
          // Fallback: match by sender tab id
          if (_sender.tab) {
            for (const [key, p] of activePorts) {
              if (key.startsWith(`tab-${_sender.tab.id}-`)) {
                port = p;
                break;
              }
            }
          } else {
            for (const [key, p] of activePorts) {
              if (key.startsWith("popup-")) {
                port = p;
                break;
              }
            }
          }
        }

        if (port && _sender.tab) {
          // Use tool-enabled loop (requires a tab to send tool calls to)
          handleAIToolLoop(
            messages,
            settings,
            _sender.tab.id,
            port,
            sendResponse,
          );
        } else if (port) {
          // Popup — stream without tools for now (no direct tab access)
          const stream = await callOpenRouter(messages, settings);
          handleAIStreamWithPort(stream, port, sendResponse);
        } else {
          // No port — fall back to fire-and-forget
          const stream = await callOpenRouter(messages, settings);
          handleAIStreamNoPort(stream, sendResponse);
        }
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
    chrome.storage.local
      .get([
        "aiApiKey",
        "aiModel",
        "aiMaxTokens",
        "aiTemperature",
        "aiContextMode",
      ])
      .then((settings) => {
        sendResponse({
          ok: true,
          settings: {
            hasApiKey: !!settings.aiApiKey,
            model: settings.aiModel || "openai/gpt-4o",
            maxTokens: settings.aiMaxTokens || null,
            temperature: settings.aiTemperature ?? 0.3,
            contextMode: settings.aiContextMode || "auto",
          },
        });
      });
    return true;
  }

  if (msg.type === "AI_SAVE_SETTINGS") {
    (async () => {
      const toSet = {};
      if (msg.settings.apiKey !== undefined)
        toSet.aiApiKey = msg.settings.apiKey;
      if (msg.settings.model !== undefined) toSet.aiModel = msg.settings.model;
      if (msg.settings.maxTokens !== undefined)
        toSet.aiMaxTokens = msg.settings.maxTokens;
      if (msg.settings.temperature !== undefined)
        toSet.aiTemperature = msg.settings.temperature;
      if (msg.settings.contextMode !== undefined)
        toSet.aiContextMode = msg.settings.contextMode;
      await chrome.storage.local.set(toSet);
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (msg.type === "AI_GET_HISTORY") {
    chrome.storage.local
      .get("aiConversationHistory")
      .then(({ aiConversationHistory }) => {
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
        const aiApiKey =
          msg.apiKey || (await chrome.storage.local.get("aiApiKey")).aiApiKey;
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
          sendResponse({
            ok: false,
            error: err.error?.message || `HTTP ${resp.status}`,
          });
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
        const aiApiKey =
          msg.apiKey || (await chrome.storage.local.get("aiApiKey")).aiApiKey;
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

// ─── Keyboard Shortcuts ──────────────────────────────────────────────────────

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "quick-save") {
    // Find active Excalidraw tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];

    if (!tab?.url?.includes("excalidraw.com")) {
      return; // Not on Excalidraw, do nothing
    }

    // Get scene data
    const sceneResult = await chrome.tabs.sendMessage(tab.id, {
      type: "GET_SCENE",
    });
    if (sceneResult?.error) return;

    // Get settings
    const settings = await chrome.storage.sync.get([
      "owner",
      "repo",
      "branch",
      "savePath",
    ]);
    if (!settings.owner || !settings.repo) return;

    // Check authentication
    const { token } = await chrome.storage.local.get("token");
    if (!token) return;

    // Generate filename
    const title = sceneResult.title || "untitled";
    const date = new Date().toISOString().slice(0, 10);
    const fileName = `${title}_${date}.excalidraw`;

    // Save to GitHub
    const jsonStr = JSON.stringify(sceneResult.scene, null, 2);
    const b64 = btoa(unescape(encodeURIComponent(jsonStr)));
    const filePath = `${settings.savePath || "drawings"}/${fileName}`;

    try {
      await saveToGitHub({
        token,
        owner: settings.owner,
        repo: settings.repo,
        branch: settings.branch || "main",
        path: filePath,
        content: b64,
        message: `excalihub: quick save ${fileName}`,
      });

      // Show success notification
      chrome.tabs.sendMessage(tab.id, {
        type: "SHOW_TOAST",
        message: `✓ Quick saved to GitHub`,
        toastType: "success",
      });
    } catch (err) {
      chrome.tabs.sendMessage(tab.id, {
        type: "SHOW_TOAST",
        message: `Quick save failed: ${err.message}`,
        toastType: "error",
      });
    }
  }
});

// ─── Auto-Save ───────────────────────────────────────────────────────────────

async function setupAutoSave() {
  // Clear existing alarm
  chrome.alarms.clear("excalihub-autosave");

  const settings = await chrome.storage.sync.get([
    "autoSaveEnabled",
    "autoSaveInterval",
    "owner",
    "repo",
    "branch",
    "savePath",
  ]);

  if (!settings.autoSaveEnabled || !settings.owner || !settings.repo) {
    return;
  }

  const intervalMinutes = settings.autoSaveInterval || 5;
  chrome.alarms.create("excalihub-autosave", {
    periodInMinutes: intervalMinutes,
  });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "excalihub-autosave") return;

  try {
    const { token } = await chrome.storage.local.get("token");
    if (!token) return;

    const settings = await chrome.storage.sync.get([
      "autoSaveCleanOld",
      "owner",
      "repo",
      "branch",
    ]);

    // Find all Excalidraw tabs
    const tabs = await chrome.tabs.query({ url: "https://excalidraw.com/*" });

    for (const tab of tabs) {
      try {
        // Get scene data
        const sceneResult = await chrome.tabs.sendMessage(tab.id, {
          type: "GET_SCENE",
        });
        if (sceneResult?.error || !sceneResult?.scene) continue;

        // Generate auto-save filename with timestamp
        const title = sceneResult.title || "untitled";
        const timestamp = new Date()
          .toISOString()
          .replace(/[:.]/g, "-")
          .slice(0, 19);
        const fileName = `${title}_${timestamp}.excalidraw`;
        const filePath = `_autosave/${fileName}`;

        // Save to GitHub
        const jsonStr = JSON.stringify(sceneResult.scene, null, 2);
        const b64 = btoa(unescape(encodeURIComponent(jsonStr)));

        await saveToGitHub({
          token,
          owner: settings.owner,
          repo: settings.repo,
          branch: settings.branch || "main",
          path: filePath,
          content: b64,
          message: `excalihub: auto-save ${title}`,
        });

        // Clean old backups if enabled
        if (settings.autoSaveCleanOld) {
          await cleanOldAutoSaves(settings, token, title);
        }
      } catch (err) {
        console.error("Auto-save failed for tab:", tab.id, err);
      }
    }
  } catch (err) {
    console.error("Auto-save error:", err);
  }
});

// Clean old auto-saves for a specific drawing
async function cleanOldAutoSaves(settings, token, title, keepCount = 10) {
  try {
    const listUrl = `https://api.github.com/repos/${settings.owner}/${settings.repo}/contents/_autosave?ref=${settings.branch || "main"}`;
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    };

    const resp = await fetch(listUrl, { headers });
    if (!resp.ok) return;

    const files = await resp.json();
    const matchingFiles = files
      .filter(
        (f) => f.name.startsWith(title + "_") && f.name.endsWith(".excalidraw"),
      )
      .sort((a, b) => b.name.localeCompare(a.name)); // Newest first

    // Delete oldest files if more than keepCount
    if (matchingFiles.length > keepCount) {
      const toDelete = matchingFiles.slice(keepCount);
      for (const file of toDelete) {
        try {
          await deleteFileFromGitHub({
            token,
            owner: settings.owner,
            repo: settings.repo,
            branch: settings.branch || "main",
            path: file.path,
            sha: file.sha,
          });
        } catch (err) {
          console.error("Failed to delete old auto-save:", file.path, err);
        }
      }
    }
  } catch (err) {
    console.error("Failed to clean old auto-saves:", err);
  }
}

// Setup auto-save on service worker startup
setupAutoSave();

// ─── AI Integration ──────────────────────────────────────────────────────────

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const EXCALIDRAW_SYSTEM_PROMPT = `You are an Excalidraw diagram assistant integrated into a Chrome extension called ExcaliHub. You help users create, analyze, and improve diagrams.

You have access to TOOLS that let you interact with the canvas. Use them when the user asks you to modify, read, or delete canvas content.

## Available Tools

### canvas_read()
Reads the current canvas state. Use this FIRST when the user references existing elements (e.g. "delete the database box", "move the login form left").
Returns: { "elements": [{ "id", "type", "x", "y", "width", "height", "text", "strokeColor", ... }, ...] }

### canvas_apply(elements)
Adds elements to the canvas. Use after generating a diagram or when the user says "add X".
Params: { "elements": [element objects in Excalidraw format] }
Returns: { "success": true, "count": N }

### canvas_delete(ids)
Removes specific elements by ID. Use when the user says "delete", "remove", or "get rid of" something on canvas.
Params: { "ids": ["element-id-1", "element-id-2"] }
Returns: { "success": true, "removed": N }

### canvas_modify(id, changes)
Modifies a single element's properties. Use for targeted edits like "move X to the right", "make this red", "rename to Y".
Params: { "id": "element-id", "changes": { "x": 500, "y": 300, "text": "New Label", "strokeColor": "#ff0000", ... } }
Returns: { "success": true, "element": { updated element object } }

## How to Use Tools

When you need to use a tool, respond with JSON:
{
  "action": "tool_use",
  "tool": "canvas_read|canvas_apply|canvas_delete|canvas_modify",
  "params": { ...tool-specific params... }
}

The tool result will be returned and you can continue the conversation. Use multiple tools in sequence if needed — e.g. canvas_read() first to find element IDs, then canvas_delete() or canvas_modify().

IMPORTANT: Only use tools when they're relevant. For general questions or generating new diagrams from scratch, use the normal action types below.

---

When generating NEW diagrams (no existing elements to modify), respond with:
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

IMPORTANT RULES:
1. Always respond with a SINGLE valid JSON object. Do not add explanation outside the JSON.
2. Use reasonable coordinates (x: 0-2000, y: 0-1000).
3. Text elements must have a "text" field.
4. Lines/arrows must have a "points" array like [[0,0],[100,0]].
5. MINIMIZE verbosity — omit optional fields that equal their defaults:
   - Skip "angle":0, "locked":false, "groupIds":[], "boundElements":null, "link":null, "frameId":null unless needed.
   - Skip "fillStyle","strokeStyle","roughness","opacity" when using defaults (hachure, solid, 1, 100).
6. For org charts / hierarchies, use rectangles for nodes with floating text labels — keep it simple.
7. CRITICAL: Complete the ENTIRE JSON before stopping. If a diagram is complex, use fewer elements. A role hierarchy needs 10-15 elements max.
8. When using canvas_modify, try to change only the properties the user asked about — don't replace the entire element.
9. When using canvas_delete, ALWAYS call canvas_read() first to find the correct element IDs unless the user explicitly provides them.`;

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
    temperature: settings.aiTemperature ?? 0.3,
    stream: true,
  };
  if (settings.aiMaxTokens) {
    body.max_tokens = settings.aiMaxTokens;
  }

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
  if (resp.status === 429)
    throw new Error("Rate limited — please wait a moment");
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error: ${resp.status}`);
  }

  return resp.body;
}

let activeAIStream = null;

// New: Port-based streaming — streams chunks over a stable long-lived port
function handleAIStreamWithPort(stream, port, sendResponse) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let fullContent = "";
  let buffer = "";
  let portAlive = true;

  activeAIStream = reader;

  // Safe postMessage — port may disconnect during MV3 lifecycle
  const postToPort = (msg) => {
    if (!portAlive) return;
    try {
      port.postMessage(msg);
    } catch (_) {
      portAlive = false;
    }
  };

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
            if (parsed.error) {
              const errMsg =
                parsed.error.message || JSON.stringify(parsed.error);
              postToPort({
                type: "error",
                error: `Provider error: ${errMsg}`,
              });
              sendResponse({ error: `Provider error: ${errMsg}` });
              return;
            }

            const choice = parsed.choices?.[0];
            if (!choice) continue;
            const delta = choice.delta;

            if (delta.reasoning) {
              fullContent += delta.reasoning;
              postToPort({
                type: "chunk",
                delta: delta.reasoning,
                fullContent,
              });
            }

            if (delta.content) {
              fullContent += delta.content;
              postToPort({
                type: "chunk",
                delta: delta.content,
                fullContent,
              });
            }
          } catch {}
        }
      }

      postToPort({ type: "done", fullContent });
      if (portAlive) {
        sendResponse({ ok: true, content: fullContent });
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        postToPort({ type: "error", error: err.message });
        if (portAlive) sendResponse({ error: err.message });
      }
    } finally {
      activeAIStream = null;
    }
  };

  port.onDisconnect.addListener(() => {
    portAlive = false;
    // Client disconnected — cancel the stream
    if (activeAIStream === reader) {
      reader.cancel().catch(() => {});
      activeAIStream = null;
    }
  });

  processChunk();
}

// Fallback: when port can't be opened, use fire-and-forget sendMessage (old behavior)
function handleAIStreamNoPort(stream, sendResponse) {
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
            if (parsed.error) {
              const errMsg =
                parsed.error.message || JSON.stringify(parsed.error);
              chrome.runtime
                .sendMessage({
                  type: "AI_STREAM_ERROR",
                  error: `Provider error: ${errMsg}`,
                })
                .catch(() => {});
              sendResponse({ error: `Provider error: ${errMsg}` });
              return;
            }

            const choice = parsed.choices?.[0];
            if (!choice) continue;
            const delta = choice.delta;

            if (delta.reasoning) {
              fullContent += delta.reasoning;
              chrome.runtime
                .sendMessage({
                  type: "AI_STREAM_CHUNK",
                  chunk: delta.reasoning,
                  fullContent,
                })
                .catch(() => {});
            }

            if (delta.content) {
              fullContent += delta.content;
              chrome.runtime
                .sendMessage({
                  type: "AI_STREAM_CHUNK",
                  chunk: delta.content,
                  fullContent,
                })
                .catch(() => {});
            }
          } catch {}
        }
      }

      chrome.runtime
        .sendMessage({
          type: "AI_STREAM_DONE",
          fullContent,
        })
        .catch(() => {});

      if (!fullContent.trim()) {
        sendResponse({
          error:
            "The AI returned no content. The model may be unavailable — try a different model or check your API key.",
        });
      } else {
        sendResponse({ ok: true, content: fullContent });
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        chrome.runtime
          .sendMessage({
            type: "AI_STREAM_ERROR",
            error: err.message,
          })
          .catch(() => {});
        sendResponse({ error: err.message });
      }
    } finally {
      activeAIStream = null;
    }
  };

  processChunk();
}

// Kept for backwards compatibility with any remaining fire-and-forget paths
function handleAIStream(stream, sendResponse) {
  handleAIStreamNoPort(stream, sendResponse);
}

// ─── Tool Execution Loop ──────────────────────────────────────────────────────

// Main loop: calls AI, detects tool_use, executes tool, re-calls AI. Max rounds.
// Only the FINAL (non-tool) response is streamed to the user.
// Intermediate tool calls are emitted on the port as { type: "tool_call" }.
async function handleAIToolLoop(messages, settings, tabId, port, sendResponse) {
  const MAX_TOOL_ROUNDS = 3;

  let lastContent = "";

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let fullContent = "";

    try {
      const stream = await callOpenRouter(messages, settings);
      fullContent = await consumeStream(stream, port);
      lastContent = fullContent;
    } catch (err) {
      sendResponse({ error: err.message });
      return;
    }

    if (!fullContent.trim()) {
      sendResponse({ error: "The AI returned no content." });
      return;
    }

    // Try to parse the final response
    let parsed;
    try {
      const jsonMatch = fullContent.match(
        /\{[\s\S]*"action"\s*:\s*"(generate|improve|analyze|chat|tool_use)"[\s\S]*\}/,
      );
      if (!jsonMatch) break; // Not JSON — treat as final response
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      break; // Not valid JSON — treat as final response
    }

    if (parsed.action !== "tool_use") {
      // Final response — already streamed, just confirm
      sendResponse({ ok: true, content: fullContent });
      return;
    }

    // Execute the tool
    const { tool, params } = parsed;
    let toolResult;
    try {
      toolResult = await executeTool(tool, params, tabId, port);
    } catch (err) {
      toolResult = { success: false, error: err.message };
      port.postMessage({ type: "tool_call", tool, result: toolResult });
    }

    // Append tool result to messages and continue the loop
    messages.push({
      role: "tool",
      content: JSON.stringify(toolResult),
      name: tool,
    });

    // Also add a hidden assistant message for context (tool call itself)
    messages.push({
      role: "assistant",
      content: JSON.stringify({ action: "tool_use", tool, params }),
    });
  }

  // If we exhausted tool rounds without a final response, return whatever we got
  sendResponse({
    ok: true,
    content:
      lastContent ||
      "Tool execution completed, but the AI did not produce a final response.",
  });
}

// Consumes an SSE stream, returns the full content string.
// Also streams chunks to the port if it's a chat/analyze response (not tool_use JSON).
async function consumeStream(stream, port) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let fullContent = "";
  let buffer = "";

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
          if (parsed.error) continue;
          const delta = parsed.choices?.[0]?.delta;
          if (delta?.content) fullContent += delta.content;
          if (delta?.reasoning) fullContent += delta.reasoning;
        } catch {}
      }
    }
  } catch {}

  return fullContent;
}

// Executes a single tool call and returns the result.
// Also emits a tool_call event on the port for UI rendering.
async function executeTool(tool, params, tabId, port) {
  const postResult = (result) => {
    try {
      port.postMessage({ type: "tool_call", tool, result });
    } catch (_) {}
    return result;
  };

  switch (tool) {
    case "canvas_read": {
      const result = await sendToolToTab(tabId, "canvas_read", {});
      return postResult(result);
    }
    case "canvas_apply": {
      const result = await sendToolToTab(tabId, "canvas_apply", params);
      return postResult(result);
    }
    case "canvas_delete": {
      const result = await sendToolToTab(tabId, "canvas_delete", params);
      return postResult(result);
    }
    case "canvas_modify": {
      const result = await sendToolToTab(tabId, "canvas_modify", params);
      return postResult(result);
    }
    default:
      return postResult({ success: false, error: `Unknown tool: ${tool}` });
  }
}

// Sends a tool execution request to the Excalidraw content script.
function sendToolToTab(tabId, tool, params) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(
      tabId,
      { type: "AI_EXECUTE_TOOL", tool, params },
      { timeout: 10000 },
      (response) => {
        if (chrome.runtime.lastError) {
          resolve({ success: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(
            response || {
              success: false,
              error: "No response from content script",
            },
          );
        }
      },
    );
  });
}
