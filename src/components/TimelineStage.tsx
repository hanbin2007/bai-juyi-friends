import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CAREER, DATED, PLACES, TOTAL, rowByN } from "../lib/data";
import { eraYear, yearLabel } from "../lib/era";
import { BY_TIME } from "../lib/groups";
import { barShare, T0, T1 } from "../lib/timelineScale";
import type { TimelineHandle, ViewState } from "../three/timeline";
import { EntryPanel } from "./EntryPanel";
import { PlayGlyph, TimeBar } from "./TimeBar";

const stations = CAREER.stations;
const stationAt = (year: number) => {
  for (let i = stations.length - 1; i >= 0; i--) if (year >= stations[i].from - 0.15) return i;
  return 0;
};

const Icon = ({ d, fill }: { d: string; fill?: boolean }) => (
  <svg viewBox="0 0 20 20" aria-hidden="true" className={fill ? "fill" : undefined}><path d={d} /></svg>
);
const ICONS = {
  follow: "M4 16c3-1 3-5 6-6s3-5 6-6M4 16h0M16 4h0M10 10m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0",
  overview: "M3 7l7-3.5L17 7l-7 3.5zM3 10.5L10 14l7-3.5M3 14l7 3.5 7-3.5",
  plus: "M10 4.5v11M4.5 10h11",
  minus: "M4.5 10h11",
  full: "M3.5 8V3.5H8M12 3.5h4.5V8M16.5 12v4.5H12M8 16.5H3.5V12",
  exit: "M8 3.5V8H3.5M16.5 8H12V3.5M12 16.5V12h4.5M3.5 12H8v4.5",
  help: "M7.6 7.4a2.5 2.5 0 1 1 3.6 2.3c-.8.4-1.2.9-1.2 1.8v.5M10 14.8v.2",
};

function Tool({ label, tip, pressed, onClick, children }: { label: string; tip: string; pressed?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="icon-btn icon-btn-quiet" aria-label={label} aria-pressed={pressed} data-tip={tip} onClick={onClick}>{children}</button>
  );
}

