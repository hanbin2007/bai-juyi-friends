import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { DATA, ROWS, TOTAL, countBy, tested, type RoundKey, type Verdict } from "../lib/data";
import { CONF, ORDER, STATUS } from "../lib/status";
import { Swatch } from "../components/Badge";
import { Zh } from "../components/Prose";
import { useTitle } from "../lib/useTitle";

const CHECK: Record<string, [string, string]> = {
  match: ["ok", "These numbers match the Summary tab of the record sheet."],
  uncached: ["wait", "Counted from the Record tab. The sheet's Summary tab had no saved results to compare with; open the sheet in Excel, save it, and rebuild."],
  mismatch: ["bad", "These numbers do not match the sheet's Summary tab: "],
  missing: ["bad", "The record sheet has no Summary tab to compare with."],
};
const ROUNDS: [RoundKey, string, string][] = [["a", "Round A", "僅詩題 · title only"], ["b", "Round B", "詩題＋史料 · with sources"]];
const pct = (n: number) => (TOTAL ? Math.round((n / TOTAL) * 100) : 0);

function StackChart() {
  const ref = useRef<HTMLDivElement>(null);
  // Hide a segment's number when it doesn't fit inside the segment.
  useEffect(() => {
    const fit = () => ref.current?.querySelectorAll<HTMLElement>(".seg").forEach((seg) => {
      const b = seg.firstElementChild as HTMLElement;
      b.style.visibility = seg.clientWidth >= b.scrollWidth + 12 && seg.clientWidth >= 20 ? "visible" : "hidden";
    });
    fit();
    addEventListener("resize", fit);
    return () => removeEventListener("resize", fit);
  }, []);
  return (
    <div ref={ref}>
      {ROUNDS.map(([k, name, zh]) => {
        const c = countBy(k);
        const keys = [...ORDER, "other" as Verdict].filter((s) => c[s] > 0);
        return (
          <div className="stack-row" key={k}>
            <div className="stack-label">{name}<span lang="zh-Hant">{zh}</span></div>
            <div className="stack" role="group" aria-label={name + " verdicts"}>
              {keys.map((s) => (
                <span key={s} className="seg" data-s={s} style={{ flex: `${c[s]} 1 0` }} tabIndex={0}
                  data-tip={`${name} · ${STATUS[s].en} ${STATUS[s].zh}\n${c[s]} of ${TOTAL} (${pct(c[s])}%)`}
                  aria-label={`${name}, ${STATUS[s].en}: ${c[s]} of ${TOTAL}`}>
                  <b>{c[s]}</b>
                </span>
              ))}
            </div>
            <div className="stack-total">{tested(k)}/{TOTAL} judged</div>
          </div>
        );
      })}
      <div className="axis" aria-hidden="true">
        <span />
        <div className="axis-ticks">
          {[0, 10, 20, 30].filter((t) => t <= TOTAL).map((t) => <span key={t} style={{ left: (t / TOTAL) * 100 + "%" }}>{t}</span>)}
          <span style={{ left: "100%" }}>{TOTAL}</span>
        </div>
        <span />
      </div>
    </div>
  );
}

