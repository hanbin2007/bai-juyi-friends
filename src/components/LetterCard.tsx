import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ROWS, TOTAL, type Row } from "../lib/data";

const PER = 14;   // characters per column
const NCOLS = 8;  // 八行箋: eight columns

type Piece = { text: string; name?: boolean };

// Split a title into columns of at most PER characters without breaking the name.
function columns(row: Row): Piece[][] {
  const t = row.title, a = row.address, at = a ? t.indexOf(a) : -1;
  const out: Piece[][] = [];
  let cur: Piece[] = [], len = 0, k = 0;
  const push = () => { if (cur.length) out.push(cur); cur = []; len = 0; };
  while (k < t.length) {
    if (k === at) {
      if (len + a.length > PER) push();
      cur.push({ text: a, name: true }); len += a.length; k += a.length;
    } else {
      const last = cur[cur.length - 1];
      if (last && !last.name) last.text += t[k]; else cur.push({ text: t[k] });
      len++; k++;
    }
    if (len >= PER) push();
  }
  push();
  return out;
}

/** Eight-column letter paper with one title written in vertical columns.
 *  With `row` it shows that row; otherwise it cycles through all rows. */
export function LetterCard({ row, hold }: { row?: Row; hold?: Row | null }) {
  const [i, setI] = useState(0);
  const [fading, setFading] = useState(false);
  const cycling = !row && !hold;

  useEffect(() => {
    if (!cycling || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let t2: number;
    const t = window.setInterval(() => {
      setFading(true);
      t2 = window.setTimeout(() => { setI((v) => (v + 1) % TOTAL); setFading(false); }, 450);
    }, 5200);
    return () => { clearInterval(t); clearTimeout(t2); };
  }, [cycling]);

  const shown = row || hold || ROWS[i];
  if (!shown) return null;
  const cols = columns(shown).slice(0, NCOLS - 1);
  while (cols.length < NCOLS - 1) cols.push([]);

  return (
    <div className="letter-wrap">
      <div className={"letter" + (fading ? " fading" : "")} aria-hidden="true">
        <div className="letter-cols">
          {cols.map((c, j) => (
            <div className="letter-col" key={j}>
              {c.map((p, q) => (p.name ? <span className="pn" key={q}>{p.text}</span> : <span key={q}>{p.text}</span>))}
            </div>
          ))}
          <div className="letter-col meta">白居易　箋校{shown.locate}</div>
        </div>
        <span className="stamp">樂天</span>
      </div>
      {!row && (
        <p className="letter-caption">
          No. {shown.n} of {TOTAL} · <span lang="zh-Hant">{shown.address}</span> · <Link to={"/entry/" + shown.n}>Open this entry</Link>
        </p>
      )}
    </div>
  );
}
