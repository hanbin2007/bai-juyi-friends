import { Fragment, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ROWS, TOTAL, type Round, type Row } from "../lib/data";
import { ORDER, STATUS, confLabel } from "../lib/status";
import { Badge, MarkedTitle, Swatch } from "./Badge";
import { EntryDetail } from "./EntryDetail";
import type { Filters } from "../lib/filters";
import { matches, statusCounts } from "../lib/filters";

function RoundCell({ r, label }: { r: Round; label: string }) {
  return (
    <td className="c-round" data-label={label}>
      {r.answer ? <div className="ans" lang="zh-Hant">{r.answer}</div> : r.verdict !== "untested" ? <div className="ans empty">No name given</div> : null}
      <div className="meta-line">
        {r.confidence && <span className="conf" data-tip="Confidence the AI stated">{confLabel(r.confidence)}</span>}
        <Badge s={r.verdict} raw={r.verdictRaw} />
      </div>
    </td>
  );
}

export function FilterBar({ f, set }: { f: Filters; set: (p: Partial<Filters>) => void }) {
  const c = statusCounts(f.r);
  return (
    <div className="controls">
      <div className="controls-row">
        <label className="search">
          <span className="sr-only">Search names, titles and answers</span>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" /></svg>
          <input type="search" value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="Search a name, title or answer, e.g. 元九 or 劉" autoComplete="off" spellCheck={false} />
          {f.q && <button className="clear" type="button" aria-label="Clear search" onClick={() => set({ q: "" })}>×</button>}
        </label>
        <span className="segmented-label" id="round-label">Filter by</span>
        <div className="segmented" role="group" aria-labelledby="round-label">
          {([["either", "Either round"], ["a", "Round A"], ["b", "Round B"]] as const).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={f.r === k} onClick={() => set({ r: k })}>{l}</button>
          ))}
        </div>
      </div>
      <div className="chips" role="group" aria-label="Filter by verdict">
        <button className="chip" type="button" aria-pressed={f.s === "all"} onClick={() => set({ s: "all" })}>All <b>{TOTAL}</b></button>
        {ORDER.map((s) => (
          <button key={s} className="chip" type="button" aria-pressed={f.s === s} disabled={!c[s] && f.s !== s} onClick={() => set({ s: f.s === s ? "all" : s })}>
            <Swatch s={s} />{STATUS[s].en} <span lang="zh-Hant">{STATUS[s].zh}</span> <b>{c[s]}</b>
          </button>
        ))}
      </div>
    </div>
  );
}

export function RecordTable({ f, reset }: { f: Filters; reset: () => void }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const navigate = useNavigate();
  const shown = ROWS.filter((r) => matches(r, f));
  const toggle = (n: string) => setOpen((s) => { const x = new Set(s); if (x.has(n)) x.delete(n); else x.add(n); return x; });

  return (
    <>
      <p className="result-count" aria-live="polite">{shown.length === TOTAL ? `Showing all ${TOTAL} forms of address` : `Showing ${shown.length} of ${TOTAL}`}</p>
      {shown.length === 0 ? (
        <div className="empty-state">
          <p>No names match these filters.</p>
          <button className="btn" type="button" onClick={reset}>Clear filters</button>
        </div>
      ) : (
        <table className="record">
          <thead>
            <tr>
              <th scope="col" className="c-n">#</th>
              <th scope="col">Name<span lang="zh-Hant">稱謂</span></th>
              <th scope="col">Poem title<span lang="zh-Hant">詩題</span></th>
              <th scope="col">Round A · title only<span lang="zh-Hant">僅詩題</span></th>
              <th scope="col">Round B · with sources<span lang="zh-Hant">詩題＋史料</span></th>
              <th scope="col">箋校 says<span>卷·頁</span></th>
              <th scope="col" className="c-x"><span className="sr-only">Details</span></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row: Row) => {
              const isOpen = open.has(row.n);
              return (
                <Fragment key={row.n}>
                  <tr
                    className={"row" + (isOpen ? " open" : "")}
                    tabIndex={0}
                    aria-expanded={isOpen}
                    onClick={(e) => { if (!(e.target as HTMLElement).closest("a,button")) toggle(row.n); }}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(row.n); }
                      if (e.key === "o") navigate("/entry/" + row.n);
                    }}
                  >
                    <td className="c-n">{row.n}</td>
                    <td className="c-addr" data-label="Form of address 稱謂"><span className="addr" lang="zh-Hant" data-n={"No. " + row.n}>{row.address}</span></td>
                    <td className="c-title" data-label="Poem title 詩題"><span className="title" lang="zh-Hant"><MarkedTitle title={row.title} name={row.address} /></span></td>
                    <RoundCell r={row.a} label="Round A · title only" />
                    <RoundCell r={row.b} label="Round B · with sources" />
                    <td className="c-jj" data-label="箋校 identification">
                      {row.jianjiao ? <div className="jj" lang="zh-Hant">{row.jianjiao}</div> : <div className="jj empty">To be checked <span lang="zh-Hant">待核</span></div>}
                      <span className="loc">{row.locate}</span>
                    </td>
                    <td className="c-x">
                      <span className="toggle-ic" aria-hidden="true"><svg viewBox="0 0 16 16" width="14" height="14"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
                      <span className="sr-only">{isOpen ? "Hide details" : "Show details"}</span>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="detail"><td colSpan={7}><EntryDetail row={row} /></td></tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
