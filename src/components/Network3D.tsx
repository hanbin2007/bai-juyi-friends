import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { POEM_COUNT, ROWS, TOTAL } from "../lib/data";
import { mountNetwork, type NetworkHandle } from "../three/network";

export function Network3D() {
  const ref = useRef<HTMLDivElement>(null);
  const handle = useRef<NetworkHandle | null>(null);
  const navigate = useNavigate();
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    handle.current = mountNetwork(ref.current!, ROWS, (n) => navigate("/entry/" + n));
    return () => { handle.current?.destroy(); handle.current = null; };
  }, [navigate]);
  useEffect(() => { handle.current?.setPaused(paused); }, [paused]);

  return (
    <figure className="net-figure">
      <div className="net3d" ref={ref} />
      <figcaption className="net-caption">
        <span className="net-key"><i className="k-centre" />Bai Juyi</span>
        <span className="net-key"><i className="k-poem" />{POEM_COUNT} poems</span>
        <span className="net-key"><i className="k-name" />{TOTAL} names · fill = Round A, ring = Round B</span>
        <span className="net-hint">
          Drag to turn · select a name to open it ·{" "}
          <button type="button" className="link-btn" aria-pressed={paused} onClick={() => setPaused(!paused)}>
            {paused ? "Resume motion" : "Pause motion"}
          </button>
        </span>
      </figcaption>
    </figure>
  );
}