/** The home page's 3D timeline: the scene, the year in view, the tools, the time bar and the details panel. */
export function TimelineStage() {
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const yearRef = useRef<HTMLSpanElement>(null);
  const eraRef = useRef<HTMLSpanElement>(null);
  const whereRef = useRef<HTMLSpanElement>(null);
  const capsRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const welcomeRef = useRef<HTMLElement>(null);
  const helpRef = useRef<HTMLElement>(null);
  const handle = useRef<TimelineHandle | null>(null);
  const yearNow = useRef<number>(T0);

  const [params, setParams] = useSearchParams();
  const selected = rowByN(params.get("n") ?? undefined) ?? null;
  const [ready, setReady] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [view, setView] = useState<ViewState>({ following: true, playing: false });
  const [far, setFar] = useState(false);
  const [welcome, setWelcome] = useState(() => !params.get("n"));
  const [help, setHelp] = useState(false);
  const [full, setFull] = useState(false);

  // the scene calls back into the page, which may have re-rendered since: keep the latest setters in refs
  const choose = useRef<(n: string | null) => void>(() => {});
  choose.current = (n) => {
    const next = new URLSearchParams(params);
    if (n) next.set("n", n); else next.delete("n");
    setParams(next, { replace: true, preventScrollReset: true });
  };
  const pick = useCallback((n: string | null) => choose.current(n), []);

  useEffect(() => {
    const section = sectionRef.current!, host = hostRef.current!;
    const caps = Array.from(capsRef.current!.querySelectorAll<HTMLElement>(".tl-cap"));
    const signal = { cancelled: false };
    let lastYear = -1, lastStation = -1, lastFar = false;
    // three.js loads only on this page
    import("../three/timeline")
      .then((m) => m.mountTimeline(section, host, {
        rows: DATED, places: PLACES, stations, intro: !params.get("n"),
        onSelect: (n) => choose.current(n),
        onInteract: () => setWelcome(false),
        onView: setView,
        // runs every frame: write to the DOM directly rather than re-render
        onFrame: (year, zoomOut) => {
          yearNow.current = year;
          const isFar = zoomOut > 0.5, y = Math.min(T1 - 1, Math.floor(year)), st = stationAt(year);
          if (isFar !== lastFar) { lastFar = isFar; setFar(isFar); lastYear = -1; }
          if (y !== lastYear || st !== lastStation) {
            lastYear = y; lastStation = st;
            const s = stations[st];
            if (yearRef.current) yearRef.current.textContent = isFar ? `${T0}–${T1 - 1}` : String(y);
            if (eraRef.current) eraRef.current.textContent = isFar ? "" : eraYear(y);
            if (whereRef.current) whereRef.current.textContent = isFar ? "All 47 years at once" : `Bai Juyi at ${s.place} ${PLACES[s.place]?.en ?? ""}`;
            caps.forEach((c) => c.classList.toggle("on", c.dataset.overview ? isFar : !isFar && Number(c.dataset.i) === st));
            const tr = trackRef.current;
            if (tr) {
              tr.setAttribute("aria-valuenow", String(y));
              tr.setAttribute("aria-valuetext", `${y}, ${eraYear(y)}`);
              const label = tr.querySelector(".tb-thumb span");
              if (label) label.textContent = String(y);
            }
          }
          trackRef.current?.style.setProperty("--at", (barShare(year) * 100).toFixed(3) + "%");
        },
      }, signal))
      .then((h) => { if (signal.cancelled) h.destroy(); else { handle.current = h; setReady(true); } })
      .catch((err) => {
        if (signal.cancelled) return;   // left the page while loading (mountTimeline rejects with Cancelled)
        console.warn("Timeline unavailable:", err);
        setFallback(true);
      });
    return () => { signal.cancelled = true; handle.current?.destroy(); handle.current = null; };
  }, []);

  // ?n=9 holds entry 9 in focus, flies to it and opens its details; the first one after a deep link is instant
  const firstSelect = useRef(true);
  const n = selected?.n ?? null;
  useEffect(() => {
    if (!ready) return;
    handle.current?.select(n, firstSelect.current);
    firstSelect.current = false;
    if (!n) return;
    setWelcome(false);
    // reached from a link further down the page: bring the stage back into view, just under the header
    const top = sectionRef.current!.getBoundingClientRect().top;
    const under = document.querySelector(".site-header")?.getBoundingClientRect().bottom ?? 0;
    if (Math.abs(top - under) > 40)
      scrollTo({ top: top + scrollY - under, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [n, ready]);

  // keep the scene centred in the part of the stage the welcome text, the panel and the time bar leave free
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage || !ready) return;
    const measure = () => {
      const p = panelRef.current, bar = barRef.current, wc = welcomeRef.current, w = stage.clientWidth, h = stage.clientHeight;
      let l = 0, r = 0, b = h - (bar ? bar.offsetTop : h), t = 0;
      if (p) {
        if (p.offsetWidth > w * 0.7) b = Math.max(b, h - p.offsetTop);   // a sheet along the bottom
        else r = w - p.offsetLeft;
      }
      // the welcome text stands beside the scene on a wide screen, above it on a phone
      if (welcome && wc) { if (wc.offsetWidth < w * 0.6) l = wc.offsetLeft + wc.offsetWidth; else t = wc.offsetTop + wc.offsetHeight; }
      handle.current?.setInset(l, r, b, t);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [ready, n, welcome]);

  // the panel takes focus when it opens, so a keyboard or screen reader lands on the details; it takes it
  // back when switching entries removed the focused button (the panel's body is rebuilt for each entry)
  const wasOpen = useRef(false);
  useEffect(() => {
    if (n && (!wasOpen.current || document.activeElement === document.body)) panelRef.current?.focus({ preventScroll: true });
    wasOpen.current = !!n;
  }, [n]);

  // the hidden welcome text must not hold focus or catch clicks (React 18 has no `inert` prop)
  useEffect(() => { if (welcomeRef.current) welcomeRef.current.inert = !welcome; }, [welcome]);
  useEffect(() => { if (helpRef.current) helpRef.current.inert = !help; }, [help]);

  useEffect(() => {
    const on = () => setFull(document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);

  const h = () => handle.current;
  const close = () => { pick(null); stageRef.current?.focus({ preventScroll: true }); };
  const togglePlay = () => { setWelcome(false); h()?.play(!view.playing); };
  const toggleFar = () => { setWelcome(false); if (far) h()?.follow(); else h()?.overview(); };
  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else stageRef.current?.requestFullscreen?.().catch(() => {});
  };
  const step = (d: number) => {
    const i = selected ? BY_TIME.indexOf(selected) : -1;
    // with nothing selected, the first name from the present year onward (or back)
    const y = Math.floor(yearNow.current);
    const next = i >= 0 ? BY_TIME[i + d] : d > 0 ? BY_TIME.find((r) => r.time!.from >= y) : [...BY_TIME].reverse().find((r) => r.time!.from <= y);
    if (next) pick(next.n);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      if (selected) { e.preventDefault(); close(); } else if (help) setHelp(false); else if (welcome) setWelcome(false);
      return;
    }
    // the rest only when the stage itself has focus, so buttons and links inside keep their keys
    if (e.target !== stageRef.current || e.altKey || e.ctrlKey || e.metaKey) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const act: Record<string, () => void> = {
      ArrowUp: () => h()?.move({ year: 1 }), w: () => h()?.move({ year: 1 }),
      ArrowDown: () => h()?.move({ year: -1 }), s: () => h()?.move({ year: -1 }),
      PageUp: () => h()?.move({ year: 5 }), PageDown: () => h()?.move({ year: -5 }),
      Home: () => h()?.setYear(T0), End: () => h()?.setYear(T1),
      ArrowLeft: () => h()?.move({ yaw: 0.26 }), a: () => h()?.move({ yaw: 0.26 }),
      ArrowRight: () => h()?.move({ yaw: -0.26 }), d: () => h()?.move({ yaw: -0.26 }),
      q: () => h()?.move({ pitch: 0.15 }), e: () => h()?.move({ pitch: -0.15 }),
      "+": () => h()?.move({ zoom: 0.8 }), "=": () => h()?.move({ zoom: 0.8 }), "-": () => h()?.move({ zoom: 1.25 }),
      " ": togglePlay, f: () => h()?.follow(), o: toggleFar,
      "[": () => step(-1), "]": () => step(1), "?": () => setHelp((v) => !v),
    };
    const fn = act[k];
    if (!fn) return;
    e.preventDefault();
    setWelcome(false);
    fn();
  };

  return (
    <section className={"tl" + (fallback ? " tl-static" : "")} aria-label="Timeline of Bai Juyi's postings and the dated names" ref={sectionRef}>
      {/* Read by screen readers, shown when a keyboard reaches its buttons, and shown as a plain list
          when WebGL is not available */}
      <div className={fallback ? "wrap tl-list" : "sr-only tl-alt"}>
        <h2>Dated names, in order of time</h2>
        <ol>
          {BY_TIME.map((r) => (
            <li key={r.n}>
              {yearLabel(r.time!)}: {fallback
                ? <Link to={"/entry/" + r.n}><span lang="zh-Hant">{r.address}</span></Link>
                : <button type="button" className="link-btn" onClick={() => pick(r.n)}><span lang="zh-Hant">{r.address}</span></button>}, in <span lang="zh-Hant">{r.title}</span>.
              Bai Juyi at <span lang="zh-Hant">{r.baiAt}</span>{r.toAt && <>; addressee at <span lang="zh-Hant">{r.toAt}</span></>}.
            </li>
          ))}
        </ol>
      </div>

      <div
        className={"tl-stage" + (selected ? " has-panel" : "") + (welcome ? " has-welcome" : "") + (far ? " is-far" : "")}
        ref={stageRef} tabIndex={0} onKeyDown={onKey}
        aria-label="3D timeline. Arrow keys up and down move through time, left and right turn the view, plus and minus zoom, Space plays, O shows the whole span, square brackets step through the names."
      >
        <div className="tl-canvas" ref={hostRef}>
          {!ready && !fallback && <p className="tl-loading"><span lang="zh-Hant">展卷</span> Unrolling the scroll…</p>}
        </div>

        <p className="tl-hud" aria-hidden="true">
          <span className="tl-hud-year" ref={yearRef}>{T0}</span>
          <span className="tl-hud-era" lang="zh-Hant" ref={eraRef}>{eraYear(T0)}</span>
          <span className="tl-hud-where" ref={whereRef}>Bai Juyi at {stations[0].place} {PLACES[stations[0].place]?.en}</span>
        </p>

        <div className="tl-tools glass glass-sm" role="toolbar" aria-label="View">
          <Tool label="Follow Bai Juyi" tip="Follow Bai Juyi's thread (F)" pressed={view.following && !far} onClick={() => { setWelcome(false); h()?.follow(); }}><Icon d={ICONS.follow} /></Tool>
          <Tool label="See the whole span" tip={far ? "Back into the years (O)" : "See all 47 years at once (O)"} pressed={far} onClick={toggleFar}><Icon d={ICONS.overview} /></Tool>
          <span className="tl-tools-sep" aria-hidden="true" />
          <Tool label="Zoom in" tip="Zoom in (+, or pinch)" onClick={() => h()?.move({ zoom: 0.72 })}><Icon d={ICONS.plus} /></Tool>
          <Tool label="Zoom out" tip="Zoom out (−)" onClick={() => h()?.move({ zoom: 1.38 })}><Icon d={ICONS.minus} /></Tool>
          <span className="tl-tools-sep" aria-hidden="true" />
          {document.fullscreenEnabled && <Tool label={full ? "Leave full screen" : "Full screen"} tip={full ? "Leave full screen" : "Full screen"} pressed={full} onClick={toggleFull}><Icon d={full ? ICONS.exit : ICONS.full} /></Tool>}
          <Tool label="How to explore" tip="How to explore (?)" pressed={help} onClick={() => setHelp((v) => !v)}><Icon d={ICONS.help} /></Tool>
        </div>

        <div className="tl-veil" aria-hidden="true" />
        <article className={"tl-welcome" + (welcome ? " on" : "")} aria-hidden={!welcome} ref={welcomeRef}>
          <p className="eyebrow eyebrow-time tl-kicker">Through time and place <span lang="zh-Hant">時空長卷</span></p>
          <h1>Identifying Bai Juyi's Friends with AI and Historical Sources</h1>
          <p className="tl-welcome-zh" lang="zh-Hant">以 AI 與史料考白居易詩題中的友人</p>
          <p className="tl-welcome-lede">
            Tang poets named friends by surname and sibling rank: <span lang="zh-Hant" className="pn">元九</span>, “Yuan the Ninth”, is Yuan Zhen.
            Each of the {TOTAL} such names in Bai Juyi's poem titles hangs here in the year of its poem, along the indigo thread of his postings.
            Can an AI tell who they were?
          </p>
          <div className="tl-welcome-go">
            <button type="button" className="btn btn-primary" onClick={togglePlay}>
              <PlayGlyph /> Play the journey
            </button>
            <button type="button" className="btn" onClick={() => { setWelcome(false); h()?.move({}); }}>Explore freely</button>
          </div>
        </article>

        <aside className={"tl-help glass" + (help ? " on" : "")} aria-hidden={!help} aria-label="How to explore" ref={helpRef}>
          <p className="eyebrow">How to explore</p>
          <dl className="tl-hints">
            <div><dt>Scroll</dt><dd>through time</dd></div>
            <div><dt>Drag</dt><dd>turn the view</dd></div>
            <div><dt><span className="fine">Right-drag</span><span className="coarse">Two fingers</span></dt><dd>move across</dd></div>
            <div><dt><span className="fine">Ctrl + scroll</span><span className="coarse">Pinch</span></dt><dd>zoom</dd></div>
            <div><dt>Select a name</dt><dd>its details</dd></div>
          </dl>
          <ul className="tl-legend">
            <li><i className="k-thread" />Bai Juyi's postings</li>
            <li><i className="k-letter" />to where the friend was</li>
            <li><i className="k-name" />fill = Round A, ring = Round B</li>
          </ul>
        </aside>

        <div className="tl-caps" aria-hidden="true" ref={capsRef}>
          {stations.map((s, i) => (
            <article className="tl-cap glass" key={i} data-i={i}>
              <p className="eyebrow eyebrow-time tl-cap-kicker">
                Posting {i + 1} of {stations.length} · {Math.floor(s.from)}–{Math.floor(s.to)}
                <span className="tl-steps">{stations.map((_, j) => <i key={j} className={j === i ? "on" : j < i ? "past" : ""} />)}</span>
              </p>
              <h2><span lang="zh-Hant">{s.place}</span> {PLACES[s.place]?.en}</h2>
              <p className="tl-cap-post" lang="zh-Hant">{s.post}</p>
              <p className="tl-cap-en">{s.en}</p>
            </article>
          ))}
          <article className="tl-cap glass" data-overview="1">
            <p className="eyebrow eyebrow-time tl-cap-kicker">The whole span</p>
            <h2>800–846, earliest first</h2>
            <p className="tl-cap-en">Dashed red links join the same form of address in different titles when <span lang="zh-Hant">箋校</span> names different people; solid links mean the same person.</p>
          </article>
        </div>

        <div className="tl-bar" ref={barRef}>
          <TimeBar ref={trackRef} selected={n} playing={view.playing} onPlay={togglePlay} getYear={() => yearNow.current}
            onScrub={(y, instant) => { setWelcome(false); h()?.setYear(y, instant); }} onPick={pick} />
        </div>

        {selected && <EntryPanel ref={panelRef} row={selected} onClose={close} onPick={pick} />}
      </div>
    </section>
  );
}
