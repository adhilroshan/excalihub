// options.js

async function loadSettings() {
  const s = await chrome.storage.sync.get(["owner", "repo", "branch", "savePath"]);
  if (s.owner)    document.getElementById("owner").value    = s.owner;
  if (s.repo)     document.getElementById("repo").value     = s.repo;
  if (s.branch)   document.getElementById("branch").value   = s.branch;
  if (s.savePath) document.getElementById("savePath").value = s.savePath;
}

async function loadAuth() {
  const { authenticated, user } = await chrome.runtime.sendMessage({ type: "GET_AUTH_STATUS" });
  const authedView   = document.getElementById("authed-view");
  const unauthedView = document.getElementById("unauthed-view");
  const pendingView  = document.getElementById("pending-view");

  pendingView.style.display  = "none";

  if (authenticated && user) {
    document.getElementById("opt-avatar").src = user.avatar_url;
    document.getElementById("opt-login").textContent = `@${user.login}`;
    authedView.style.display  = "flex";
    unauthedView.style.display = "none";
  } else {
    authedView.style.display  = "none";
    unauthedView.style.display = "block";
  }
}

function showStatus(msg, type) {
  const el = document.getElementById("save-status");
  el.textContent = msg;
  el.className = `status show ${type}`;
  setTimeout(() => el.classList.remove("show"), 3000);
}

document.getElementById("btn-save-settings").addEventListener("click", async () => {
  const owner    = document.getElementById("owner").value.trim();
  const repo     = document.getElementById("repo").value.trim();
  const branch   = document.getElementById("branch").value.trim() || "main";
  const savePath = document.getElementById("savePath").value.trim() || "drawings/";

  if (!owner || !repo) {
    showStatus("Owner and repository are required.", "error");
    return;
  }

  await chrome.storage.sync.set({ owner, repo, branch, savePath });
  showStatus("Settings saved!", "success");
});

document.getElementById("btn-connect-opt").addEventListener("click", async () => {
  const btn          = document.getElementById("btn-connect-opt");
  const unauthedView = document.getElementById("unauthed-view");
  const pendingView  = document.getElementById("pending-view");

  btn.disabled = true;
  btn.textContent = "Connecting…";

  chrome.runtime.sendMessage({ type: "START_AUTH" }, (response) => {
    if (chrome.runtime.lastError || response?.error) {
      btn.disabled = false;
      btn.textContent = "Connect GitHub";
      showStatus(response?.error || "Auth failed. Check your OAuth App settings.", "error");
      return;
    }

    // Show the code immediately
    if (response?.user_code) {
      document.getElementById("opt-user-code").textContent = response.user_code;
    }
    unauthedView.style.display = "none";
    pendingView.style.display  = "block";

    // Poll storage until token appears
    const check = setInterval(async () => {
      const { authenticated } = await chrome.runtime.sendMessage({ type: "GET_AUTH_STATUS" });
      if (authenticated) {
        clearInterval(check);
        btn.disabled = false;
        btn.textContent = "Connect GitHub";
        loadAuth();
      }
    }, 2000);
  });
});

document.getElementById("btn-signout").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "SIGN_OUT" });
  loadAuth();
});

// Init
loadSettings();
loadAuth();
