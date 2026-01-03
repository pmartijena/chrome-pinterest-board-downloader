# 📌 Pinterest Board Image Downloader

A lightweight **Chrome Extension (Manifest V3)** that lets you download **all images from a Pinterest board** with one click.

The extension detects when you’re viewing a board, fetches the board’s pins via Pinterest’s internal APIs, and downloads the highest-resolution image available for each pin—skipping videos and unsupported formats.

---

## ✨ Features

* 📥 **One-click board download**
* 🖼️ Downloads **largest available image variant**
* 🏷️ Smart filenames from pin descriptions / alt text
* ⏸️ **Cancelable downloads**
* 📊 Live progress tracking in popup
* 🧠 Graceful handling if popup is closed mid-download
* 🧩 Built with **Manifest V3 service worker**

---

## 📂 Project Structure

```
.
├── background.js     # Service worker: handles Pinterest API + downloads
├── popup.html        # Extension popup UI
├── popup.js          # Popup logic + UI state
├── manifest.json     # Chrome extension manifest (MV3)
├── icons/            # Extension icons
```

---

## 🧠 How It Works

### 1. Popup UI

* Appears when clicking the extension icon
* Validates that the active tab is a Pinterest **board** (not a pin)
* Displays progress, completion, cancellation, or errors

### 2. Background Service Worker

* Listens for popup messages:

  * `START_BOARD_DOWNLOAD`
  * `CANCEL_BOARD_DOWNLOAD`
  * `POPUP_READY`
* Fetches:

  1. **Board ID** using `BoardResource/get`
  2. **Pins** using `BoardFeedResource/get`
* Selects the **largest JPEG/PNG** image per pin
* Downloads images sequentially with randomized delays

### 3. Download Flow

```
Popup → Background
      → Fetch board ID
      → Fetch pins
      → Download images
      → Send progress updates
```

---

## 📄 Filename Strategy

Downloaded images are named using:

1. Pin `description` (preferred)
2. Pin `auto_alt_text` (fallback)
3. `pin-{id}` if no usable text exists

The filename is:

* Hashtags removed
* Illegal filesystem characters stripped
* Trimmed to 250 characters

Images are saved under:

```
Downloads/
└── pinterest-downloader/
    ├── image-name.jpg
```

---

## 🚫 What It Skips

* 🎥 Video pins
* ❌ Non-JPG / PNG formats
* 🔒 Boards that Pinterest blocks from your session

---

## 🛠️ Installation (Developer Mode)

1. Clone this repo:

   ```bash
   git clone https://github.com/yourusername/pinterest-board-downloader.git
   ```
2. Open Chrome and go to:

   ```
   chrome://extensions
   ```
3. Enable **Developer mode**
4. Click **Load unpacked**
5. Select the project folder

---

## ⚠️ Notes & Limitations

* Requires being **logged into Pinterest**
* Uses Pinterest’s internal APIs (may break if endpoints change)
* Designed for **personal use**
* Includes random delays to reduce request bursts

---

## 🧩 Permissions Explained

| Permission                    | Reason                 |
| ----------------------------- | ---------------------- |
| `tabs`                        | Read current tab URL   |
| `downloads`                   | Save images to disk    |
| `https://www.pinterest.com/*` | Fetch board & pin data |

---

## 📜 License

GNU GENERAL PUBLIC LICENSE
Use responsibly. Respect Pinterest’s Terms of Service and content ownership.
