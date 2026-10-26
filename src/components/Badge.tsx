import type { Verdict } from "../lib/data";
import { STATUS } from "../lib/status";

const ICON: Partial<Record<Verdict, JSX.Element>> = {
  correct: <svg viewBox="0 0 16 16" width="9" height="9" aria-hidden="true"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  wrong: <svg viewBox="0 0 16 16" width="8" height="8" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>,
  partly: <svg viewBox="0 0 16 16" width="9" height="9" aria-hidden="true"><path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor" /><circle cx="8" cy="8" r="5.2" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>,
  declined: <svg viewBox="0 0 16 16" width="8" height="8" aria-hidden="true"><path d="M3.5 8h9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>,
  unknown: <span aria-hidden="true" style={{ fontSize: 10 }}>?</span>,
  other: <span aria-hidden="true">·</span>,
};

export function Badge({ s, raw }: { s: Verdict; raw?: string }) {
  const m = STATUS[s] || STATUS.other;
  const tip = m.tip + (s === "other" && raw ? " Recorded as: " + raw : "");
  return (
    <span className="badge" data-s={s} data-tip={tip}>
      <span className="ic">{ICON[s]}</span>
      {m.en} <span className="zh" lang="zh-Hant">{m.zh}</span>
    </span>
  );
}

// A colour key swatch (legends, chips, tables). Not-yet-tested is hatched.
export function Swatch({ s }: { s: Verdict }) {
  return <i data-s={s} className={s === "untested" ? "hatch" : undefined} />;
}

// The name inside a title, marked with the proper-name line (專名線).
export function MarkedTitle({ title, name }: { title: string; name: string }) {
  const i = name ? title.indexOf(name) : -1;
  if (i < 0) return <>{title}</>;
  return <>{title.slice(0, i)}<span className="pn">{name}</span>{title.slice(i + name.length)}</>;
}
