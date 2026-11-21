# gzylz_collection

A small, responsive catalogue for browsing a musical-theatre recording collection.

## Current structure

- `index.html` — Home, search, counts, Audio/Video browsing, and selection tray.
- `css/style.css` — Responsive visual layout.
- `js/app.js` — Rendering, filters, expansion, and copy-selection behavior.
- `js/data.js` — Reads and parses the published Google Docs page.
- `js/config.js` — Published Google Docs source URL.

The catalogue data is **not copied into this repository**. The site attempts to fetch the published Google Docs page when it loads or when Refresh is pressed.

## Publish with GitHub Pages

In the repository, open **Settings → Pages**, choose **Deploy from a branch**, select **main** and **/(root)**, then save. GitHub will show the published site URL in that section.

## Data-source note

The source is a published Google Docs document. For automatic updates, open the original document's **File → Share → Publish to web → Published content & settings** and make sure **Automatically republish when changes are made** is enabled. Google notes that published changes can take a few minutes to appear.

The browser may block a direct cross-origin fetch from Google Docs (CORS). If that happens, the site will show a source-loading error instead of silently showing stale data. The next step will be a small Google Apps Script JSONP endpoint; it can be added without copying the collection into GitHub or setting up scheduled GitHub Actions.
