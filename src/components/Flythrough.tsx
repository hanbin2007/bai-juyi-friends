import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { POEM_COUNT, TOTAL } from "../lib/data";

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
      <div className="fly-stage">
        <canvas id="fly-canvas" aria-hidden="true" ref={canvasRef} />
        <div className="fly-labels" aria-hidden="true" />
        <p className="fly-loading" aria-hidden="true">Loading the terrain of Mount Lu…</p>
        <div className="fly-captions">
          <article className="fly-cap">
            <h2><span lang="zh-Hant">江州</span> Jiujiang, 815</h2>
            <p>Demoted to marshal (<span lang="zh-Hant">司馬</span>) of Jiangzhou, Bai Juyi came to this stretch of the Yangtze. Scroll to fly south over the real terrain.</p>
          </article>
          <article className="fly-cap">
            <h2><span lang="zh-Hant">廬山</span> Mount Lu</h2>
            <p>The mountain rises between the Yangtze and Poyang Lake. The relief here is survey elevation data; the colours are satellite imagery.</p>
          </article>
          <article className="fly-cap">
            <h2><span lang="zh-Hant">草堂</span> The thatched cottage, 817</h2>
            <p>On the north side of the mountain, between Xianglu Peak (<span lang="zh-Hant">香爐峰</span>) and Yiai Temple (<span lang="zh-Hant">遺愛寺</span>), he built a thatched cottage. Its exact site is uncertain.</p>
          </article>
          <article className="fly-cap">
            <h2><span lang="zh-Hant">寄</span> Letters from the mountain</h2>
            <p>There he wrote <span lang="zh-Hant">廬山草堂夜雨獨宿寄<span className="pn">牛二</span><span className="pn">李七</span><span className="pn">庾三十二</span>員外</span>, sent to three friends named only by sibling rank.</p>
            <p className="fly-names">
              <Link to="/entry/11" lang="zh-Hant">牛二</Link>
              <Link to="/entry/12" lang="zh-Hant">李七</Link>
              <Link to="/entry/13" lang="zh-Hant">庾三十二</Link>
            </p>
          </article>
          <article className="fly-cap">
            <h2><span lang="zh-Hant">鄱陽湖</span> Poyang Lake</h2>
            <p>Who were they? The record below follows {TOTAL} such names in {POEM_COUNT} poems.</p>
            <p className="fly-names"><a href="#names">See the names</a></p>
          </article>
          <article className="fly-cap" />
        </div>
        <div className="fly-progress" aria-hidden="true"><i /></div>
        <p className="fly-credit">
          <span className="long">Elevation: SRTM (USGS) via AWS Terrain Tiles, height ×1.5 · Imagery: <a href="https://cloudless.eox.at">EOxCloudless</a> by EOX IT Services GmbH, contains modified Copernicus Sentinel data 2024, CC BY-NC-SA 4.0</span>
          <span className="short">SRTM (USGS), height ×1.5 · <a href="https://cloudless.eox.at">EOxCloudless</a> 2024, Copernicus Sentinel data, CC BY-NC-SA 4.0</span>
        </p>
      </div>
    </section>
  );
}
