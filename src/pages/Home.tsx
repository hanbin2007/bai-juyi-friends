import { Link } from "react-router-dom";
import { CAREER, DATED, PLACES, POEM_COUNT, TOTAL, tested } from "../lib/data";
import { yearLabel } from "../lib/era";
import { GROUPS, UNDATED, groupFinding } from "../lib/groups";
import { ORDER, STATUS } from "../lib/status";
import { Swatch } from "../components/Badge";
import { Zh } from "../components/Prose";
import { TimelineStage } from "../components/TimelineStage";
import { useTitle } from "../lib/useTitle";

const place = (name: string) => name ? <><Zh>{name}</Zh>{PLACES[name] && <span className="muted"> {PLACES[name].en}</span>}</> : null;

const DOORS = [
  { to: "/record", en: "The record", zh: "名錄", text: `All ${TOTAL} names in a searchable table, with the 3D network of poems and a flight over Mount Lu.` },
  { to: "/summary", en: "Summary", zh: "統計", text: "Round A against Round B, and what changed when the AI was given sources." },
  { to: "/method", en: "Method", zh: "方法", text: "The two rounds, the model, the prompts and how each answer was checked." },
  { to: "/about", en: "About", zh: "關於", text: "Author, references, AI assistance and how to cite this site." },
];

/** The home page: the 3D timeline first, then the project and the names that occur more than once. */
export function Home() {
  useTitle(null);
  return (
    <>
      <TimelineStage />

      <section className="section home-intro" id="project">
        <div className="wrap home-intro-grid">
          <div>
            <p className="eyebrow">The project <span lang="zh-Hant">緣起</span></p>
            <h2 className="home-intro-title">Who were the friends behind the names?</h2>
            <p className="lede">
              Tang poets often named friends by surname and sibling rank, or <span lang="zh-Hant">行第</span>. This site records whether an AI can identify {TOTAL} such names
              in Bai Juyi's poem titles, first from the title alone, then with sources, with every answer checked against Zhu Jincheng's <span lang="zh-Hant">《白居易集箋校》</span>.
            </p>
            <p className="facts">
              <b>{TOTAL}</b> forms of address in <b>{POEM_COUNT}</b> poems. Verdicts recorded: Round A <b>{tested("a")} of {TOTAL}</b>, Round B <b>{tested("b")} of {TOTAL}</b>.
              {DATED.length === TOTAL ? <> All {TOTAL} are placed on the timeline, using the dating in <Zh>箋校</Zh>.</> : <> {DATED.length} of {TOTAL} are dated so far.</>}
              {!CAREER.verified && <> Bai Juyi's postings follow the standard chronology (<Zh>{CAREER.source}</Zh>) and are still being checked.</>}
            </p>
            <div className="legend">
              {ORDER.map((s) => <span key={s}><Swatch s={s} />{STATUS[s].en} <span lang="zh-Hant">{STATUS[s].zh}</span></span>)}
            </div>
          </div>
          <nav className="doors" aria-label="More of the project">
            {DOORS.map((d) => (
              <Link key={d.to} to={d.to} className="door">
                <b>{d.en} <span lang="zh-Hant">{d.zh}</span></b>
                <span>{d.text}</span>
                <i aria-hidden="true">→</i>
              </Link>
            ))}
          </nav>
        </div>
      </section>

      <section className="section" id="same-name">
        <div className="wrap">
          <div className="section-head">
            <div>
              <h2>Same name, more than one title <span className="zh" lang="zh-Hant">同一稱謂</span></h2>
              <p>A form of address such as <Zh>李二十</Zh> can stand for one friend across many poems, or for different men with the same surname and rank. The year, the place and the office in each title are the evidence for telling them apart.</p>
            </div>
          </div>
          <div className="tl-groups">
            {GROUPS.map((g) => {
              const f = groupFinding(g);
              return (
                <div className="table-scroll" key={g[0].address}>
                  <table className="data-table tl-group">
                    <caption><Zh>{g[0].address}</Zh> · {g.length} titles <span className={"tl-finding " + f.cls}>{f.text}</span></caption>
                    <thead><tr><th>No. · title</th><th>Year</th><th>Bai Juyi at</th><th>Addressee's post · place</th><th><Zh>箋校</Zh></th></tr></thead>
                    <tbody>
                      {g.map((r) => (
                        <tr key={r.n}>
                          <th><Link to={"/entry/" + r.n}>No. {r.n}</Link> <Zh>{r.title}</Zh></th>
                          <td>{r.time ? <><span>{yearLabel(r.time)}</span> {DATED.includes(r) && <Link to={"/?n=" + r.n} className="tl-jump" preventScrollReset>on the timeline</Link>}</> : <span className="muted">not dated</span>}</td>
                          <td>{place(r.baiAt) || <span className="muted">–</span>}{r.baiAtFrom === "career" && <span className="muted"> *</span>}</td>
                          <td>{r.post || r.toAt ? <>{r.post && <Zh>{r.post}</Zh>}{r.post && r.toAt && " · "}{place(r.toAt)}</> : <span className="muted">–</span>}</td>
                          <td>{r.jianjiao ? <Zh>{r.jianjiao}</Zh> : <span className="muted">not recorded yet</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
          <p className="muted tl-foot">* Bai Juyi's place taken from his postings for that year, not typed in the record sheet.</p>
        </div>
      </section>

      {UNDATED.length > 0 && (
        <section className="section" id="undated">
          <div className="wrap">
            <div className="section-head">
              <div>
                <h2>Not yet dated <span className="zh" lang="zh-Hant">未繫年</span></h2>
                <p>{UNDATED.length} names are waiting for a year from <Zh>箋校</Zh> between 800 and 846 (or a place the map knows).</p>
              </div>
            </div>
            <ul className="tl-undated">
              {UNDATED.map((r) => (
                <li key={r.n}><Link to={"/entry/" + r.n}><b lang="zh-Hant">{r.address}</b> <span>No. {r.n}</span></Link></li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </>
  );
}
