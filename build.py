#!/usr/bin/env python3
"""Rebuild the site's data from the experiment record sheet.

Usage:
    python3 build.py                 # read ../Bai-Juyi-Experiment-Record-Sheet.xlsx
    python3 build.py --xlsx PATH     # read another copy of the sheet
    python3 build.py --publish       # rebuild, check the site builds, then commit the data and push

Writes src/data/records.json (bundled into the site) and public/data/records.json
(downloadable), and keeps a copy of the sheet in public/data/ so the git history
records every data change. GitHub Actions builds and deploys the site on push.
Uses only the Python standard library.
"""

import argparse
import datetime
import hashlib
import json
import re
import shutil
import subprocess
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SHEET_NAME = "Bai-Juyi-Experiment-Record-Sheet.xlsx"
DEFAULT_XLSX = ROOT.parent / SHEET_NAME
PUBLIC_DATA = ROOT / "public" / "data"
REPO_XLSX = PUBLIC_DATA / SHEET_NAME
OUT_JSON = ROOT / "src" / "data" / "records.json"
POEMS = ROOT / "data" / "poems.json"
CONTENT = ROOT / "content"
# What --publish commits: the data, never other work in progress.
PUBLISH_PATHS = ["src/data/records.json", "public/data", "content", "data/poems.json"]

M = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
PR = "{http://schemas.openxmlformats.org/package/2006/relationships}"

# Record sheet columns (see the website brief).
COLUMNS = {
    "A": "n", "B": "title", "C": "address",
    "D": "a_answer", "E": "a_confidence",
    "F": "b_answer", "G": "b_confidence", "H": "b_sources",
    "I": "locate", "J": "jianjiao", "K": "a_verdict", "L": "b_verdict", "M": "notes",
    # Timeline columns, filled from 箋校's dating (optional; empty = not on the timeline yet).
    "N": "year", "O": "bai_at", "P": "post", "Q": "to_at",
    # Evidence status of each answer (test-runs/add_evidence_status.py; optional).
    "R": "a_evidence", "S": "b_evidence",
}
TIMELINE_HEADERS = {"N": "Year", "O": "Bai's place", "P": "Addressee's post", "Q": "Addressee's place"}
EVIDENCE_HEADERS = {"R": "A evidence status", "S": "B evidence status"}
LIFE = (772, 846)  # Bai Juyi's lifetime; a poem's year must fall inside it

# Sheet verdict text (exactly as in the drop-down list) -> site status key.
VERDICTS = {
    "correct": "correct",
    "wrong": "wrong",
    "partly": "partly",
    "declined: answer exists": "declined",
    "declined: none exists": "unknown",
}
SHEET_TEXT = {v: k for k, v in VERDICTS.items()}

# Evidence status (exactly as in the drop-down list) -> the verdict it must sit with.
EVIDENCE = {
    "matches reference": "correct",
    "differs from reference": "wrong",
    "rejected by reference": "wrong",
    "unverifiable: not annotated": "wrong",
    "unverifiable: name unknown": "wrong",
    "declined: answer exists": "declined",
    "declined: none exists": "unknown",
}

# Summary tab row label -> status key.
SUMMARY_ROWS = {
    "correct": "correct",
    "wrong": "wrong",
    "declined (answer exists)": "declined",
    "declined (no answer exists)": "unknown",
    "partly": "partly",
    "total checked": "total",
}

CONFIDENCE = {"high": "high", "medium": "medium", "low": "low", "高": "high", "中": "medium", "低": "low"}

warnings = []
errors = []   # problems that stop --publish


def warn(msg):
    warnings.append(msg)
    print("  ! " + msg)


def error(msg):
    errors.append(msg)
    print("  X " + msg)


# ---------------------------------------------------------------- xlsx reader

class Sheet:
    def __init__(self):
        self.cells = {}       # "A1" -> cached value (None when empty)
        self.formulas = {}    # "A1" -> formula text
        self.occupied = set() # refs Excel's COUNTA would count (any value, including "" from a formula)


def _text(node):
    """Text of a shared/inline string, skipping phonetic runs."""
    parts = []
    t = node.find(M + "t")
    if t is not None:
        parts.append(t.text or "")
    for r in node.findall(M + "r"):
        rt = r.find(M + "t")
        if rt is not None:
            parts.append(rt.text or "")
    return "".join(parts)


