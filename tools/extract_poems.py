#!/usr/bin/env python3
"""Copy the text of the poems in the record sheet into data/poems.json.

The text comes from the open chinese-poetry Complete Tang Poems (全唐詩) data,
Bai Juyi subset, saved in the Draft 1 working folder. Run this only when the
list of poems in the sheet changes:

    python3 tools/extract_poems.py [--corpus PATH]

Note: this edition leaves out Bai Juyi's own notes (自注) and may differ from
the wording in 白居易集箋校. It is shown for reading only.
"""

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from build import DEFAULT_XLSX, REPO_XLSX, clean, read_xlsx  # noqa: E402

DEFAULT_CORPUS = (ROOT.parent.parent / "EWR-Draft1" / "work" / "2026-10-02-Addressee-Identification-Trial"
                  / "data" / "Bai-Juyi-Complete-Tang-Poems-chinese-poetry.json")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--corpus", type=Path, default=DEFAULT_CORPUS)
    parser.add_argument("--xlsx", type=Path, default=DEFAULT_XLSX if DEFAULT_XLSX.exists() else REPO_XLSX)
    args = parser.parse_args()

    corpus = {p["title"]: p["paragraphs"] for p in json.loads(args.corpus.read_text(encoding="utf-8"))}
    record = read_xlsx(args.xlsx)["Record"]
    titles = sorted({clean(v) for ref, v in record.items() if ref[0] == "B" and ref != "B1" and clean(v)})

    poems, missing = {}, []
    for title in titles:
        if title in corpus:
            poems[title] = corpus[title]
        else:
            missing.append(title)
    out = ROOT / "data" / "poems.json"
    out.write_text(json.dumps(poems, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print("Wrote %d poems to %s" % (len(poems), out))
    for title in missing:
        print("  ! not found in corpus: " + title)


if __name__ == "__main__":
    main()
