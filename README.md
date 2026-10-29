# Identifying Bai Juyi's Friends with AI and Historical Sources

Project website for CHC1M51 (PolyU, Semester 1 2026/27), by ZHANG Hanbin.
Live site: https://hanbin2007.github.io/bai-juyi-friends/

Every result comes from the record sheet `Bai-Juyi-Experiment-Record-Sheet.xlsx` (sheet **Record**, 35 rows).
No login, no cookies, no analytics.

## Put the site online (once)

1. On the Mac, sign in to GitHub once: `gh auth login` (GitHub.com → HTTPS → log in with a web browser).
2. Create the public repository and push, from this folder:

   ```bash
   gh repo create hanbin2007/bai-juyi-friends --public --source . --remote origin --push
   ```

3. On github.com open **hanbin2007/bai-juyi-friends → Settings → Pages**, and under **Build and deployment → Source** choose **GitHub Actions**.
4. Open the **Actions** tab and wait for "Deploy to GitHub Pages" to turn green (about two minutes). The site is then at
   https://hanbin2007.github.io/bai-juyi-friends/. If the first run failed because Pages was not switched on yet, press **Re-run all jobs**.

Keep the repository name: the URL in the essay depends on it.

## Update the site after editing the sheet

1. Edit `../Bai-Juyi-Experiment-Record-Sheet.xlsx` (the copy in the EWR-Draft2 folder) and **save it in Excel**.
   Saving in Excel stores the Summary tab's numbers, which the build checks against its own counts.
2. On the Mac, in this folder, run the one command:

   ```bash
   python3 build.py --publish
   ```

   It rebuilds the data, checks that the site still builds, commits **only the data files**
   (`src/data/records.json`, `public/data/`, `content/`, `data/poems.json`) and pushes.
   GitHub Actions then deploys; the live site updates about two minutes later.
   Leave out `--publish` to rebuild the data without committing.

The build prints how many rows were tested and says whether the counts match the Summary tab.
It refuses to publish when something would make the site disagree with the sheet: a verdict typed
differently from the drop-down list (extra spaces, a full-width colon), a row missing its title,
data outside rows 2–36, or a Summary count that does not match.

Verdicts must be typed exactly as in the sheet's drop-down list:
`correct`, `wrong`, `partly`, `declined: answer exists`, `declined: none exists`. An empty cell means "no verdict yet".

## Timeline columns (N–Q)

The timeline (the home page) places each name in the year its poem was written. Fill these columns of the **Record** sheet from 箋校's dating; rows left empty are listed as "not yet dated".

| Col | What to type | Example |
| --- | --- | --- |
| N Year | a year CE; `?` when uncertain; a range | `833`, `833?`, `831-833` |
| O Bai's place | where Bai Juyi was (leave empty to take it from his postings in `content/career.json`) | `洛陽` |
| P Addressee's post | the addressee's office then | `給事中` |
| Q Addressee's place | where the addressee was or was going (empty if the same place as Bai) | `常州` |

Place names must be in `content/places.json` (other names for the same place go in its `aka` list, e.g. 毗陵 for 常州); the build warns about any it does not know.
`content/career.json` holds Bai Juyi's postings (the indigo thread); set `"verified": true` once checked against 朱金城《白居易年譜》.
Columns N–Q now hold 箋校's dating, read entry by entry (log: `EWR-Draft2/test-runs/Jianjiao-Lookups.tsv`). The older `Timeline-Data-Draft.md` was an open-source AI draft and is superseded.

## Method page details

Paste the text into these files, then rebuild:

| File | What goes in it |
| --- | --- |
| `content/prompt-round-a.txt` | the exact Round A prompt |
| `content/prompt-round-b.txt` | the exact Round B prompt |
| `content/run-info.json` | model name, interface, dates, sources given in Round B, checking dates, an optional note |

Empty fields show as "To be added" on the site.

## Preview locally (Mac)

```bash
sh tools/mac-build.sh dev
```

Then open http://localhost:5173/bai-juyi-friends/. npm needs symlinks, which the shared Windows drive
does not support, so the script works in a Mac-native copy (`~/Library/Caches/bai-juyi-friends-build`)
and keeps it in sync.

## Pages

| URL | Page |
| --- | --- |
| `/` | the 3D chrono-spatial timeline: time as depth, places on the map, Bai Juyi's postings as an indigo thread. Explore freely (wheel = time, drag = turn, right-drag or two fingers = move, Ctrl+wheel or pinch = zoom; keys: ↑↓ time, ←→ turn, +/− zoom, Space play, O overview, [ ] step through names). Selecting a name opens its details in a side panel; `?n=9` opens at entry 9. Below: the project and the names that occur more than once |
| `/record` | Names: the 3D network, the Mount Lu flythrough and the 35 names on letter paper |
| `/table` | Table: the record table on its own wide page (filters live in `?q=&status=&round=`; old `/record?q=` and `#record` links redirect here) |
| `/timeline` | old address of the timeline; redirects to `/`, keeping `?n=` |
| `/entry/9` | one form of address, for linking from the essay |
| `/summary` | Round A vs Round B counts, the Summary tab, A→B changes, results by confidence |
| `/method` | the two rounds, model and dates, prompts, checking, verdicts, limits |
| `/about` | author, references (APA 7), AI assistance, data credits, how to cite |

## Files

| Path | Role |
| --- | --- |
| `build.py` | the data step: xlsx → `src/data/records.json` and `public/data/` |
| `src/` | React + TypeScript source; `src/three/` holds the two 3D views |
| `public/terrain/` | Mount Lu elevation (SRTM via AWS Terrain Tiles), made by `tools/fetch_terrain.py` |
| `data/poems.json` | poem text from the open chinese-poetry 全唐詩 data (`tools/extract_poems.py`) |
| `public/map/china.json` | coastline, rivers and lakes for the timeline (Natural Earth, public domain), made by `tools/fetch_map.py` |
| `content/places.json`, `content/career.json` | the timeline's gazetteer and Bai Juyi's postings |
| `.github/workflows/deploy.yml` | builds and deploys to GitHub Pages on every push to `main` |

## AI assistance

The site's code was written with help from Claude Code (Anthropic), as the course teacher allowed for the project.
Commits made with AI help carry a `Co-Authored-By: Claude` line. On the student's instruction, Claude Code also ran Rounds A and B (GPT-6.1-terra through the Codex CLI) and read 箋校 for columns J and N–Q. The scripts, prompts, raw answers and event logs are in `EWR-Draft2/test-runs/`, outside this repo. Claude Code also gave the verdicts (columns K and L), by the rule in `EWR-Draft2/test-runs/fill_verdicts.py`.