def read_workbook(path):
    """Return {sheet name: Sheet} with cached values for formulas."""
    with zipfile.ZipFile(path) as z:
        names = z.namelist()
        shared = []
        if "xl/sharedStrings.xml" in names:
            root = ET.fromstring(z.read("xl/sharedStrings.xml"))
            shared = [_text(si) for si in root.findall(M + "si")]

        rels = {}
        for rel in ET.fromstring(z.read("xl/_rels/workbook.xml.rels")).findall(PR + "Relationship"):
            target = rel.get("Target")
            target = target.lstrip("/") if target.startswith("/") else "xl/" + target
            rels[rel.get("Id")] = target

        sheets = {}
        workbook = ET.fromstring(z.read("xl/workbook.xml"))
        for el in workbook.find(M + "sheets"):
            sheet = Sheet()
            root = ET.fromstring(z.read(rels[el.get(R + "id")]))
            for c in root.iter(M + "c"):
                ref, kind = c.get("r"), c.get("t")
                v, f = c.find(M + "v"), c.find(M + "f")
                if f is not None and f.text:
                    sheet.formulas[ref] = f.text
                if kind == "inlineStr":
                    node = c.find(M + "is")
                    value = _text(node) if node is not None else None
                elif v is None or v.text is None:
                    value = "" if (f is not None and kind == "str") else None
                elif kind == "s":
                    value = shared[int(v.text)]
                elif kind in ("str", "e"):
                    value = v.text
                elif kind == "b":
                    value = v.text == "1"
                else:
                    num = float(v.text)
                    value = int(num) if num.is_integer() else num
                sheet.cells[ref] = value
                if value is not None or f is not None:
                    sheet.occupied.add(ref)
            sheets[el.get("name")] = sheet
        return sheets


def read_xlsx(path):
    """Return {sheet name: {"A1": value, ...}} (used by tools/extract_poems.py)."""
    return {name: s.cells for name, s in read_workbook(path).items()}


# ---------------------------------------------------------------- helpers

def clean(value):
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    return str(value).strip()


def verdict(raw, where):
    """Site status for a verdict cell. Anything Excel's COUNTIF would not match exactly is an error,
    because the sheet's Summary tab would then count it differently."""
    if raw is None or (isinstance(raw, str) and raw.strip() == ""):
        if isinstance(raw, str) and raw != "":
            error("%s: verdict cell holds only spaces; clear it (the Summary tab counts it as checked)" % where)
        return "untested"
    text = str(raw)
    if text.lower() in VERDICTS:
        return VERDICTS[text.lower()]
    loose = re.sub(r"\s*:\s*", ": ", re.sub(r"\s+", " ", text.replace("：", ":").strip())).lower()
    if loose in VERDICTS:
        error("%s: verdict typed as %r; use exactly %r so the Summary tab counts it" % (where, text, loose))
        return VERDICTS[loose]
    error("%s: unrecognised verdict %r" % (where, text))
    return "other"


def evidence(raw, status, where):
    """Evidence status text, checked against the verdict. A wrong answer that 箋校 cannot check
    (no name given there) is shown as "unverifiable"; the sheet's Summary counts still use the verdict."""
    text = clean(raw)
    if not text:
        return text, status
    if text not in EVIDENCE:
        error("%s: unrecognised evidence status %r" % (where, text))
        return text, status
    if EVIDENCE[text] != status:
        error("%s: evidence status %r does not fit the verdict %r" % (where, text, SHEET_TEXT.get(status, status)))
        return text, status
    return text, "unverifiable" if text.startswith("unverifiable") else status


def round_data(raw, rnd, where, verdict_col, evidence_col):
    status = verdict(raw[rnd + "_verdict"], where + " col " + verdict_col)
    text, shown = evidence(raw[rnd + "_evidence"], status, where + " col " + evidence_col)
    return {"verdict": shown, "verdictRaw": clean(raw[rnd + "_verdict"]), "evidence": text}


def confidence(raw, where):
    text = clean(raw).lower()
    if not text:
        return ""
    if text in CONFIDENCE:
        return CONFIDENCE[text]
    warn("%s: unrecognised confidence %r (shown as typed)" % (where, raw))
    return clean(raw)


def countif(sheet, col, rows, criterion):
    """Excel COUNTIF for a plain text criterion: whole-cell, case-insensitive match."""
    return sum(1 for r in rows if isinstance(sheet.cells.get(col + str(r)), str)
               and sheet.cells[col + str(r)].lower() == criterion)


def counta(sheet, col, rows):
    return sum(1 for r in rows if col + str(r) in sheet.occupied)


def read_text(path):
    return path.read_text(encoding="utf-8").strip() if path.exists() else ""


def read_json(path):
    return json.loads(read_text(path) or "{}")


