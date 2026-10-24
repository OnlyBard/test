# Trial v2 — QA Report

**QA date:** 2026-10-24  
**Project:** Ezhamkulam Devi Temple — Vazhipadu Thookkam Management (static GitHub Pages trial)

## Summary

The current source passed the focused automated test suites listed below. These checks cover application behaviour in a real browser test harness, data integrity, chart output, responsive layouts and a maximum-size synthetic dataset. This is evidence of the tested paths working; it is not a guarantee that every possible user flow is defect-free.

| Suite | Result | Coverage |
|---|---:|---|
| Main end-to-end browser workflow | **32/32 passed** on latest run; core suite repeated multiple times during this QA pass | Starter save, startup gate, registration, duplicate rejection, inline Thookakaran addition, Muri-specific Narukideel entry, 3/1/2 grouping, individual confirmation, chart, print guard, backup restore, 10 fresh-visit/restore cycles, browser errors |
| Karapuram/carry-forward/responsive cases | **20/20 passed** | 2+1 mixed-Muri Valayam, same-Karapuram source-Muri restriction, linked Narukideel lots, cannot change used draw, slot-9 fallback sequence, malformed saves, viewport widths 320–1440 px |
| Registration and form validation | **12/12 passed** | Registered and manually typed Thookakarans, Kuttiye Eduth exclusivity, inline add, XSS-like input rendered as text, duplicate/required-field validation, editing/deletion safety, small viewport |
| Edit/stale-proposal integrity | **8/8 passed** | Block Muri edits while allocation is referenced, clearing unused result, stale pending proposal invalidation |
| Chart validation and printing | **11/11 passed** | Registered count auto-fills എണ്ണം, complete Valayam validation, unknown/duplicate registration rejection, repeat person across Valayams prevention, print blocked for invalid/incomplete chart |
| Save-file import validation | **15/15 passed** | Current and legacy schema, duplicate IDs/numbers, invalid Valayam indices, duplicate draw numbers, Muri mismatch, fractional counts/numbers, missing Thookakaran links, orphan chart rows, reused people/lots, malformed JSON handling |
| Max-size synthetic dataset | **12/12 passed** | 588 registered Vazhipadukaran records, results for all ten Muris, 196 Valayams, all chart rows rendered, 66 print pages, full export and restore in a fresh page |
| Valayam sequence recovery | **2/2 passed** | Reuse the first missing Valayam number after a deletion and preserve ordered chart numbering |

**One-off suite total:** 112 assertions passed across the eight 32/20/12/8/11/15/12/2 suites listed above. This total is a count of assertions in those suite runs; the main end-to-end suite was also repeated, so repeated runs are not included in that total.

## Additional checks

- `node --check app.js` passed.
- `index.html` structure parsed successfully with Python's HTML parser.
- **5,000 deterministic property/random combination cases** were compared against a brute-force reference: 4,257 valid exact combinations, zero false negatives, zero false positives, and zero invalid results.
- The maximum-size fixture imported in roughly 0.23 seconds and rendered its complete 196-Valayam chart in roughly 0.59 seconds in the test environment. Timings vary by machine/browser.
- Browser tests reported no uncaught JavaScript errors or console errors in the paths examined.

## Important scope limits

- **No uninterrupted 30-minute wall-clock soak test was completed.** The QA consisted of repeated end-to-end runs, separate focused suites, 10 fresh-visit restore cycles within the main suite, a 5,000-case property check, and a maximum-size synthetic import/render/export/restore test. Do not interpret this as a claim that the site ran continuously for 30 minutes.
- Print tests instrument the app's call to `window.print()` in the test copy of the page; a person should still check the actual print dialog, browser PDF output, paper scaling, Malayalam glyph rendering and page breaks in Chrome/Edge on the target computer.
- The “AI” is a deterministic JavaScript grouping assistant, not a hosted LLM. The user manually enters Narukideel results; handwritten scans/PDFs are not automatically read in this version.
- Karapuram rotation and carry-forward code is a prototype based on the supplied PDF and details provided in conversation. It has not been formally approved by the temple. Test outputs are not evidence that every historical/traditional exception has been implemented.
- The app is static and does not provide cloud sync, accounts, server-side storage or access control. Save JSON files include personal names, addresses and allocation details; store them privately and do not commit them to a public repository.

## Recommended manual acceptance test

Before using real festival records, ask a knowledgeable temple organizer to verify a sample of mixed-Muri Valayams (including Valayams 69, 117 and 124 in the supplied 2026 chart), the ending/rotation behaviour for both Karapurams, each printed Malayalam heading, Kuttiye Eduth output, and a real browser-generated PDF. Keep the original handwritten chart as the authority until those checks are accepted.
