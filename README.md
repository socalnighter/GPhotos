# GPhotos Backup

A Chrome extension that backs up your **Google Photos** library to a folder on your computer or an external drive, in original quality, sorted the way you like: by year, month, camera, or any pattern you design.

<p align="center">
  <img src="store/screenshot-1-setup-1280x800.png" alt="GPhotos Backup setup screen" width="720">
</p>

> **Not affiliated with Google.** This is an independent, open-source project. "Google Photos" is a trademark of Google LLC.

## Why this exists

Getting a large photo library out of Google Photos is awkward. Takeout produces huge zip files with separate metadata files, and Google closed its Photos API to full-library access in 2025, so most backup tools no longer work. This extension takes a different route: it works through the Google Photos web page you are already signed in to, downloads each original file, and saves it straight into a folder you choose, already organized.

## Features

- **Original quality.** Downloads the full-size original of every photo, not a thumbnail.
- **Any destination.** Back up to a folder on your computer, an external hard drive, or a USB stick.
- **Your own folder structure.** Pick a preset (year / month, quarter, decade, camera, photos vs. videos, and more) or write your own pattern. A live preview shows exactly where a file will land.
- **Custom file names.** Keep original names or add the date and camera to the front.
- **Pause and resume.** Hold a long backup and continue later without starting over.
- **Safe to interrupt.** If you stop, close the window, or lose power, run it again: everything already saved is skipped.
- **Fast.** Downloads several files in parallel (configurable) and shows live speed, so you can see whether the network or the destination drive is the bottleneck.
- **Stays awake.** Keeps the screen on during a backup so the computer doesn't lock mid-run.
- **Private by design.** Everything happens inside your browser. Nothing is sent to any server. See [PRIVACY.md](PRIVACY.md).

## Install

### From the Chrome Web Store

Coming soon. (Link will be added here once the listing is live.)

### From source (developer mode)

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the `extension` folder from this repo.
5. Pin the extension from the puzzle-piece menu so its icon is always visible.

Requires Chrome 110 or newer. Other Chromium-based browsers (Edge, Brave) should work but are untested.

## How to use

