import { useState } from "react";
import { Link } from "react-router-dom";
import { POEM_COUNT, TOTAL, tested, type Row } from "../lib/data";
import { ORDER, STATUS } from "../lib/status";
import { matches, useFilters } from "../lib/filters";
import { Swatch } from "../components/Badge";
import { Flythrough } from "../components/Flythrough";
import { LetterCard } from "../components/LetterCard";
import { Mosaic } from "../components/Mosaic";
import { Network3D } from "../components/Network3D";
import { FilterBar, RecordTable } from "../components/RecordTable";
import { useTitle } from "../lib/useTitle";

export function Home() {
  useTitle(null);
  const [f, set, reset] = useFilters();
  const [pointed, setPointed] = useState<Row | null>(null);

  return (
    <>
      <section className="hero">
        <div className="wrap">
          <div>
            <h1>Identifying Bai Juyi's Friends with AI and Historical Sources</h1>
            <span className="zh-title" lang="zh-Hant">以 AI 與史料考白居易詩題中的友人</span>
            <p className="lede">
              Tang poets often named friends by surname and sibling rank, or <span lang="zh-Hant">行第</span>: <span lang="zh-Hant" className="pn">元九</span>, “Yuan the Ninth”, is Yuan Zhen.
              This site records whether an AI can identify {TOTAL} such names in Bai Juyi's poem titles, first from the title alone, then with sources,
              with every answer checked against Zhu Jincheng's <span lang="zh-Hant">《白居易集箋校》</span>.
            </p>
            <p className="facts">
              <b>{TOTAL}</b> forms of address in <b>{POEM_COUNT}</b> poems. Verdicts recorded so far: Round A <b>{tested("a")} of {TOTAL}</b>, Round B <b>{tested("b")} of {TOTAL}</b>.
            </p>
            <p className="hero-links">
              <a href="#record">Browse the record</a> &nbsp;·&nbsp; <Link to="/timeline">Through time and place</Link> &nbsp;·&nbsp; <Link to="/method">How it was tested</Link> &nbsp;·&nbsp; <Link to="/summary">Summary</Link>
            </p>
          </div>
          <Network3D />
        </div>
      </section>

      <Flythrough />

      <section className="section" id="names">
        <div className="wrap">
          <div className="section-head">
            <div>
              <h2>The {TOTAL} forms of address <span className="zh" lang="zh-Hant">三十五個稱謂</span></h2>
              <p>Each tile is one name in one poem title. The two bars show the verdict for Round A (title only) and Round B (title + sources). Point at a tile to read its title on the letter paper; select it to open the entry.</p>
            </div>
          </div>
          <div className="glance">
            <LetterCard hold={pointed} />
            <Mosaic visible={(r) => matches(r, f)} onPoint={setPointed} />
          </div>
          <div className="legend">
            {ORDER.map((s) => <span key={s}><Swatch s={s} />{STATUS[s].en} <span lang="zh-Hant">{STATUS[s].zh}</span></span>)}
          </div>
        </div>
      </section>

      <section className="section" id="record">
        <div className="wrap">
          <div className="section-head">
            <div>
              <h2>Names, answers and the annotated edition <span className="zh" lang="zh-Hant">名錄</span></h2>
              <p>One row per form of address. Select a row for the details, the sources the AI cited and the poem itself; each entry also has its own page. The underlined name in each title follows the proper-name line (<span lang="zh-Hant">專名線</span>) of annotated editions.</p>
            </div>
          </div>
          <FilterBar f={f} set={set} />
          <RecordTable f={f} reset={reset} />
        </div>
      </section>
    </>
  );
}
