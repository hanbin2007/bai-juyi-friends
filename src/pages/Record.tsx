import { useState } from "react";
import { Link } from "react-router-dom";
import { POEM_COUNT, TOTAL, tested, type Row } from "../lib/data";
import { ORDER, STATUS } from "../lib/status";
import { Swatch } from "../components/Badge";
import { Flythrough } from "../components/Flythrough";
import { LetterCard } from "../components/LetterCard";
import { Mosaic } from "../components/Mosaic";
import { Network3D } from "../components/Network3D";
import { useTitle } from "../lib/useTitle";

/** /record — the names: the 3D network, the Mount Lu flight and the mosaic. The project's own title is on the home
 *  page; this hero introduces the names. The table has its own page, /table. */
export function Record() {
  useTitle("Names");
  const [pointed, setPointed] = useState<Row | null>(null);

  return (
    <>
      <section className="hero">
        <div className="wrap">
          <div>
            <h1>Thirty-five ways to name a friend</h1>
            <span className="zh-title" lang="zh-Hant">三十五個稱謂</span>
            <p className="lede">
              Each is a surname and a sibling rank, or <span lang="zh-Hant">行第</span>: <span lang="zh-Hant" className="pn">元九</span>, “Yuan the Ninth”, is Yuan Zhen.
              In the network every name hangs from Bai Juyi by the poem it comes from. Its fill is the AI's verdict from the title alone,
              its ring the verdict with sources.
            </p>
            <p className="facts">
              <b>{TOTAL}</b> forms of address in <b>{POEM_COUNT}</b> poems. Verdicts recorded so far: Round A <b>{tested("a")} of {TOTAL}</b>, Round B <b>{tested("b")} of {TOTAL}</b>.
            </p>
            <p className="hero-links">
              <a href="#journey">Fly over Mount Lu</a> &nbsp;·&nbsp; <a href="#names">All {TOTAL} on letter paper</a> &nbsp;·&nbsp; <Link to="/table">Browse the table</Link>
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
            <Mosaic visible={() => true} onPoint={setPointed} />
          </div>
          <div className="legend">
            {ORDER.map((s) => <span key={s}><Swatch s={s} />{STATUS[s].en} <span lang="zh-Hant">{STATUS[s].zh}</span></span>)}
          </div>
        </div>
      </section>
    </>
  );
}