def year(raw, where):
    """Year cell -> {"raw", "from", "to", "circa"}, or None when empty.
    Accepts 833, 833? (uncertain), c. 833 / 約833, and ranges 831-833 (also –, ~, 至)."""
    text = clean(raw).replace("？", "?").replace("～", "~")
    if not text:
        return None
    m = re.fullmatch(r"(?:約|c\.?\s*)?(\d{3,4})(?:\s*[-–—~至]\s*(\d{3,4}))?\??", text)
    if not m:
        error("%s: year %r is not a year such as 833, 833? or 831-833" % (where, text))
        return None
    lo = int(m.group(1))
    hi = int(m.group(2)) if m.group(2) else lo
    circa = text.startswith(("約", "c")) or text.endswith("?")
    if not (LIFE[0] <= lo <= hi <= LIFE[1]):
        error("%s: year %r is outside Bai Juyi's lifetime (%d-%d) or the range runs backwards"
              % ((where, text) + LIFE))
        return None
    return {"raw": text, "from": lo, "to": hi, "circa": circa}


def place(raw, where, aliases):
    """Place cell -> the gazetteer's name for it. Unknown names are kept as typed (shown, but not on the map)."""
    text = re.sub(r"\s+", "", clean(raw))
    if not text:
        return ""
    if text in aliases:
        return aliases[text]
    warn("%s: place %r is not in content/places.json; add it (or an 'aka') to put it on the timeline" % (where, text))
    return text


def career_place(career, when):
    """Where Bai Juyi was in the middle of `when`, from content/career.json (the nearest posting if between two).
    Station years are decimal (822.8 = autumn 822), so the year 833 runs from 833.0 to 834.0."""
    mid = (when["from"] + when["to"] + 1) / 2
    stations = career.get("stations", [])
    if not stations:
        return ""
    return min(stations, key=lambda s: 0 if s["from"] <= mid <= s["to"] else
               min(abs(mid - s["from"]), abs(mid - s["to"])))["place"]


# ---------------------------------------------------------------- build

def summary_layout(summary):
    """Find each measure's row on the Summary tab and the Record rows its formulas cover."""
    found, ranges = {}, set()
    for ref, value in summary.cells.items():
        if ref[0] == "A" and ref[1:].isdigit() and clean(value).lower() in SUMMARY_ROWS:
            found[SUMMARY_ROWS[clean(value).lower()]] = ref[1:]
    for key, n in found.items():
        for col, rec_col in (("B", "K"), ("C", "L")):
            f = summary.formulas.get(col + n, "")
            m = re.search(r"Record!\$?([A-Z])\$?(\d+):\$?([A-Z])\$?(\d+)", f)
            if not m:
                warn("Summary!%s%s has no formula over the Record sheet" % (col, n))
                continue
            if m.group(1) != rec_col or m.group(3) != rec_col:
                error("Summary!%s%s counts column %s, expected %s" % (col, n, m.group(1), rec_col))
            ranges.add((int(m.group(2)), int(m.group(4))))
            if key != "total" and ('"%s"' % SHEET_TEXT[key]) not in f.lower():
                error("Summary!%s%s does not count %r" % (col, n, SHEET_TEXT[key]))
    missing = [k for k in SUMMARY_ROWS.values() if k not in found]
    if missing:
        error("Summary tab is missing the measure(s): %s" % ", ".join(missing))
    return found, ranges


