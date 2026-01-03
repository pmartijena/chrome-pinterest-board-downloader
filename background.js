const PWS_HANDLER = "www/[username]/[slug].js";

let session = null;


function safeSend(message) {
  chrome.runtime.sendMessage(message).catch(() => {
    // Popup not open — ignore
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Popup handshake
  if (message.type === "POPUP_READY") {
    sendResponse({
      downloading: !!session,
      state: session || null
    });

    return true; // keep channel open
  }

  // Start download
  if (message.type === "START_BOARD_DOWNLOAD") {
    const { boardUrl } = message;

    session = {
        canceled: false,
        status: "downloading",
        completed: 0,
        total: 0
    };

    downloadBoardImages(boardUrl);
  }

  // Cancel download
  if (message.type === "CANCEL_BOARD_DOWNLOAD") {
    if (session) {
      session.canceled = true;
      session.status = "canceled";
    }
  }
});

function filenameFromPin(pin, fallback = "pinterest-image") {
  if (!pin || typeof pin !== "object") {
    return fallback;
  }

  let sourceText = "";

  // Prefer description if it contains non-whitespace
  if (typeof pin.description === "string" && pin.description.trim()) {
    sourceText = pin.description;
  }
  // Otherwise fall back to auto_alt_text
  else if (typeof pin.auto_alt_text === "string" && pin.auto_alt_text.trim()) {
    sourceText = pin.auto_alt_text;
  } else {
    return fallback;
  }

  let name = sourceText
    // Remove hashtags
    .replace(/#[^\s#]+/g, "")
    // Remove illegal filename characters
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    // Collapse whitespace
    .replace(/\s+/g, " ")
    .trim();

  if (!name) {
    return fallback;
  }

  return name.slice(0, 250);
}

function selectDownloadableImage(pin) {
  if (!pin?.images) return null;

  const allowedExts = [".jpg", ".jpeg", ".png"];

  // Sort image variants by size (largest first)
  const variants = Object.values(pin.images)
    .filter(img => typeof img?.url === "string")
    .sort((a, b) => (b.width * b.height) - (a.width * a.height));

  for (const img of variants) {
    const url = img.url.toLowerCase();

    if (allowedExts.some(ext => url.endsWith(ext))) {
      const ext = allowedExts.find(ext => url.endsWith(ext));
      return { url: img.url, ext };
    }
  }

  return null; // No acceptable format found
}

function buildBoardFeedUrl(sourceUrl, boardId, bookmark) {
  let options = {
        board_id: boardId,
        board_url: sourceUrl,
        page_size: 25,
        field_set_key: "react_grid_pin",
        currentFilter: -1,
        filter_section_pins: true,
        sort: "default",
        layout: "default",
        redux_normalize_feed: true
  };
  if (bookmark) {
    options.bookmarks = [bookmark];
  }

  const params = new URLSearchParams({
    source_url: sourceUrl,
    data: JSON.stringify({
      options,
      context: {}
    }),
    _: Date.now()
  });

  return `https://www.pinterest.com/resource/BoardFeedResource/get/?${params}`;
}

function sleepRandom(maxMs, session) {
  return new Promise((resolve) => {
    const start = Date.now();
    const delay = Math.random() * maxMs;

    const tick = () => {
      if (session.canceled) return resolve();
      if (Date.now() - start >= delay) return resolve();
      setTimeout(tick, 100);
    };

    tick();
  });
}

function parseBoardUrl(boardUrl) {
  const match = boardUrl.match(
    /^https:\/\/www\.pinterest\.com\/([^/]+)\/([^/]+)\/?$/
  );

  if (!match) throw new Error("Invalid Pinterest board URL");

  return {
    username: match[1],
    slug: match[2],
    sourceUrl: `/${match[1]}/${match[2]}/`
  };
}

/**
 * Pinterest API
 */
async function fetchBoardInfo(boardUrl) {
  const { sourceUrl, username, slug } = parseBoardUrl(boardUrl);
  const params = new URLSearchParams({
    source_url: sourceUrl,
    data: JSON.stringify({
      options: {
        field_set_key: "detailed",
        orbac_subject_id: "",
        slug,
        username
      },
      context: {}
    }),
    _: Date.now()
  });

  const res = await fetch(
    "https://www.pinterest.com/resource/BoardResource/get/?" +
      params.toString(),
    {
      credentials: "include",
      headers: {
        "x-pinterest-source-url": sourceUrl,
        "x-pinterest-pws-handler": PWS_HANDLER,
        "x-requested-with": "XMLHttpRequest"
      }
    }
  );

  const json = await res.json();
  const id = json?.resource_response?.data?.id;
  if (!id) {
    throw new Error("Board ID not found");
  }

  const name = json.resource_response?.data?.name || "Pinterest Board";
  return {id, name};
}

async function fetchImageUrlsForBoard(boardUrl, boardId, session, bookmark = null) {
  if (session.canceled) return [];

  const { sourceUrl } = parseBoardUrl(boardUrl);
  const url = buildBoardFeedUrl(sourceUrl, boardId, bookmark);

  const res = await fetch(url, {
    credentials: "include",
    headers: {
      "x-pinterest-source-url": sourceUrl,
      "x-pinterest-pws-handler": PWS_HANDLER,
      "x-requested-with": "XMLHttpRequest"
    }
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch board feed: ${res.status}`);
  }

  const json = await res.json();
  const pins = json.resource_response?.data || [];
  const images = [];
  for (const pin of pins) {
    if (pin.is_video) continue;

    const selected = selectDownloadableImage(pin);
    if (!selected) continue;

    images.push({
        url: selected.url,
        ext: selected.ext,
        filename: filenameFromPin(pin, `pin-${pin.id}`)
    });
  }

  const nextBookmark = json.resource_response?.bookmark;
  if (nextBookmark) {
    return images.concat(await fetchImageUrlsForBoard(boardUrl, boardId, session, nextBookmark));
  }

  return images;
}

async function downloadBoardImages(boardUrl) {
  try {
    const { id, name } = await fetchBoardInfo(boardUrl);
    const images = await fetchImageUrlsForBoard(boardUrl, id, session);

    session.total = images.length;
    session.completed = 0;

    for (const { url, filename } of images) {
      if (session.canceled) {
        safeSend({ type: "DOWNLOAD_CANCELED" });
        session.status = "canceled";
        return;
      }

      await chrome.downloads.download({
        url,
        filename: `${name}/${filename}.jpg`,
        conflictAction: "uniquify"
      });

      session.completed++;

      safeSend({
        type: "DOWNLOAD_PROGRESS",
        completed: session.completed,
        total: session.total
      });

      await sleepRandom(2000, session);
    }

    session.status = "complete";
    safeSend({ type: "DOWNLOAD_COMPLETE" });
  } catch (err) {
    console.error("Download failed:", err);

    session.status = "error";
    session.error = err.message || "Unknown error";

    safeSend({
      type: "DOWNLOAD_ERROR",
      message: session.error
    });
  } finally {
    // Keep session briefly so popup can read final state
    setTimeout(() => session = null, 2000);
  }
}
