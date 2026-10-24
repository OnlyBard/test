# Ezhamkulam Devi Temple — Vazhipadu Thookkam Management (Trial)

A dependency-free static website trial for testing the temple's registration, manual Narukideel entry, guided Valayam grouping, and six-column chart workflow. It runs in a browser and can be hosted on GitHub Pages.

> **Trial only:** the grouping assistant is deterministic JavaScript logic, not a hosted/large-language-model AI. Its current sequence and fallback assumptions are encoded from the discussion and the supplied 2026 chart, and must be reviewed by temple organizers before using the output for real allocation. It never reads photos or uploaded Narukideel documents; the user types the result manually in this version.

## QA status

The current trial has a focused automated QA report covering its end-to-end workflow, registration forms, Narukideel allocation, save-file validation, chart/print guards, responsive layouts, and a 196-Valayam synthetic stress test. Read [`QA_REPORT.md`](QA_REPORT.md) for exact pass counts and limitations. No uninterrupted 30-minute soak test is claimed.

## Included screens

- **Register Thookakaran** — manually assign a unique registration number, name and address.
- **Add Vazhipadukaran** — manually assign a unique registration number, name and address; select one of the ten Muris; set the person's total Thookams (1, 2 or 3); choose the Kuttiye Eduth checkbox for the specific Thookam (at most one per person); associate multiple registered Thookakarans; add a new Thookakaran inline; or type Thookakaran details manually.
- **Narukideel Result** — select a Muri and type the drawn Narukideel number beside each registered Vazhipadukaran in that Muri. Each Muri's result is saved separately. Numbers must be positive integers and unique within that Muri. If no entries have been used in a confirmed Valayam, an entire Muri result can be cleared by blanking all drawn numbers and saving; used results cannot be silently changed. A person’s Muri or Thookam count is locked while they have a saved Narukideel result or chart allocation, protecting the allocation from stale data. If the registered record is corrected before it is used, pending AI proposals are invalidated and must be regenerated.
- **AI Valayam Assistant** — proposes one Valayam at a time, using available typed Narukideel numbers and registered Thookam counts. It looks for a valid group totaling exactly three Thookams, tries the current Muri first and then the chosen supplementary Muri within the same Karapuram. The user must review and individually confirm each Valayam before it enters the chart. Confirmed entries are tracked to prevent reusing the same result entry.
- **Chart** — shows the six traditional columns in a live preview, supports manual edits by Vazhipadukaran registration number, automatically fills the എണ്ണം quantity from the person’s registered Thookam count, rejects duplicate people and any filled Valayam that does not total exactly three Thookams, and prints / saves as PDF in a landscape layout. Empty or incomplete boxes must be completed or removed before printing. A Valayam may contain entries from more than one Muri. The Muri cell is derived from all linked entries. The checkbox is stored on the register record; the print cell uses the original-style `അതെ` / blank presentation.
- **Save-file workflow** — the first-time setup creates a new empty database and downloads a starter JSON. On future visits, upload your latest JSON save file before accessing any records. Download a fresh save file after each set of changes.

## Muri and Karapuram order used in the trial

**Thekke Karapuram**
1. ഏഴംകുളം തെക്ക്
2. അറുകാലിക്കൽ കിഴക്ക്
3. നെടുമൺ
4. പറക്കോട് വടക്ക്
5. മങ്ങാട്

**Vadakke Karapuram**
1. ഏഴംകുളം വടക്ക്
2. അറുകാലിക്കൽ പടിഞ്ഞാറ്
3. പറക്കോട് തെക്ക്
4. പറക്കോട് ഇടയിൽ
5. ചെറുകുന്നത്ത്

The numbered ten-Muri slot cycle represented in the chart/assistant is:

1. ഏഴംകുളം തെക്ക് · 2. ഏഴംകുളം വടക്ക് · 3. അറുകാലിക്കൽ കിഴക്ക് · 4. അറുകാലിക്കൽ പടിഞ്ഞാറ് · 5. നെടുമൺ · 6. പറക്കോട് തെക്ക് · 7. പറക്കോട് വടക്ക് · 8. പറക്കോട് ഇടയിൽ · 9. മങ്ങാട് · 10. ചെറുകുന്നത്ത്

The trial treats a Valayam as three total Thookams: one person with three, a two-Thookam entry plus a one-Thookam entry, or three single-Thookam entries. If a scheduled Muri is exhausted, the assistant may suggest the next available Muri in that same Karapuram. The precise real-world rotation and any special exceptions should be verified with temple organizers. This trial does not claim that its algorithm is an officially validated Narukideel rule.

## Run locally in VS Code on Windows

### Option A — Python local server

1. Download and extract this ZIP to a folder.
2. Open the **extracted folder** in VS Code.
3. Select **Terminal → New Terminal**.
4. Run:

   ```powershell
   py -m http.server 8080
   ```

5. Open `http://localhost:8080` in your browser.
6. For first-time setup, choose **Create a new empty database**. It downloads a starter `.json` file and opens an empty session.
7. After adding or changing records, use **Download save** to keep the latest database. On your next visit, upload that file at the start screen.
8. To stop the server, press `Ctrl+C` in the terminal.

No `npm install`, build step, or server database is required. VS Code's Live Server extension can also be used by opening `index.html` with Live Server.

## Publish to GitHub Pages

1. Create a **private** GitHub repository if you plan to keep working files there. Do not commit personal save files; use a public repo only for the empty website source.
2. Extract the ZIP and upload its contents to the repository root. `index.html`, `app.js`, `styles.css`, `.nojekyll`, and `README.md` should be at the root, not inside an extra nested folder.
3. Open repository **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Choose branch `main` and folder `/(root)`, then save.
6. Open the URL shown in Settings → Pages after deployment completes.

## Suggested test run

1. Create a new empty database and keep the downloaded starter JSON.
2. Register at least three Vazhipadukarans in one Muri, each with one Thookam.
3. In **Narukideel Result**, select that Muri and enter drawn numbers `3`, `1`, and `2` for the three people. Save the result.
4. Open **AI Valayam**, generate a proposal, check that the three people are grouped into one Valayam totaling three Thookams, then confirm it.
5. Open **Chart** and verify that the confirmed Valayam is present. Download a save file.
6. Test carry-forward: register a two-Thookam person and a one-Thookam person in different Muris of the same Karapuram, enter their drawn numbers for their respective Muris, and check that the assistant can propose the 2 + 1 combination with a mixed-Muri chart cell.
7. Switch back to the start screen or refresh, upload the saved JSON and verify the records and confirmed chart still exist.
8. Try a duplicate registration number, a duplicate drawn number within one Muri, and a missing Vazhipadukaran registration number; the app should show validation messages.

## Data and privacy limitations

- Data is held in the active browser session until you download the save file. Closing or refreshing the page before saving can lose unsaved changes.
- The JSON file contains names, addresses, registration details, Narukideel results and chart assignments. Store it privately; do not commit it to a public GitHub repository.
- This is not a multi-user/cloud database and has no server-side backup, login, or simultaneous editing.
- The app does not connect to an external AI service and does not upload data anywhere. Its “AI” feature is a prototype grouping assistant based on the entered result and coded constraints.
- The ten Muri names and the visible chart structure were transcribed from the supplied 2026 PDF. Have a temple representative verify spellings, the printed Kuttiye Eduth grouping rule, and all Karapuram/numbering edge cases before operational use.
