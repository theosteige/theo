# Production pages

GitHub Pages publishes only the `public/` folder. Unreleased pages live in
`drafts/`, outside that folder, so their content cannot be reached on the
production site. Keep new unfinished pages in `drafts/` until release.
`tests/production-deployment.test.mjs` verifies that the deployed page inventory
matches the visible Table of Contents and Side Quests links, plus the homepage.

## Page inventory — October 6, 2026

| Route | Navigation | Production |
| --- | --- | --- |
| `/` | Table of Contents | Published |
| `/five-minute-intro/` | Table of Contents | Published |
| `/experience/` | Table of Contents | Published |
| `/reading/` | Table of Contents | Published |
| `/writing/` | Table of Contents | Published |
| `/music/` | Table of Contents | Published |
| `/podcasts/` | Table of Contents | Published |
| `/side-quests/` | Table of Contents | Published |
| `/piano/` | Side Quests | Published |
| `/design/` | Side Quests | Published |
| `/mental-math/` | Side Quests | Published |
| `/card-memory/` | Side Quests | Published |
| `/typing/` | Side Quests | Published |
| `/projects/` | Unlisted | Offline |
| `/contrarian-takes/` | Unlisted | Offline |
| `/blog/` | Unlisted | Offline |
| `/joke/` | Unlisted | Offline |
| `/mood/` | Unlisted legacy redirect to Design | Offline |

Offline pages' slash routes, routes without a trailing slash, and explicit
`/index.html` URLs return 404. Their full HTML source stays in `drafts/` for
local editing. Shared scripts, styles, images, audio, videos, and the resume
remain published; Design depends on media under `/images/mood/`, `/audio/mood/`,
and `/videos/mood/`. The separate scores and Spotify APIs support the published
pages and are unaffected by this page inventory.

## Release a page

1. Finish its source in `drafts/`.
2. Move its folder into `public/`.
3. Add a visible entry to Table of Contents or Side Quests.
4. Update the source inventory assertions in `tests/site-integrity.test.mjs`
   and the draft inventory in `tests/production-deployment.test.mjs`.
5. Run `node --test tests/site-integrity.test.mjs tests/production-deployment.test.mjs`.
6. Push to `main` to deploy.

To preview a draft while resolving its shared `/style.css` and script URLs,
temporarily copy its folder into `public/` locally and serve that folder.
Keep that preview copy out of commits until the page is ready for release.

## Repeat the live inventory

Run `node scripts/audit-production.mjs REPORT.json`. This checks every public
file URL and all page URL variants with HTTP HEAD requests, plus the URLs of
preserved draft pages to verify they remain offline. Before/after reports
alongside this document record the live checks for this change. This is a
static website: the Pages artifact file list defines its page inventory. The
audit targets the custom production domain, rather than the separate APIs.

The baseline artifact from GitHub Actions run `37508975765` (commit
`4c3c29e0049445578401975c05092ce3d96798e9`) contains 207 files, matching the
source inventory after excluding local Vite cache files. All 242 file and page
URL variants in that artifact returned HTTP 200 before this change, including
all 18 page routes.

Deployment run `37510141352` (commit
`4991be816765b8f1859d0cff0058700574b17cc4`) succeeded. The after report verifies
that 227 published file and page URL variants still return HTTP 200, while
all 15 URL variants for the five draft pages return HTTP 404. All 13 listed
page routes remain online. The 15 draft URLs were also checked without an
inventory query string and returned 404.
