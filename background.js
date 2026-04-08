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