function Matrix() {
  const grid: Record<string, Record<string, number>> = {};
  let max = 0;
  ORDER.forEach((a) => { grid[a] = {}; ORDER.forEach((b) => { grid[a][b] = 0; }); });
  ROWS.forEach((r) => {
    if (grid[r.a.verdict] && grid[r.a.verdict][r.b.verdict] != null) max = Math.max(max, ++grid[r.a.verdict][r.b.verdict]);
  });
  return (
    <table className="data-table matrix">
      <thead><tr><th className="corner">A ↓ · B →</th>{ORDER.map((k) => <th scope="col" key={k}>{STATUS[k].short}</th>)}</tr></thead>
      <tbody>
        {ORDER.map((a) => (
          <tr key={a}>
            <th scope="row"><span className="key"><Swatch s={a} />{STATUS[a].short}</span></th>
            {ORDER.map((b) => {
              const v = grid[a][b];
              return (
                <td key={b} className={"cell" + (a === b ? " diag" : "")} data-v={v}
                  style={v ? { background: `color-mix(in oklab, var(--accent) ${max ? Math.round((v / max) * 38) : 0}%, var(--surface))` } : undefined}
                  data-tip={`Round A ${STATUS[a].en} → Round B ${STATUS[b].en}: ${v}`}>{v}</td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ConfidenceTable({ rnd }: { rnd: RoundKey }) {
  const cols: Verdict[] = ["correct", "partly", "wrong", "unverifiable", "declined", "unknown"];
  const levels = ["high", "medium", "low", ""];
  return (
    <table className="data-table">
      <thead><tr><th>Confidence</th>{cols.map((s) => <th key={s}>{STATUS[s].short}</th>)}<th>Tested</th></tr></thead>
      <tbody>
        {levels.map((lv) => {
          const rs = ROWS.filter((r) => r[rnd].verdict !== "untested" && (r[rnd].confidence || "") === lv);
          if (!lv && !rs.length) return null;
          return (
            <tr key={lv || "none"}>
              <th scope="row">{lv ? CONF[lv] : "Not stated"}</th>
              {cols.map((s) => <td key={s}>{rs.filter((r) => r[rnd].verdict === s).length}</td>)}
              <td>{rs.length}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function Summary() {
  useTitle("Summary");
  const check = DATA.meta.summaryCheck;
  const [cls, msg] = CHECK[check.status] || ["wait", "No comparison with the Summary tab was made."];
  const ca = DATA.counts.a, cb = DATA.counts.b;
  const ua = countBy("a").unverifiable || 0, ub = countBy("b").unverifiable || 0;
  const sheetRows: [Verdict, string][] = [["correct", "correct"], ["wrong", "wrong"], ["declined", "declined (answer exists)"], ["unknown", "declined (no answer exists)"], ["partly", "partly"]];

  return (
    <>
      <div className="page-head">
        <div className="wrap">
          <h1>Round A against Round B <span className="zh" lang="zh-Hant">兩輪結果統計</span></h1>
          <p>All numbers on this page are counted from the record sheet each time the site is rebuilt; none are typed in by hand.</p>
        </div>
      </div>
      <div className="wrap page-body">
        <div className={"notice " + cls} role="status">
          <span className="dot" aria-hidden="true" />
          <span>{msg}{check.status === "mismatch" ? check.detail + ". Check the verdict spellings and rebuild." : ""} <span className="muted">Data built {DATA.meta.built}.</span></span>
        </div>

        <section className="section section-tight">
          <div className="chart-card">
            <h3>Verdicts for all {TOTAL} forms of address</h3>
            <p className="sub">Each bar is one round; each segment is one verdict. Hover or focus a segment for its count.</p>
            <div className="legend legend-tight">
              {ORDER.map((s) => <span key={s}><Swatch s={s} />{STATUS[s].en} <span lang="zh-Hant">{STATUS[s].zh}</span></span>)}
            </div>
            <StackChart />
          </div>
        </section>

        <section className="section section-tight">
          <div className="section-head"><div>
            <h2>The Summary tab <span className="zh" lang="zh-Hant">統計表</span></h2>
            <p>Same rows and labels as the <em>Summary</em> tab of the record sheet.</p>
          </div></div>
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th scope="col">Measure</th><th scope="col">Condition A (title only)</th><th scope="col">Condition B (title + sources)</th></tr></thead>
              <tbody>
                {sheetRows.map(([k, label]) => (
                  <tr key={k}><th scope="row"><span className="key"><Swatch s={k} />{label}</span></th><td>{ca[k] || 0}</td><td>{cb[k] || 0}</td></tr>
                ))}
              </tbody>
              <tfoot><tr><th scope="row">total checked</th><td>{ca.total || 0}</td><td>{cb.total || 0}</td></tr></tfoot>
            </table>
          </div>
          {(ua > 0 || ub > 0) && (
            <p className="table-note">
              The sheet's <code>wrong</code> follows the strict rule and includes answers <Zh>箋校</Zh> cannot check, shown elsewhere on this site
              as <em>can't verify</em>: {ua} of {ca.wrong || 0} in Round A, {ub} of {cb.wrong || 0} in Round B. See <Link to="/method#verdicts">Method</Link>.
            </p>
          )}
        </section>

        <section className="section section-tight">
          <div className="section-head"><div>
            <h2>From Round A to Round B <span className="zh" lang="zh-Hant">前後對照</span></h2>
            <p>How each name's verdict changed once the AI had the full poem and sources. These came together, so a change cannot be traced to any one of them (see <Link to="/method#limits">Limits</Link>). Rows are the Round A verdict, columns the Round B verdict; the outlined diagonal means no change.</p>
          </div></div>
          <div className="table-scroll"><Matrix /></div>
        </section>

        <section className="section section-tight">
          <div className="section-head"><div>
            <h2>By the AI's stated confidence <span className="zh" lang="zh-Hant">信心與結果</span></h2>
            <p>Tested names only, grouped by the confidence the AI gave with each answer.</p>
          </div></div>
          <div className="grid-2">
            {ROUNDS.map(([k, name, zh]) => (
              <div key={k}>
                <h3 className="sub-head">{name} <span lang="zh-Hant">{zh.split(" · ")[0]}</span></h3>
                <div className="table-scroll"><ConfidenceTable rnd={k} /></div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
