import { forwardRef, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { PLACES, type Round, type Row } from "../lib/data";
import { eraYear, yearLabel } from "../lib/era";
import { BY_TIME, groupFinding, groupOf } from "../lib/groups";
import { confLabel } from "../lib/status";
import { Badge, MarkedTitle } from "./Badge";

const Place = ({ name }: { name: string }) => (
  <><b lang="zh-Hant">{name}</b>{PLACES[name] && <span> {PLACES[name].en}</span>}</>
);

function RoundCard({ k, zh, en, r }: { k: string; zh: string; en: string; r: Round }) {
  return (
    <div className="card ep-round">
      <p className="ep-round-head"><b>{k}</b> <span lang="zh-Hant">{zh}</span><small>{en}</small></p>
      {r.answer
        ? <p className="ep-round-ans" lang="zh-Hant">{r.answer}</p>
        : <p className="ep-round-ans none">{r.verdict === "untested" ? "Not run yet" : "No name given"}</p>}
      <div className="ep-round-meta">
        <Badge s={r.verdict} raw={r.verdictRaw} />
        {r.confidence && <span className="conf" data-tip="Confidence the AI stated">{confLabel(r.confidence)}</span>}
      </div>
    </div>
  );
}

function Section({ title, zh, children }: { title: string; zh?: string; children: ReactNode }) {
  return (
    <section className="ep-sec">
      <h3 className="eyebrow">{title}{zh && <> <span lang="zh-Hant">{zh}</span></>}</h3>
      {children}
    </section>
  );
}

interface Props { row: Row; onClose: () => void; onPick: (n: string) => void }

/** One name's details, floating beside the timeline. */
export const EntryPanel = forwardRef<HTMLElement, Props>(function EntryPanel({ row, onClose, onPick }, ref) {
  const i = BY_TIME.indexOf(row), prev = BY_TIME[i - 1], next = BY_TIME[i + 1];
  const group = groupOf(row), finding = group && groupFinding(group);
  const away = row.toAt && row.toAt !== row.baiAt;

  return (
    <aside className="ep glass glass-strong" ref={ref} tabIndex={-1} aria-labelledby="ep-name">
      <header className="ep-head">
        <div className="ep-nav">
          <button type="button" className="icon-btn icon-btn-sm" disabled={!prev} onClick={() => prev && onPick(prev.n)}
            aria-label={prev ? `Earlier: ${prev.address}` : "No earlier name"} data-tip={prev ? `Earlier · ${prev.address} (${yearLabel(prev.time!)})` : undefined}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3L5 8l5 5" /></svg>
          </button>
          <button type="button" className="icon-btn icon-btn-sm" disabled={!next} onClick={() => next && onPick(next.n)}
            aria-label={next ? `Later: ${next.address}` : "No later name"} data-tip={next ? `Later · ${next.address} (${yearLabel(next.time!)})` : undefined}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3l5 5-5 5" /></svg>
          </button>
          <span className="ep-count">{i >= 0 ? <>{i + 1} <span>of {BY_TIME.length} in time</span></> : <>No. {row.n}</>}</span>
        </div>
        <button type="button" className="icon-btn icon-btn-sm icon-btn-quiet" onClick={onClose} aria-label="Close the details">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
        </button>
      </header>

      <div className="ep-body" key={row.n}>
        <p className="eyebrow eyebrow-time ep-when">
          <span>No. {row.n}</span>
          {row.time && <span>{yearLabel(row.time)}{eraYear(row.time.from) && <> · <span lang="zh-Hant">{eraYear(row.time.from)}</span></>}</span>}
        </p>
        <h2 className="ep-name" id="ep-name" lang="zh-Hant">{row.address}</h2>
        <p className="ep-title" lang="zh-Hant"><MarkedTitle title={row.title} name={row.address} /></p>

        <ol className={"card-inset ep-route" + (away ? "" : " same")}>
          <li className="bai">
            <i aria-hidden="true" />
            <div><Place name={row.baiAt} /><small>Bai Juyi{row.baiAtFrom === "career" ? ", from his postings that year" : ""}</small></div>
          </li>
          {away ? (
            <li className="to">
              <i aria-hidden="true" />
              <div><Place name={row.toAt} /><small>The addressee{row.post && <>, <span lang="zh-Hant">{row.post}</span></>}</small></div>
            </li>
          ) : row.post ? (
            <li className="to here">
              <i aria-hidden="true" />
              <div><small>The addressee, in the same place: <span lang="zh-Hant">{row.post}</span></small></div>
            </li>
          ) : null}
        </ol>

        <Section title="Who it was, in 箋校">
          <div className={"card-mark ep-id" + (row.jianjiao ? "" : " empty")}>
            {row.jianjiao ? <p lang="zh-Hant">{row.jianjiao}</p> : <p>Not recorded yet</p>}
            {row.locate && <small lang="zh-Hant">白居易集箋校 {row.locate}</small>}
          </div>
        </Section>

        <Section title="The AI's answers">
          <div className="ep-rounds">
            <RoundCard k="Round A" zh="僅詩題" en="title only" r={row.a} />
            <RoundCard k="Round B" zh="詩題＋史料" en="title + sources" r={row.b} />
          </div>
          {row.b.sources && (
            <details className="ep-more">
              <summary>Sources the AI cited in Round B</summary>
              <p lang="zh-Hant">{row.b.sources}</p>
            </details>
          )}
        </Section>

        {group && finding && (
          <Section title={`The same name in ${group.length} titles`}>
            <p className={"tl-finding " + finding.cls}>{finding.text}</p>
            <ul className="ep-kin">
              {group.map((r) => (
                <li key={r.n}>
                  <button type="button" aria-current={r === row || undefined} onClick={() => onPick(r.n)} disabled={r === row}>
                    <b>No. {r.n}</b> {r.time ? yearLabel(r.time) : "undated"}
                    {r.jianjiao && <span lang="zh-Hant">{r.jianjiao}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title="The poem" zh="原詩">
          {row.poem ? (
            <>
              <figure className="poem" lang="zh-Hant">
                {row.poem.map((line, j) => <span className="pline" key={j}>{line}</span>)}
              </figure>
              <p className="poem-note">From the open chinese-poetry edition of 全唐詩, the text the AI was given in Round B; it leaves out Bai Juyi's own notes.</p>
            </>
          ) : <p className="poem-note">Poem text not available.</p>}
        </Section>

        {row.notes && (
          <Section title="Notes">
            <p className="ep-notes" lang="zh-Hant">{row.notes}</p>
          </Section>
        )}
      </div>

      <footer className="ep-foot">
        <Link to={"/entry/" + row.n}>Open the full entry page <span aria-hidden="true">→</span></Link>
      </footer>
    </aside>
  );
});