1. **Create a destination folder.** Make an empty folder where the backup should go, for example `PhotosBackup`. It can be on your computer or on an external drive. Chrome does not allow selecting the top level of a drive, so create a folder inside it.
2. **Open Google Photos.** Go to [photos.google.com](https://photos.google.com) in a normal browser window, sign in, and stay on the main Photos view. Keep this window visible while the backup runs.
3. **Click the extension icon.** A small control window opens beside your browser.
4. **Choose the backup folder**, pick how you want things organized, and press **Start backup**.
5. The extension scrolls through your library for you and saves each file as it goes. The status line shows progress, speed, and a "Page check" line showing what it can see on the Photos page.

Leave both windows open until it says **Finished**.

## Organizing your backup

Choose a preset from the **Folder structure** list, or type your own pattern. Patterns are made of plain text and `{tokens}`. Use `/` to create a new folder level.

### Folder presets

| Preset | Pattern | Result |
|---|---|---|
| Year / Month name (default) | `{YYYY}/{MM} - {MMMM}` | `2023/07 - July/` |
| Year / Month number | `{YYYY}/{MM}` | `2023/07/` |
| Year only | `{YYYY}` | `2023/` |
| Year-Month in one folder | `{YYYY}-{MM}` | `2023-07/` |
| Year / Quarter | `{YYYY}/Q{Q}` | `2023/Q3/` |
| Year / Month / Day | `{YYYY}/{MM}/{DD}` | `2023/07/14/` |
| Decade / Year | `{decade}/{YYYY}` | `2020s/2023/` |
| Photos or Videos first | `{type}/{YYYY}/{MM} - {MMMM}` | `Photos/2023/07 - July/` |
| Camera / Year | `{camera}/{YYYY}` | `Pixel 7 Pro/2023/` |
| Year / Camera | `{YYYY}/{camera}` | `2023/Pixel 7 Pro/` |
| One flat folder | *(empty)* | everything in the backup folder |

### Tokens

| Token | Meaning | Example |
|---|---|---|
| `{YYYY}` | 4-digit year | `2023` |
| `{YY}` | 2-digit year | `23` |
| `{MM}` | month number | `07` |
| `{MMM}` | short month name | `Jul` |
| `{MMMM}` | full month name | `July` |
| `{DD}` | day of the month | `14` |
| `{Q}` | quarter of the year (1 to 4) | `3` |
| `{decade}` | decade | `2020s` |
| `{type}` | `Photos` or `Videos` | `Photos` |
| `{camera}` | camera or phone model from the photo's EXIF data | `Pixel 7 Pro` |
| `{name}` | original file name without extension (file pattern only) | `IMG_1234` |
| `{ext}` | file extension (file pattern only) | `jpg` |

### File name patterns

| Pattern | Result |
|---|---|
| `{name}` (default) | `IMG_1234.jpg` |
| `{YYYY}-{MM}-{DD}_{name}` | `2023-07-14_IMG_1234.jpg` |
| `{YYYY}-{MM}-{DD}_{camera}_{name}` | `2023-07-14_Pixel 7 Pro_IMG_1234.jpg` |

The real file extension is always kept, even if your pattern leaves it out.

### Good to know

- **Where the date comes from.** The extension reads the date the photo was taken from the file's EXIF data. If that is missing (screenshots, some videos, messaging-app images), it falls back to the date Google Photos shows for the item.
- **Photos with no usable date** go into an `Unknown date` folder when your folder pattern uses a date token.
- **Missing camera information** is filed under `Unknown camera`.
- **Name clashes.** If two different photos would get the same name in the same folder, the second becomes `name (1).jpg`. Nothing is overwritten.
- **Illegal characters** (`\ / : * ? " < > |`) are replaced with `_`, and `..` path tricks are ignored.
- Your last-used settings are remembered.

## Pause, resume, and stop

- **Pause** stops new downloads and holds the scroll position. Files already in progress finish first. Press **Resume** to continue exactly where you left off.
- **Stop** ends the run. Start again later and everything already in the folder is skipped.
- A hidden file named `.photos-backup-index.json` in your backup folder records what has been saved. Leave it in place if you want to resume or top up the backup later. Delete it to force a full re-check.

## Tips

- **Keep the Photos window visible.** Chrome pauses scripts and loading in hidden tabs. Put the control window beside the Photos window rather than on top of it.
- **If it feels slow,** raise *Parallel downloads* a few at a time and watch the live MB/s figure. The status line also tells you whether the network or the destination drive is the slow part.
- **Slow USB stick?** Back up to a folder on your computer's own drive first, then copy the finished folder to the stick in one go. One big copy is much faster than thousands of small writes.
- **Closing a laptop lid** or locking the computer by hand will still pause the backup. The extension only prevents automatic screen-off and sleep.

## Troubleshooting

| Symptom | What to try |
|---|---|
| "Found" stays at 0 | Look at the **Page check** line. `0 photo links` means you are not on the main Photos view, so click *Photos* in Google's left sidebar. Links but no thumbnails usually means Google changed its page layout; please open an issue. |
| Scrolling stops partway | Make sure the Photos window is visible and not covered. Chrome pauses hidden tabs. |
| Chrome won't accept my folder | Pick a folder *inside* the drive rather than the drive itself. |
| Files show a resolution of "72 x 72" | That is DPI metadata, not pixel size. Check **Dimensions** in your file viewer; the pixel size is the original. |
| Many photos land in `Unknown date` | They have no EXIF date and Google's on-page date was not in a format the extension understands (non-English interfaces can cause this). |
| Some videos are missing or short | Video download is best-effort. Try again, or use Google Takeout for videos. |

## How it works

1. A content script on `photos.google.com` scrolls the library and notes each photo's thumbnail address and label.
2. It converts each thumbnail address into the download address for the original file and sends it to the control window.
3. The control window downloads the original, reads its EXIF data for the date and camera, builds the folder and file name from your patterns, and writes it into the folder you chose using the browser's [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API).

No account credentials are read or stored; the extension simply uses the session you are already signed in with.

## Permissions

| Permission | Why it is needed |
|---|---|
| `photos.google.com` | To read the list of photos on the page you have open. |
| `*.googleusercontent.com`, `*.usercontent.google.com` | To download the original files from Google's image servers. |
| `scripting` | To attach to a Photos tab that was already open before the extension was installed. |
| `power` | To keep the screen awake while a backup is running. |

## Limitations

- Albums, captions, descriptions, locations stored only in Google's database, and edit history are **not** saved. You get the original files.
- This relies on the current structure of the Google Photos website. If Google changes it, the extension may need an update.
- Very large libraries take a long time. Use Pause and Resume freely.
- Dates from the on-page fallback work best with English-language interfaces.

## Disclaimer

This extension automates the Google Photos web page in your own browser, using your own signed-in session, to save your own photos. It is not endorsed by or affiliated with Google. Automated access to a service may be restricted by that service's terms, so use it at your own discretion and keep the pace modest. If you want Google's official export, use [Google Takeout](https://takeout.google.com).

## Development

```
extension/        the Chrome extension (load this folder in developer mode)
  manifest.json
  background.js   opens the control window, keeps the screen awake
  content.js      runs on photos.google.com, scrolls and finds photos
  backup.html/js  the control window: settings, downloading, saving
  template.js     folder and file name patterns
  exif.js         reads photo date and camera from EXIF
tests/            unit tests for the pattern and date logic
store/            Chrome Web Store listing text and images
```

Run the tests (no dependencies, just Node):

```
node tests/run-tests.js
```

Build the zip for the Chrome Web Store:

```
./package.sh
```

## Contributing

Issues and pull requests are welcome. If something stops working, please include the text of the **Page check** line and the log from the control window.

## License

[MIT](LICENSE)
