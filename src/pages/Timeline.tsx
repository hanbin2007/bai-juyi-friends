import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CAREER, DATED, PLACES, ROWS, TOTAL, type Row } from "../lib/data";
import { eraYear, yearLabel } from "../lib/era";
import { ORDER, STATUS } from "../lib/status";
import { Swatch } from "../components/Badge";
import { PageHead, Zh } from "../components/Prose";
import { useTitle } from "../lib/useTitle";
import { FLY_END, progressFor, Y0, Y1 } from "../lib/timelineScale";
import type { TimelineHandle } from "../three/timeline";

const place = (name: string) => name ? <><Zh>{name}</Zh>{PLACES[name] && <span className="muted"> {PLACES[name].en}</span>}</> : null;

// Forms of address that occur in more than one title, in the order of the record.
const GROUPS = [...new Set(ROWS.map((r) => r.address))]
  .map((a) => ROWS.filter((r) => r.address === a))
  .filter((g) => g.length > 1);
const UNDATED = ROWS.filter((r) => !DATED.includes(r));

function groupFinding(g: Row[]) {
  const ids = g.map((r) => r.jianjiao);
  if (ids.some((x) => !x)) return { cls: "open", text: "Not yet checked in 箋校" };
  return new Set(ids).size === 1
    ? { cls: "same", text: "One person in every title (箋校)" }
    : { cls: "different", text: `${new Set(ids).size} different people (箋校)` };
}

function Stage() {
  const sectionRef = useRef<HTMLElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const yearRef = useRef<HTMLParagraphElement>(null);
  const barRef = useRef<HTMLElement>(null);
  const capsRef = useRef<HTMLDivElement>(null);
  const handle = useRef<TimelineHandle | null>(null);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const focusN = params.get("n");
  const [ready, setReady] = useState(false);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const section = sectionRef.current!, host = hostRef.current!;
    const caps = Array.from(capsRef.current!.querySelectorAll<HTMLElement>(".tl-cap"));
    const signal = { cancelled: false };
    let last = "";
    // three.js loads only on this page
    import("../three/timeline")
      .then((m) => m.mountTimeline(section, host, {
        rows: DATED, places: PLACES, stations: CAREER.stations,
        onOpen: (n) => navigate("/entry/" + n),
        // runs every frame: write to the DOM directly rather than re-render
        onYear: (year, overview) => {
          const y = Math.min(846, Math.max(800, Math.floor(year)));
          const text = overview > 0.5 ? `${Y0 + 1}–846 · seen from the side` : `${y} · ${eraYear(y)}`;
          if (text !== last && yearRef.current) { yearRef.current.textContent = text; last = text; }
          caps.forEach((c) => {
            const from = Number(c.dataset.from), to = Number(c.dataset.to);
            const on = c.dataset.overview ? overview > 0.5 : overview < 0.5 && year >= from && year < to;
            c.classList.toggle("on", on);
          });
          if (barRef.current) barRef.current.style.transform = `scaleX(${((year - Y0) / (Y1 - Y0)) * FLY_END + overview * (1 - FLY_END)})`;
        },
      }, signal))
      .then((h) => { if (signal.cancelled) h.destroy(); else { handle.current = h; setReady(true); } })
      .catch((err) => {
        if (signal.cancelled) return;   // left the page while loading (mountTimeline rejects with Cancelled)
        console.warn("Timeline unavailable:", err);
        setFallback(true);
      });
    return () => { signal.cancelled = true; handle.current?.destroy(); handle.current = null; };
  }, [navigate]);

  // /timeline?n=9 scrolls to the year of entry 9 and holds it in focus
  useEffect(() => {
    const row = DATED.find((r) => r.n === focusN);
    handle.current?.pin(row ? row.n : null);
    if (!row || !sectionRef.current || !ready) return;
    const s = sectionRef.current, top = s.getBoundingClientRect().top + scrollY;
    const t = setTimeout(() => {
      scrollTo({ top: top + progressFor((row.time!.from + row.time!.to + 1) / 2) * (s.offsetHeight - innerHeight), behavior: "instant" });
      handle.current?.snap();
    }, 60);
    return () => clearTimeout(t);
  }, [focusN, ready]);

  const stations = CAREER.stations;
  return (
    <section className={"tl" + (fallback ? " tl-static" : "")} aria-label="Timeline of Bai Juyi's postings and the dated names" ref={sectionRef}>
      {/* Read by screen readers, shown when a keyboard reaches its links, and shown as a plain list
          when WebGL is not available */}
      <div className={fallback ? "wrap tl-list" : "sr-only tl-alt"}>
        <h2>Dated names, in order of time</h2>
        {DATED.length ? (
          <ol>
            {[...DATED].sort((a, b) => a.time!.from - b.time!.from).map((r) => (
              <li key={r.n}>
                {yearLabel(r.time!)}: <Link to={"/entry/" + r.n}><Zh>{r.address}</Zh></Link>, in <Zh>{r.title}</Zh>.
                Bai Juyi at <Zh>{r.baiAt}</Zh>{r.toAt && <>; addressee at <Zh>{r.toAt}</Zh></>}{r.post && <>, <Zh>{r.post}</Zh></>}.
              </li>
            ))}
          </ol>
        ) : <p>No names have been dated yet.</p>}
      </div>
      <div className="tl-stage">
        <div className="tl-canvas" ref={hostRef}>
          {!ready && !fallback && <p className="tl-loading">Unrolling the scroll…</p>}
        </div>
        <p className="tl-year" aria-hidden="true" ref={yearRef}>{Y0 + 1}</p>
        <div className="tl-caps" aria-hidden="true" ref={capsRef}>
          <article className="tl-cap" data-from={Y0} data-to={stations[0]?.from ?? 800}>
            <p className="tl-cap-kicker">How to read it</p>
            <h2>Scroll to travel through time</h2>
            <p>The gold thread is Bai Juyi. Each name appears in the year of its poem, with a red thread to where the friend was.</p>
            <p className="tl-cue">Scroll down <span aria-hidden="true">↓</span></p>
          </article>
          {stations.map((s, i) => (
            <article className="tl-cap" key={i} data-from={i ? s.from : stations[0].from} data-to={stations[i + 1]?.from ?? Y1}>
              <p className="tl-cap-kicker">
                Posting {i + 1} of {stations.length} · {Math.floor(s.from)}–{Math.floor(s.to)}
                <span className="tl-steps">{stations.map((_, j) => <i key={j} className={j === i ? "on" : j < i ? "past" : ""} />)}</span>
              </p>
              <h2><span lang="zh-Hant">{s.place}</span> {PLACES[s.place]?.en}</h2>
              <p className="tl-cap-post" lang="zh-Hant">{s.post}</p>
              <p>{s.en}</p>
            </article>
          ))}
          <article className="tl-cap" data-overview="1" data-from="0" data-to="0">
            <p className="tl-cap-kicker">Overview</p>
            <h2>The whole span at once</h2>
            <p>All of 800–846 from the side, earliest first. Dashed red links join the same form of address in different titles when <span lang="zh-Hant">箋校</span> names different people; solid links mean the same person.</p>
          </article>
        </div>
        <ul className="tl-key" aria-hidden="true">
          <li><i className="k-thread" />Bai Juyi's postings</li>
          <li><i className="k-letter" />to the addressee</li>
          <li><i className="k-name" />fill = Round A, ring = Round B</li>
        </ul>
        <div className="tl-progress" aria-hidden="true"><i ref={barRef} /></div>
      </div>
    </section>
  );
}

