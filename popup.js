const button = document.getElementById("download");
const cancel = document.getElementById("cancel");
const progress = document.getElementById("progress");
const status = document.getElementById("status");

let activeTabUrl = null;

const BOARD_REGEX =
  /^https:\/\/www\.pinterest\.com\/(?!pin\/)[^/]+\/[^/]+\/?$/;

/**
 * UI helpers
 */
function showIdle() {
  button.hidden = false;
  button.disabled = false;
  cancel.hidden = true;
  progress.hidden = true;
  status.hidden = true;
}

function showNotOnBoard() {
  button.hidden = true;
  cancel.hidden = true;
  progress.hidden = true;
  status.hidden = false;
  status.textContent = "Navigate to a board to download";
}

function showStarting() {
  button.hidden = true;
  cancel.hidden = false;
  cancel.disabled = false;
  progress.hidden = false;
  progress.value = 0;
  status.hidden = false;
  status.textContent = "Starting…";
}

function showProgress(completed, total) {
  button.hidden = true;
  cancel.hidden = false;
  cancel.disabled = false;
  progress.hidden = false;
  progress.max = total;
  progress.value = completed;
  status.hidden = false;
  status.textContent = `Downloaded ${completed} of ${total}`;
}

function showComplete() {
  button.hidden = true;
  cancel.hidden = true;
  progress.hidden = true;
  status.hidden = false;
  status.textContent = "✅ Download complete";
}

function showCanceled() {
  button.hidden = false;
  cancel.hidden = true;
  progress.hidden = true;
  status.hidden = false;
  status.textContent = "⛔ Download canceled";
}

function showError(message) {
  button.hidden = false;
  cancel.hidden = true;
  progress.hidden = true;
  status.hidden = false;
  status.textContent = `❌ Error: ${message}`;
}

/**
 * Initialize popup state
 */
(async function init() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  activeTabUrl = tab.url;

  if (!BOARD_REGEX.test(activeTabUrl)) {
    showNotOnBoard();
    return;
  }

  // Ask background for current state
  let response;
  try {
    response = await chrome.runtime.sendMessage({
      type: "POPUP_READY"
    });
  } catch {
    showIdle();
    return;
  }

  if (!response || !response.downloading) {
    showIdle();
    return;
  }

  const state = response.state;

  switch (state.status) {
    case "downloading":
      showProgress(state.completed ?? 0, state.total ?? 0);
      break;

    case "complete":
      showComplete();
      break;

    case "canceled":
      showCanceled();
      break;

    case "error":
      showError(state.error || "Unknown error");
      break;

    default:
      showIdle();
  }
})();

/**
 * Start download
 */
button.addEventListener("click", () => {
  showStarting();

  chrome.runtime.sendMessage({
    type: "START_BOARD_DOWNLOAD",
    boardUrl: activeTabUrl
  });
});

/**
 * Cancel download
 */
cancel.addEventListener("click", () => {
  cancel.disabled = true;
  status.textContent = "Canceling…";

  chrome.runtime.sendMessage({
    type: "CANCEL_BOARD_DOWNLOAD"
  });
});

/**
 * Optional live updates while popup is open
 * (safe to ignore if popup closes)
 */
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "DOWNLOAD_PROGRESS") {
    showProgress(message.completed, message.total);
  }

  if (message.type === "DOWNLOAD_COMPLETE") {
    showComplete();
  }

  if (message.type === "DOWNLOAD_CANCELED") {
    showCanceled();
  }

  if (message.type === "DOWNLOAD_ERROR") {
    showError(message.message);
  }
});
