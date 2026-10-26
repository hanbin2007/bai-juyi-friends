#!/usr/bin/env python3
"""Rebuild the site's data from the experiment record sheet.

Usage:
    python3 build.py                 # read ../Bai-Juyi-Experiment-Record-Sheet.xlsx
    python3 build.py --xlsx PATH     # read another copy of the sheet
    python3 build.py --publish       # rebuild, check the site builds, then git commit and push

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

M = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
PR = "{http://schemas.openxmlformats.org/package/2006/relationships}"

# Record sheet columns (see the website brief).
COLUMNS = {
    "A": "n", "B": "title", "C": "address",
    "D": "a_answer", "E": "a_confidence",
    "F": "b_answer", "G": "b_confidence", "H": "b_sources",
    "I": "locate", "J": "jianjiao", "K": "a_verdict", "L": "b_verdict", "M": "notes",
}

# Sheet verdict text -> site status key.
VERDICTS = {
    "correct": "correct",
    "wrong": "wrong",
    "partly": "partly",
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


def warn(msg):
    warnings.append(msg)
    print("  ! " + msg)


# ---------------------------------------------------------------- xlsx reader

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


def read_xlsx(path):
    """Return {sheet name: {"A1": value, ...}} with cached values for formulas."""
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
        for sheet in workbook.find(M + "sheets"):
            cells = {}
            root = ET.fromstring(z.read(rels[sheet.get(R + "id")]))
            for c in root.iter(M + "c"):
                kind = c.get("t")
                v = c.find(M + "v")
                if kind == "inlineStr":
                    node = c.find(M + "is")
                    value = _text(node) if node is not None else None
                elif v is None or v.text is None:
                    value = None
                elif kind == "s":
                    value = shared[int(v.text)]
                elif kind in ("str", "e"):
                    value = v.text
                elif kind == "b":
                    value = v.text == "1"
                else:
                    num = float(v.text)
                    value = int(num) if num.is_integer() else num
                cells[c.get("r")] = value
            sheets[sheet.get("name")] = cells
        return sheets


# ---------------------------------------------------------------- helpers

def clean(value):
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    return str(value).strip()


def verdict(raw, where):
    text = re.sub(r"\s+", " ", clean(raw).replace("：", ":")).lower()
    text = re.sub(r"\s*:\s*", ": ", text)
    if not text:
        return "untested"
    if text in VERDICTS:
        return VERDICTS[text]
    warn("%s: unrecognised verdict %r (shown as 'other')" % (where, raw))
    return "other"


def confidence(raw, where):
    text = clean(raw).lower()
    if not text:
        return ""
    if text in CONFIDENCE:
        return CONFIDENCE[text]
    warn("%s: unrecognised confidence %r (shown as typed)" % (where, raw))
    return clean(raw)


def read_text(path):
    return path.read_text(encoding="utf-8").strip() if path.exists() else ""


# ---------------------------------------------------------------- build

def build(xlsx):
    print("Reading %s" % xlsx)
    sheets = read_xlsx(xlsx)
    if "Record" not in sheets:
        sys.exit("No sheet named 'Record' in %s" % xlsx)
    record = sheets["Record"]

    expected = {"B": "Poem title", "C": "Form of address", "I": "Where to look", "K": "A verdict", "L": "B verdict"}
    for col, start in expected.items():
        if not clean(record.get(col + "1")).startswith(start):
            warn("Record!%s1 is %r, expected it to start with %r - columns may have moved"
                 % (col, record.get(col + "1"), start))

    poems = json.loads(POEMS.read_text(encoding="utf-8")) if POEMS.exists() else {}

    rows = []
    last = max(int(re.sub(r"\D", "", ref)) for ref in record)
    for r in range(2, last + 1):
        raw = {key: record.get(col + str(r)) for col, key in COLUMNS.items()}
        if not clean(raw["title"]) and not clean(raw["address"]):
            continue
        where = "Record row %d" % r
        title = clean(raw["title"])
        rows.append({
            "n": clean(raw["n"]) or str(len(rows) + 1),
            "title": title,
            "address": clean(raw["address"]),
            "a": {
                "answer": clean(raw["a_answer"]),
                "confidence": confidence(raw["a_confidence"], where + " col E"),
                "verdict": verdict(raw["a_verdict"], where + " col K"),
                "verdictRaw": clean(raw["a_verdict"]),
            },
            "b": {
                "answer": clean(raw["b_answer"]),
                "confidence": confidence(raw["b_confidence"], where + " col G"),
                "sources": clean(raw["b_sources"]),
                "verdict": verdict(raw["b_verdict"], where + " col L"),
                "verdictRaw": clean(raw["b_verdict"]),
            },
            "locate": clean(raw["locate"]),
            "jianjiao": clean(raw["jianjiao"]),
            "notes": clean(raw["notes"]),
            "poem": poems.get(title),
        })
        if rows[-1]["address"] and rows[-1]["address"] not in title:
            warn("%s: form of address %r does not occur in the title" % (where, rows[-1]["address"]))
        if title and title not in poems:
            warn("%s: no poem text for %r (run tools/extract_poems.py)" % (where, title))

    # Counts computed here, then compared with the Summary tab's cached values.
    keys = ["correct", "wrong", "declined", "unknown", "partly", "total"]
    counts = {}
    for rnd in ("a", "b"):
        c = {k: 0 for k in keys}
        for row in rows:
            v = row[rnd]["verdict"]
            if v in c:
                c[v] += 1
            if row[rnd]["verdictRaw"]:
                c["total"] += 1
        counts[rnd] = c

    check = {"status": "missing", "detail": "No Summary sheet found."}
    summary = sheets.get("Summary")
    if summary is not None:
        sheet_counts = {"a": {}, "b": {}}
        for ref, value in summary.items():
            if ref[0] == "A" and clean(value).lower() in SUMMARY_ROWS:
                key = SUMMARY_ROWS[clean(value).lower()]
                n = ref[1:]
                sheet_counts["a"][key] = summary.get("B" + n)
                sheet_counts["b"][key] = summary.get("C" + n)
        cached = [v for rnd in sheet_counts.values() for v in rnd.values()]
        if not cached or any(v is None for v in cached):
            check = {"status": "uncached",
                     "detail": "The Summary tab has no saved results. Open the sheet in Excel and save it once."}
        else:
            diffs = ["%s %s: site %s, sheet %s" % (rnd.upper(), k, counts[rnd][k], v)
                     for rnd in ("a", "b") for k, v in sheet_counts[rnd].items()
                     if clean(v) != str(counts[rnd][k])]
            if diffs:
                check = {"status": "mismatch", "detail": "; ".join(diffs)}
                for d in diffs:
                    warn("Summary tab mismatch - " + d)
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
    print("Wrote src/data/records.json and public/data/" + (" with %d warning(s)" % len(warnings) if warnings else ""))


def publish():
    def git(*args, check=True):
        return subprocess.run(["git"] + list(args), cwd=ROOT, check=check)
    if shutil.which("npm") or Path("/opt/homebrew/bin/npm").exists():
        # Same build GitHub Actions will run; stop here rather than push a broken site.
        print("Checking that the site builds...")
        subprocess.run(["sh", str(ROOT / "tools" / "mac-build.sh"), "build"], check=True)
    else:
        print("npm not found; skipping the local build check (GitHub Actions will still build).")
    git("add", "-A")
    if git("diff", "--cached", "--quiet", check=False).returncode == 0:
        print("Nothing changed; nothing to publish.")
        return
    stamp = datetime.date.today().isoformat()
    git("commit", "-m", "Update results from the record sheet (%s)" % stamp)
    git("push")
    print("Pushed. GitHub Actions now builds and deploys; the live site updates in about two minutes.")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--xlsx", type=Path, help="path to the record sheet (default: %s)" % DEFAULT_XLSX)
    parser.add_argument("--publish", action="store_true", help="git commit and push after building")
    args = parser.parse_args()
    xlsx = args.xlsx or (DEFAULT_XLSX if DEFAULT_XLSX.exists() else REPO_XLSX)
    if not xlsx.exists():
        sys.exit("Record sheet not found: %s" % xlsx)
    build(xlsx)
    if args.publish:
        publish()


if __name__ == "__main__":
    main()