export function Timeline() {
  useTitle("Timeline");
  return (
    <>
      <PageHead title="Through time and place" zh="時空長卷">
        Each name in the record, placed in the year its poem was written. Depth is time, from 800 to 846;
        across the screen, places sit roughly where they lie on the map. The gold thread follows Bai Juyi's postings.
      </PageHead>
      <div className="wrap tl-status">
        {DATED.length === TOTAL
          ? <p>All <b>{TOTAL}</b> names are placed, using the dating in <Zh>箋校</Zh>.</p>
          : <p><b>{DATED.length}</b> of <b>{TOTAL}</b> names dated so far, from the dating in <Zh>箋校</Zh>. The rest are listed below the timeline until they are dated.</p>}
        {!CAREER.verified && <p className="muted">Bai Juyi's postings follow the standard chronology (<Zh>{CAREER.source}</Zh>) and are still being checked.</p>}
        <p><a href="#same-name">Skip to the names that occur more than once</a></p>
      </div>

      <Stage />

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
                          <td>{r.time ? <><span>{yearLabel(r.time)}</span> {DATED.includes(r) && <Link to={"/timeline?n=" + r.n} className="tl-jump">on the timeline</Link>}</> : <span className="muted">not dated</span>}</td>
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

      <section className="section" id="undated">
        <div className="wrap">
          <div className="section-head">
            <div>
              <h2>Not yet dated <span className="zh" lang="zh-Hant">未繫年</span></h2>
              <p>{UNDATED.length ? `${UNDATED.length} names are waiting for a year from 箋校 between 800 and 846 (or a place the map knows).` : "Every name is on the timeline."}</p>
            </div>
          </div>
          <ul className="tl-undated">
            {UNDATED.map((r) => (
              <li key={r.n}><Link to={"/entry/" + r.n}><b lang="zh-Hant">{r.address}</b> <span>No. {r.n}</span></Link></li>
            ))}
          </ul>
          <div className="legend">
            {ORDER.map((s) => <span key={s}><Swatch s={s} />{STATUS[s].en} <span lang="zh-Hant">{STATUS[s].zh}</span></span>)}
          </div>
        </div>
      </section>
    </>
  );
}
