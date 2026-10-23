# Ezhamkulam Devi Temple — Vazhipadu Thookkam Management (GitHub Pages Trial)

A dependency-free static website prototype for registering Thookakarans and Vazhipadukarans and building a three-entry-per-Valayam Thookkam chart based on the supplied 2026 reference PDF.

## What this trial includes

- **Register Thookakaran:** manually assigned registration number, name and address; edit and delete safeguards.
- **Add Vazhipadukaran:** manually assigned registration number, name and address, Kuttiye Eduth checkbox, multiple registered Thookakaran associations, and manually typed Thookakarans with names/addresses.
- **Chart builder:** add Valayam boxes numbered up to 196; each Valayam has exactly three entry positions and one shared Muri dropdown. The dropdown includes the ten Malayalam Muri labels transcribed from the visible 2026 reference pages. Each slot accepts a registered Vazhipadukaran number and retrieves the stored person and associated Thookakaran details. `ഒറ്റ` is the default quantity value.
- **Print / Save as PDF:** landscape A4 layout with the six Malayalam chart headings, three Valayams per printed page, Muri and Valayam number shared over three rows, and a grouped Kuttiye Eduth cell.
- **Save-file workflow:** the landing screen requires a JSON save file before the registers open. On first use, choose **Create a new empty database**; the site downloads a starter file and opens that empty session. After edits, download the latest save file. On the next visit, upload that latest file to continue.
- **No server/database:** records are held in the active browser tab's memory only. They are not sent to a server and are lost from that session if the page is closed or refreshed before downloading the save file.

## Run locally in VS Code on Windows

### Option A: VS Code Live Server

1. Extract this ZIP to a folder.
2. Open that folder in VS Code (`File` → `Open Folder`).
3. Install the **Live Server** extension if needed.
4. Right-click `index.html` and choose **Open with Live Server**.
5. The page opens in your browser. First, create a new empty database or upload a prior `.json` save file.

### Option B: Python's local web server

1. Open the extracted project folder in VS Code.
2. Open **Terminal → New Terminal**.
3. Run:

   ```powershell
   py -m http.server 8080
   ```

4. Visit `http://localhost:8080` in the browser.
5. To stop the server, press `Ctrl+C` in the terminal.

No `npm install` or build step is required.

## Publish to GitHub Pages

1. Create a new GitHub repository, for example `ezhamkulam-thookkam-trial`.
2. Extract this ZIP and upload the **contents** of this folder to the repository root. Make sure `index.html`, `styles.css`, `app.js`, `.nojekyll`, and `README.md` are at the root (not inside an extra nested folder).
3. Open repository **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Choose branch `main` and folder `/(root)`, then save.
6. Wait for GitHub Pages to publish the site. Open the URL it shows in Settings → Pages.

The site is static, so the same files work locally and on GitHub Pages.

## Saving and restoring records

1. On the first visit, press **Create a new empty database**. A starter `.json` save file downloads.
2. Add and edit records and chart boxes.
3. Press **Download save** whenever changes should be kept. Use the newly downloaded file as the latest backup.
4. On the next visit or on another computer, upload that latest `.json` file at the landing screen.

**Important:** the save file may contain personal names and addresses. Keep backups somewhere private. Do not commit save files to a public GitHub repository or upload them to a public file-sharing service.


## Suggested trial checklist

- [ ] Create the first empty database and keep the downloaded JSON file.
- [ ] Add two Thookakarans with distinct registration numbers.
- [ ] Add one Vazhipadukaran; select both registered Thookakarans and add a separate manually typed Thookakaran.
- [ ] Tick Kuttiye Eduth on one Vazhipadukaran and leave it unticked on another.
- [ ] Add Valayam 1, choose a Muri, and enter one Vazhipadukaran registration number. Confirm the six-column preview fills in as you type.
- [ ] Enter up to three records in the same box and confirm the Muri remains shared by all three rows.
- [ ] Use **Print / Save as PDF** and inspect the landscape output and Malayalam text before using it for real records.
- [ ] Download the database, refresh the page, upload the saved JSON, and confirm the records and chart return.
- [ ] Try a duplicate registration number and an unknown chart registration number; both should be flagged.

## Trial limitations and verification notes

- This is a prototype for workflow testing, not a certified temple record system.
- The Muri names are transcribed from the visible Muri labels in the supplied 2026 chart. Have a temple representative verify the Malayalam spellings before using it for real records.
- For the print output, the grouped Kuttiye Eduth cell displays `അതെ` when any of that Valayam's three registered Vazhipadukaran records has its checkbox selected; otherwise it remains blank, to resemble the reference chart's presentation. Confirm this grouping rule with the temple before operational use.
- A chart starts empty; add the Valayam boxes you need. The app supports Valayam numbers 1–196 and maintains number gaps if a box is removed.
- Since this trial deliberately requires upload/download, there is no automatic persistent browser database, account system, cloud sync, multi-user conflict handling, or server-side backup.
- No save file is bundled with the site to avoid publishing real personal data.
