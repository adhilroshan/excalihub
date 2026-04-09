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
  const content = decodeURIComponent(
    escape(atob(data.content.replace(/\n/g, ""))),
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

// ─── Message Handler ─────────────────────────────────────────────────────────
// IMPORTANT: The listener must NOT be async. Return true synchronously to keep
// the message channel open, then call sendResponse inside the async handler.

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // Handle GET_AUTH_STATUS synchronously-ish via promise
  if (msg.type === "GET_AUTH_STATUS") {
    chrome.storage.local.get(["token", "user"]).then(({ token, user }) => {
      sendResponse({ authenticated: !!token, user: user ?? null });
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
          chrome.storage.local.set({ token, user }),
        ),
      )
      .catch(() => {}); // UI's waitForAuth timeout handles failure gracefully
    return true;
  }

  if (msg.type === "SAVE_SCENE") {
    chrome.storage.local.get("token").then(({ token }) => {
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

      fetch(url, { headers })
        .then((checkResp) => {
          if (checkResp.ok) {
            // File exists - return conflict info
            return checkResp.json().then((existing) => {
              sendResponse({
                conflict: true,
                existingSha: existing.sha,
                path: filePath,
                url: existing.html_url,
              });
            });
          } else {
            // File doesn't exist - save directly
            return saveToGitHub({
              token,
              owner: settings.owner,
              repo: settings.repo,
              branch: settings.branch,
              path: filePath,
              content: b64,
              message: `excalihub: save ${fileName}`,
            }).then((result) =>
              sendResponse({
                ok: true,
                url: result.content.html_url,
                path: filePath,
              }),
            );
          }
        })
        .catch((err) => sendResponse({ error: err.message }));
    });
    return true;
  }

  if (msg.type === "LIST_FILES") {
    chrome.storage.local.get("token").then(({ token }) => {
      if (!token) {
        sendResponse({ error: "Not authenticated" });
        return;
      }

      chrome.storage.sync
        .get(["owner", "repo", "branch", "savePath"])
        .then((settings) => {
          listFilesFromGitHub({
            token,
            owner: settings.owner,
            repo: settings.repo,
            branch: settings.branch || "main",
            path: settings.savePath || "drawings/",
          })
            .then((files) => sendResponse({ ok: true, files }))
            .catch((err) => sendResponse({ error: err.message }));
        });
    });
    return true;
  }

  if (msg.type === "LOAD_FILE") {
    chrome.storage.local.get("token").then(({ token }) => {
      if (!token) {
        sendResponse({ error: "Not authenticated" });
        return;
      }

      chrome.storage.sync.get(["owner", "repo", "branch"]).then((settings) => {
        loadFileFromGitHub({
          token,
          owner: settings.owner,
          repo: settings.repo,
          path: msg.path,
          branch: settings.branch || "main",
        })
          .then((scene) => sendResponse({ ok: true, scene }))
          .catch((err) => sendResponse({ error: err.message }));
      });
    });
    return true;
  }

  if (msg.type === "DELETE_FILE") {
    chrome.storage.local.get("token").then(({ token }) => {
      if (!token) {
        sendResponse({ error: "Not authenticated" });
        return;
      }

      chrome.storage.sync.get(["owner", "repo", "branch"]).then((settings) => {
        deleteFileFromGitHub({
          token,
          owner: settings.owner,
          repo: settings.repo,
          branch: settings.branch || "main",
          path: msg.path,
          sha: msg.sha,
        })
          .then((result) => sendResponse({ ok: true, result }))
          .catch((err) => sendResponse({ error: err.message }));
      });
    });
    return true;
  }

  if (msg.type === "OVERWRITE_SCENE") {
    chrome.storage.local.get("token").then(({ token }) => {
      if (!token) {
        sendResponse({ error: "Not authenticated" });
        return;
      }

      const { scene, fileName, settings, existingSha } = msg;
      const jsonStr = JSON.stringify(scene, null, 2);
      const b64 = btoa(unescape(encodeURIComponent(jsonStr)));
      const filePath = `${settings.savePath.replace(/\/$/, "")}/${fileName}`;

      saveToGitHub({
        token,
        owner: settings.owner,
        repo: settings.repo,
        branch: settings.branch,
        path: filePath,
        content: b64,
        message: `excalihub: update ${fileName}`,
        existingSha,
      })
        .then((result) =>
          sendResponse({
            ok: true,
            url: result.content.html_url,
            path: filePath,
          }),
        )
        .catch((err) => sendResponse({ error: err.message }));
    });
    return true;
  }

  if (msg.type === "IMPORT_FILE") {
    chrome.storage.local.get("token").then(({ token }) => {
      if (!token) {
        sendResponse({ error: "Not authenticated" });
        return;
      }

      const { fileName, content, settings } = msg;
      const filePath = `${settings.savePath.replace(/\/$/, "")}/${fileName}`;

      saveToGitHub({
        token,
        owner: settings.owner,
        repo: settings.repo,
        branch: settings.branch,
        path: filePath,
        content,
        message: `excalihub: import ${fileName}`,
      })
        .then((result) =>
          sendResponse({
            ok: true,
            url: result.content.html_url,
            path: filePath,
          }),
        )
        .catch((err) => sendResponse({ error: err.message }));
    });
    return true;
  }

  if (msg.type === "GET_FILE_HISTORY") {
    chrome.storage.local.get("token").then(({ token }) => {
      if (!token) {
        sendResponse({ error: "Not authenticated" });
        return;
      }

      chrome.storage.sync.get(["owner", "repo", "branch"]).then((settings) => {
        const url = `https://api.github.com/repos/${settings.owner}/${settings.repo}/commits?path=${msg.path}&sha=${settings.branch || "main"}&per_page=20`;
        const headers = {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        };

        fetch(url, { headers })
          .then((resp) => resp.json())
          .then((commits) => {
            if (!Array.isArray(commits)) {
              throw new Error("Failed to fetch history");
            }

            const history = commits.map((commit) => ({
              sha: commit.sha,
              date: new Date(commit.commit.author.date).toLocaleString(),
              message: commit.commit.message,
            }));

            sendResponse({ ok: true, commits: history });
          })
          .catch((err) => sendResponse({ error: err.message }));
      });
    });
    return true;
  }

  if (msg.type === "LOAD_FILE_AT_COMMIT") {
    chrome.storage.local.get("token").then(({ token }) => {
      if (!token) {
        sendResponse({ error: "Not authenticated" });
        return;
      }

      chrome.storage.sync.get(["owner", "repo"]).then((settings) => {
        const url = `https://api.github.com/repos/${settings.owner}/${settings.repo}/contents/${msg.path}?ref=${msg.sha}`;
        const headers = {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        };

        fetch(url, { headers })
          .then((resp) => resp.json())
          .then((data) => {
            const content = decodeURIComponent(
              escape(atob(data.content.replace(/\n/g, ""))),
            );
            const scene = JSON.parse(content);
            sendResponse({ ok: true, scene });
          })
          .catch((err) => sendResponse({ error: err.message }));
      });
    });
    return true;
  }

  if (msg.type === "GET_STATISTICS") {
    chrome.storage.local.get("token").then(async ({ token }) => {
      if (!token) {
        sendResponse({ error: "Not authenticated" });
        return;
      }

      try {
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
          stats: {
            totalFiles,
            totalSize,
            averageSize,
            lastSaved,
          },
        });
      } catch (err) {
        sendResponse({ error: err.message });
      }
    });
    return true;
  }

  if (msg.type === "GENERATE_THUMBNAIL") {
    chrome.storage.local.get("token").then(async ({ token }) => {
      if (!token) {
        sendResponse({ error: "Not authenticated" });
        return;
      }

      try {
        chrome.storage.sync
          .get(["owner", "repo", "branch"])
          .then(async (settings) => {
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
            const content = decodeURIComponent(
              escape(atob(data.content.replace(/\n/g, ""))),
            );
            const scene = JSON.parse(content);

            // Generate thumbnail
            const thumbnail = await generateThumbnail(scene);

            // Cache thumbnail in storage
            try {
              const { thumbnails = {} } =
                await chrome.storage.local.get("thumbnails");
              thumbnails[msg.path] = {
                data: thumbnail,
                timestamp: Date.now(),
              };
              await chrome.storage.local.set({ thumbnails });
            } catch (err) {
              console.error("Failed to cache thumbnail:", err);
            }

            sendResponse({ ok: true, thumbnail, scene });
          });
      } catch (err) {
        sendResponse({ error: err.message });
      }
    });
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

let autoSaveTimer = null;

async function setupAutoSave() {
  // Clear existing timer
  if (autoSaveTimer) {
    clearInterval(autoSaveTimer);
    autoSaveTimer = null;
  }

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

  const intervalMs = (settings.autoSaveInterval || 5) * 60 * 1000; // Convert minutes to ms

  autoSaveTimer = setInterval(async () => {
    try {
      // Get token
      const { token } = await chrome.storage.local.get("token");
      if (!token) return;

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
  }, intervalMs);
}

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

// Handle UPDATE_AUTOSAVE message
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "UPDATE_AUTOSAVE") {
    setupAutoSave();
    sendResponse({ ok: true });
    return true;
  }
});

// Setup auto-save on service worker startup
setupAutoSave();

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
        const aiApiKey = msg.apiKey || (await chrome.storage.sync.get("aiApiKey")).aiApiKey;
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
        const aiApiKey = msg.apiKey || (await chrome.storage.sync.get("aiApiKey")).aiApiKey;
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