def build(xlsx):
    print("Reading %s" % xlsx)
    book = read_workbook(xlsx)
    if "Record" not in book:
        sys.exit("No sheet named 'Record' in %s" % xlsx)
    record = book["Record"]
    summary = book.get("Summary")

    expected = {"B": "Poem title", "C": "Form of address", "I": "Where to look", "K": "A verdict", "L": "B verdict"}
    for col, start in expected.items():
        if not clean(record.cells.get(col + "1")).startswith(start):
            error("Record!%s1 is %r, expected it to start with %r - columns may have moved"
                  % (col, record.cells.get(col + "1"), start))
    for col, start in TIMELINE_HEADERS.items():
        if not clean(record.cells.get(col + "1")).startswith(start):
            warn("Record!%s1 should be the %r column for the timeline; found %r"
                 % (col, start, record.cells.get(col + "1")))
    for col, start in EVIDENCE_HEADERS.items():
        if not clean(record.cells.get(col + "1")).startswith(start):
            warn("Record!%s1 should be the %r column; found %r" % (col, start, record.cells.get(col + "1")))

    gazetteer = {k: v for k, v in read_json(CONTENT / "places.json").items() if not k.startswith("_")}
    aliases = {}
    for name, p in gazetteer.items():
        for alias in [name] + p.get("aka", []):
            if aliases.get(alias, name) != name:
                error("content/places.json: %r is listed for both %s and %s" % (alias, aliases[alias], name))
            aliases[alias] = name
    career = {k: v for k, v in read_json(CONTENT / "career.json").items() if not k.startswith("_")}
    for s in career.get("stations", []):
        if s.get("place") not in gazetteer:
            error("content/career.json: place %r is not in content/places.json" % s.get("place"))

    found, ranges = summary_layout(summary) if summary else ({}, set())
    if summary is None:
        error("No sheet named 'Summary' in %s" % xlsx)
    if len(ranges) > 1:
        error("Summary formulas cover different row ranges: %s" % sorted(ranges))
    first, last = min(ranges) if ranges else (2, 36)
    rng = range(first, last + 1)

    poems = json.loads(POEMS.read_text(encoding="utf-8")) if POEMS.exists() else {}
    used = [int(re.sub(r"\D", "", ref)) for ref in record.occupied if re.sub(r"\D", "", ref)]
    max_row = max(used + [last])

    rows, seen = [], set()
    for r in range(2, max_row + 1):
        raw = {key: record.cells.get(col + str(r)) for col, key in COLUMNS.items()}
        filled = [col for col in COLUMNS if col + str(r) in record.occupied]
        if not filled:
            if r in rng:
                error("Record row %d is empty but lies inside the Summary range %d-%d" % (r, first, last))
            continue
        where = "Record row %d" % r
        if r not in rng:
            error("%s has data but lies outside the Summary formulas' range %d-%d" % (where, first, last))
        title, address = clean(raw["title"]), clean(raw["address"])
        if not title or not address:
            error("%s is missing its %s" % (where, "poem title" if not title else "form of address"))
        n = clean(raw["n"]) or str(r - 1)
        if n in seen:
            error("%s repeats entry number %s" % (where, n))
        seen.add(n)
        when = year(raw["year"], where + " col N")
        bai_at = place(raw["bai_at"], where + " col O", aliases)
        bai_from = "sheet" if bai_at else ""
        if when and not bai_at:
            bai_at, bai_from = career_place(career, when), "career"
        if not when and (bai_at or clean(raw["post"]) or clean(raw["to_at"])):
            warn("%s: has place or post but no year (col N), so it is not on the timeline yet" % where)
        rows.append({
            "n": n,
            "title": title,
            "address": address,
            "a": {
                "answer": clean(raw["a_answer"]),
                "confidence": confidence(raw["a_confidence"], where + " col E"),
                **round_data(raw, "a", where, "K", "R"),
            },
            "b": {
                "answer": clean(raw["b_answer"]),
                "confidence": confidence(raw["b_confidence"], where + " col G"),
                "sources": clean(raw["b_sources"]),
                **round_data(raw, "b", where, "L", "S"),
            },
            "locate": clean(raw["locate"]),
            "jianjiao": clean(raw["jianjiao"]),
            "notes": clean(raw["notes"]),
            "time": when,
            "baiAt": bai_at,
            "baiAtFrom": bai_from,
            "post": clean(raw["post"]),
            "toAt": place(raw["to_at"], where + " col Q", aliases),
            "poem": poems.get(title),
        })
        if address and address not in title:
            warn("%s: form of address %r does not occur in the title" % (where, address))
        if title and title not in poems:
            warn("%s: no poem text for %r (run tools/extract_poems.py)" % (where, title))
    if len(rows) != 35:
        warn("%d records found; the project has 35" % len(rows))

    # Counted exactly as the Summary tab's formulas do (COUNTIF / COUNTA over the same range).
    counts = {}
    for rnd, col in (("a", "K"), ("b", "L")):
        c = {key: countif(record, col, rng, text) for text, key in VERDICTS.items()}
        c["total"] = counta(record, col, rng)
        counts[rnd] = c

    if summary is None or len(found) < len(SUMMARY_ROWS):
        check = {"status": "missing", "detail": "The Summary tab is missing or incomplete."}
    else:
        cached = {(rnd, k): summary.cells.get(col + n) for k, n in found.items() for rnd, col in (("a", "B"), ("b", "C"))}
        if any(v is None or v == "" for v in cached.values()):
            check = {"status": "uncached",
                     "detail": "The Summary tab has no saved results. Open the sheet in Excel and save it once."}
            warn(check["detail"])
        else:
            diffs = ["%s %s: site %s, sheet %s" % (rnd.upper(), k, counts[rnd][k], v)
                     for (rnd, k), v in sorted(cached.items()) if clean(v) != str(counts[rnd][k])]
            if diffs:
                check = {"status": "mismatch", "detail": "; ".join(diffs)}
                for d in diffs:
                    error("Summary tab mismatch - " + d)
            else:
                check = {"status": "match", "detail": "All counts match the Summary tab."}

    run_info = json.loads(read_text(CONTENT / "run-info.json") or "{}")
    data = {
        "meta": {
            "built": datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8)))
                     .strftime("%Y-%m-%d %H:%M HKT"),
            "source": SHEET_NAME,
            "sha256": hashlib.sha256(xlsx.read_bytes()).hexdigest(),
            "summaryCheck": check,
        },
        "counts": counts,
        "rows": rows,
        "places": {k: {"en": v["en"], "lon": v["lon"], "lat": v["lat"]} for k, v in gazetteer.items()},
        "career": career,
        "method": {
            "run": run_info,
            "promptA": read_text(CONTENT / "prompt-round-a.txt"),
            "promptB": read_text(CONTENT / "prompt-round-b.txt"),
        },
    }

    # Keep the old "built" stamp when nothing else changed, so a rebuild without edits is a no-op.
    if OUT_JSON.exists():
        try:
            old = json.loads(OUT_JSON.read_text(encoding="utf-8"))
            if dict(old, meta=dict(old["meta"], built="")) == dict(data, meta=dict(data["meta"], built="")):
                data["meta"]["built"] = old["meta"]["built"]
        except (ValueError, KeyError):
            pass

    payload = json.dumps(data, ensure_ascii=False, indent=1) + "\n"
    for out in (OUT_JSON, PUBLIC_DATA / "records.json"):
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(payload, encoding="utf-8")
    if xlsx.resolve() != REPO_XLSX.resolve():
        shutil.copy2(xlsx, REPO_XLSX)

    tested = lambda rnd: sum(1 for row in rows if row[rnd]["verdict"] != "untested")
    print("  %d rows; Round A tested %d, Round B tested %d" % (len(rows), tested("a"), tested("b")))
    print("  Summary tab check: %s - %s" % (check["status"], check["detail"]))
    print("Wrote src/data/records.json and public/data/"
          + (" with %d error(s)" % len(errors) if errors else "")
          + (" and %d warning(s)" % len(warnings) if warnings else ""))


