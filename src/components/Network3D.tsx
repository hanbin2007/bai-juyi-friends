import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { POEM_COUNT, ROWS, TOTAL } from "../lib/data";
import { mountNetwork } from "../three/network";

export function Network3D() {
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  useEffect(() => mountNetwork(ref.current!, ROWS, (n) => navigate("/entry/" + n)), [navigate]);
  return (
    <figure className="net-figure">
      <div className="net3d" ref={ref} />
      <figcaption className="net-caption">
        <span className="net-key"><i className="k-centre" />Bai Juyi</span>
        <span className="net-key"><i className="k-poem" />{POEM_COUNT} poems</span>
        <span className="net-key"><i className="k-name" />{TOTAL} names · fill = Round A, ring = Round B</span>
        <span className="net-hint">Drag to turn · select a name to open it</span>
      </figcaption>
    </figure>
  );
}
