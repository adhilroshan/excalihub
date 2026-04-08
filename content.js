// content.js
// Injected into excalidraw.com — extracts scene data from localStorage

function getExcalidrawScene() {
  try {
    const elementsRaw = localStorage.getItem("excalidraw");
    const stateRaw    = localStorage.getItem("excalidraw-state");
    const filesRaw    = localStorage.getItem("excalidraw-files");

    const elements = elementsRaw ? JSON.parse(elementsRaw) : [];
    if (!elements || elements.length === 0) {
      return { error: "Canvas is empty — nothing to save." };
    }

    const appState = stateRaw ? JSON.parse(stateRaw) : {};
    const files    = filesRaw ? JSON.parse(filesRaw) : {};

    // Derive a title from the first text element, fallback to "untitled"
    const firstText = elements.find(
      (el) => el.type === "text" && el.text?.trim()
    );
    const title = firstText
      ? firstText.text.trim().slice(0, 40).replace(/[^a-z0-9_\-\s]/gi, "").trim().replace(/\s+/g, "_")
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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "GET_SCENE") {
    sendResponse(getExcalidrawScene());
  }
});
