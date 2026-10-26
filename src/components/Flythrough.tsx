import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { POEM_COUNT, TOTAL } from "../lib/data";

interface Cap { zh: string; title: string; body: ReactNode; links?: (tab: number | undefined) => ReactNode }

const NAMES = (tab: number | undefined) => (
  <>
    <Link to="/entry/11" lang="zh-Hant" tabIndex={tab}>牛二</Link>
    <Link to="/entry/12" lang="zh-Hant" tabIndex={tab}>李七</Link>
    <Link to="/entry/13" lang="zh-Hant" tabIndex={tab}>庾三十二</Link>
  </>
);

const CAPTIONS: Cap[] = [
  { zh: "江州", title: "Jiujiang, 815", body: <>Demoted to marshal (<span lang="zh-Hant">司馬</span>) of Jiangzhou, Bai Juyi came to this stretch of the Yangtze. Scroll to fly south over the real terrain.</> },
  { zh: "廬山", title: "Mount Lu", body: <>The mountain rises between the Yangtze and Poyang Lake. The relief is real survey elevation data, drawn here in ink.</> },
  { zh: "草堂", title: "The thatched cottage, 817", body: <>On the north side of the mountain, between Xianglu Peak (<span lang="zh-Hant">香爐峰</span>) and Yiai Temple (<span lang="zh-Hant">遺愛寺</span>), he built a thatched cottage. Its exact site is uncertain.</> },
  {
    zh: "寄", title: "Letters from the mountain",
    body: <>There he wrote <span lang="zh-Hant">廬山草堂夜雨獨宿寄<span className="pn">牛二</span><span className="pn">李七</span><span className="pn">庾三十二</span>員外</span>, sent to three friends named only by sibling rank.</>,
    links: NAMES,
  },
  { zh: "鄱陽湖", title: "Poyang Lake", body: <>Who were they? The record below follows {TOTAL} such names in {POEM_COUNT} poems.</>, links: (tab) => <a href="#names" tabIndex={tab}>See the names</a> },
];

/** Scroll-driven flight over Mount Lu. three.js and the terrain load only when the section comes near. */
export function Flythrough() {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const section = sectionRef.current!, canvas = canvasRef.current!;
    let cleanup: (() => void) | null = null, cancelled = false;
    const io = new IntersectionObserver((en) => {
      if (!en[0].isIntersecting) return;
      io.disconnect();
      import("../three/flythrough")
        .then((m) => m.mountFlythrough(section, canvas))
        .then((c) => { if (cancelled) c(); else cleanup = c; })
        .catch((err) => { console.warn("Flythrough unavailable:", err); if (!cancelled) setFallback(true); });
    }, { rootMargin: "120% 0px" });
    io.observe(section);
    return () => { cancelled = true; io.disconnect(); cleanup?.(); };
  }, []);

  return (
    <section className={"fly" + (fallback ? " fly-static" : "")} id="journey" aria-label="A flight over Mount Lu" ref={sectionRef}>
      {/* The full narration for screen readers and keyboard users; the animated captions below repeat it visually.
          Without WebGL the captions are shown as a plain list instead, so this copy is dropped. */}
      {!fallback && <div className="sr-only">
        <h2>A flight over Mount Lu</h2>
        <ol>
          {CAPTIONS.map((c) => (
            <li key={c.zh}><h3><span lang="zh-Hant">{c.zh}</span> {c.title}</h3><p>{c.body}</p>{c.links && <p>{c.links(undefined)}</p>}</li>
          ))}
        </ol>
      </div>}
      <div className="fly-stage">
        <canvas id="fly-canvas" aria-hidden="true" ref={canvasRef} />
        <div className="fly-labels" aria-hidden="true" />
        <p className="fly-loading" aria-hidden="true">Loading the terrain of Mount Lu…</p>
        <div className="fly-captions" aria-hidden={!fallback}>
          {CAPTIONS.map((c) => (
            <article className="fly-cap" key={c.zh}>
              <h2><span lang="zh-Hant">{c.zh}</span> {c.title}</h2>
              <p>{c.body}</p>
              {c.links && <p className="fly-names">{c.links(fallback ? undefined : -1)}</p>}
            </article>
          ))}
          <article className="fly-cap" />
        </div>
        <div className="fly-progress" aria-hidden="true"><i /></div>
        <p className="fly-credit">
          <span className="long">Elevation: SRTM terrain data courtesy of the U.S. Geological Survey, via AWS Terrain Tiles · heights ×1.5 · contours every 100 m · water read from the elevation data · place sources on the About page</span>
          <span className="short">Elevation: SRTM (USGS) · heights ×1.5</span>
        </p>
      </div>
    </section>
  );
}