# ---------------------------------------------------------------- publish

def git(*args, check=True, capture=False):
    return subprocess.run(["git"] + list(args), cwd=ROOT, check=check, text=True,
                          capture_output=capture)


def publish():
    if errors:
        sys.exit("Not published: fix the %d error(s) above first." % len(errors))
    if git("remote", "get-url", "origin", check=False, capture=True).returncode != 0:
        sys.exit("Not published: this repository has no GitHub remote yet. See 'Put the site online' in README.md.")

    if shutil.which("npm") or Path("/opt/homebrew/bin/npm").exists():
        # Same build GitHub Actions will run; stop here rather than push a broken site.
        print("Checking that the site builds...")
        subprocess.run(["sh", str(ROOT / "tools" / "mac-build.sh"), "build"], check=True)
    else:
        print("npm not found; skipping the local build check (GitHub Actions will still build).")

    git("add", "--", *PUBLISH_PATHS)
    if git("diff", "--cached", "--quiet", check=False).returncode != 0:
        git("commit", "-m", "Update results from the record sheet (%s)" % datetime.date.today().isoformat())
    else:
        print("The data has not changed since the last commit.")

    other = [line for line in git("status", "--porcelain", capture=True).stdout.splitlines() if line.strip()]
    if other:
        print("Left out of this publish (commit them yourself if they should go online):")
        for line in other:
            print("   " + line)

    # Push whatever is not on GitHub yet, including a commit from an earlier run whose push failed.
    has_upstream = git("rev-parse", "--abbrev-ref", "@{u}", check=False, capture=True).returncode == 0
    ahead = int(git("rev-list", "--count", "@{u}..HEAD", capture=True).stdout.strip()) if has_upstream else 1
    if not ahead:
        print("GitHub is already up to date.")
        return
    git("push", *([] if has_upstream else ["-u", "origin", "HEAD"]))
    print("Pushed. GitHub Actions now builds and deploys; the live site updates in about two minutes.")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--xlsx", type=Path, help="path to the record sheet (default: %s)" % DEFAULT_XLSX)
    parser.add_argument("--publish", action="store_true", help="commit the data and push after building")
    args = parser.parse_args()
    xlsx = args.xlsx or (DEFAULT_XLSX if DEFAULT_XLSX.exists() else REPO_XLSX)
    if not xlsx.exists():
        sys.exit("Record sheet not found: %s" % xlsx)
    build(xlsx)
    if args.publish:
        publish()
    elif errors:
        sys.exit(1)


if __name__ == "__main__":
    main()
