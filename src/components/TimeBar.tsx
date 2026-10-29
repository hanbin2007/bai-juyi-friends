import { forwardRef, useRef, type CSSProperties } from "react";
import { CAREER, PLACES } from "../lib/data";
import { ERAS, eraYear } from "../lib/era";
import { BY_TIME, midYear } from "../lib/groups";
import { STATUS } from "../lib/status";
import { barShare, barYear, T0, T1 } from "../lib/timelineScale";

// on the icons' 20px grid; filled, with the same 1.5px rounded joins (set in CSS) so the corners match their strokes.
// The triangle sits a little right of centre, where it looks centred.
export const PlayGlyph = () => <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6.5 4.75v10.5L15.6 10z" /></svg>;
const PauseGlyph = () => <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 4.75h2v10.5H6zM12 4.75h2v10.5h-2z" /></svg>;

const pct = (year: number) => (barShare(year) * 100).toFixed(3) + "%";

// eras that begin inside the bar, and the one already running at its start
const BAR_ERAS = ERAS.map((e, i) => ({ ...e, from: Math.max(e.start, T0), to: Math.min(ERAS[i + 1]?.start ?? T1, T1) }))
  .filter((e) => e.to > e.from);

// names stacked above their year: up to four high, then a second column beside the first
const DOTS = (() => {
  const seen = new Map<number, number>(), count = new Map<number, number>();
  BY_TIME.forEach((r) => { const y = Math.floor(midYear(r)); count.set(y, (count.get(y) || 0) + 1); });
  return BY_TIME.map((r) => {
    const y = Math.floor(midYear(r)), i = seen.get(y) || 0, cols = Math.ceil(count.get(y)! / 4);
    seen.set(y, i + 1);
    return { r, year: midYear(r), col: Math.floor(i / 4) - (cols - 1) / 2, row: i % 4 };
  });
})();

interface Props {
  selected: string | null;
  playing: boolean;
  onPlay: () => void;
  onScrub: (year: number, instant: boolean) => void;
  onPick: (n: string) => void;
  getYear: () => number;
}

/** The time bar: Bai Juyi's postings in indigo, each name above its year, the reign eras below.
 *  The parent moves the thumb every frame through the forwarded ref (the track; see `.tb-thumb`). */
export const TimeBar = forwardRef<HTMLDivElement, Props>(function TimeBar({ selected, playing, onPlay, onScrub, onPick, getYear }, ref) {
  const drag = useRef<{ id: number; x: number; moved: boolean; dot: string | null } | null>(null);
  const yearAt = (el: HTMLElement, x: number) => {
    const r = el.getBoundingClientRect();
    return barYear((x - r.left) / r.width);
  };

  return (
    <div className="tb glass">
      <button type="button" className="icon-btn icon-btn-play" onClick={onPlay} aria-label={playing ? "Pause the journey" : "Play the journey"} aria-pressed={playing}
        data-tip={playing ? "Pause (Space)" : "Travel through the years with Bai Juyi (Space)"}>
        {playing ? <PauseGlyph /> : <PlayGlyph />}
      </button>
      <span className="tb-end" aria-hidden="true">{T0}</span>
      <div
        className="tb-track" ref={ref} role="slider" tabIndex={0}
        aria-label="Year" aria-valuemin={T0} aria-valuemax={T1 - 1} aria-valuenow={T0} aria-valuetext={`${T0}, ${eraYear(T0)}`}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          const el = e.currentTarget, dot = (e.target as HTMLElement).closest<HTMLElement>(".tb-dot")?.dataset.n ?? null;
          el.setPointerCapture(e.pointerId);
          drag.current = { id: e.pointerId, x: e.clientX, moved: false, dot };
          if (!dot) onScrub(yearAt(el, e.clientX), false);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || d.id !== e.pointerId) return;
          if (!d.moved && Math.abs(e.clientX - d.x) < 4) return;
          d.moved = true;
          onScrub(yearAt(e.currentTarget, e.clientX), true);
        }}
        onPointerUp={() => {
          const d = drag.current;
          drag.current = null;
          if (d && !d.moved && d.dot) onPick(d.dot);
        }}
        onPointerCancel={() => { drag.current = null; }}
        onKeyDown={(e) => {
          const y = Math.floor(getYear());
          const to = ({ ArrowLeft: y - 1, ArrowDown: y - 1, ArrowRight: y + 1, ArrowUp: y + 1, PageDown: y - 5, PageUp: y + 5, Home: T0, End: T1 - 1 } as Record<string, number>)[e.key];
          if (to === undefined) return;
          e.preventDefault();
          e.stopPropagation();
          onScrub(Math.max(T0, Math.min(T1 - 1, to)) + 0.5, false);
        }}
      >
        <div className="tb-dots" aria-hidden="true">
          {DOTS.map(({ r, year, col, row }) => (
            <span
              key={r.n} data-n={r.n}
              className={"tb-dot" + (r.n === selected ? " on" : "")}
              style={{ left: pct(year), "--col": col, "--row": row, "--fa": `var(--s-${r.a.verdict})`, "--fb": `var(--s-${r.b.verdict})` } as CSSProperties}
              data-tip={`${r.address} · No. ${r.n} · ${Math.floor(year)}\nRound A: ${STATUS[r.a.verdict].en} · Round B: ${STATUS[r.b.verdict].en}`}
            />
          ))}
        </div>
        <div className="tb-line" aria-hidden="true">
          {CAREER.stations.map((s, i) => (
            <span key={i} className="tb-post" style={{ left: pct(s.from), width: `calc(${pct(s.to)} - ${pct(s.from)})` }}
              data-tip={`${s.place} ${PLACES[s.place]?.en ?? ""} · ${Math.floor(s.from)}–${Math.floor(s.to)}\n${s.post}`} />
          ))}
        </div>
        <div className="tb-eras" aria-hidden="true">
          {BAR_ERAS.map((e) => (
            <span key={e.start} className="tb-era" style={{ left: pct(e.from), width: `calc(${pct(e.to)} - ${pct(e.from)})` }} data-tip={`${e.zh} ${e.en}, from ${e.start}`}>
              <b lang="zh-Hant">{e.zh}</b>
            </span>
          ))}
        </div>
        <div className="tb-thumb" aria-hidden="true"><span>{T0}</span></div>
      </div>
      <span className="tb-end" aria-hidden="true">{T1 - 1}</span>
    </div>
  );
});
