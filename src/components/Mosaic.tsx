import { Link } from "react-router-dom";
import { ROWS, type Row } from "../lib/data";
import { STATUS } from "../lib/status";

/** One tile per form of address; the two bars are the Round A and Round B verdicts. */
export function Mosaic({ visible, onPoint }: { visible: (r: Row) => boolean; onPoint: (r: Row | null) => void }) {
  return (
    <div className="mosaic">
      {ROWS.map((row) => {
        const label = `${row.n}. ${row.address}: Round A ${STATUS[row.a.verdict].en}, Round B ${STATUS[row.b.verdict].en}`;
        return (
          <Link
            key={row.n}
            to={"/entry/" + row.n}
            className={"tile" + (visible(row) ? "" : " dim")}
            aria-label={label}
            data-tip={`${row.n}. ${row.address} · ${row.title}\nRound A: ${STATUS[row.a.verdict].en}\nRound B: ${STATUS[row.b.verdict].en}`}
            onMouseEnter={() => onPoint(row)}
            onFocus={() => onPoint(row)}
            onMouseLeave={() => onPoint(null)}
            onBlur={() => onPoint(null)}
          >
            <span className="num">{row.n}</span>
            <span className={"name" + (row.address.length >= 4 ? " long" : "")} lang="zh-Hant">{row.address}</span>
            <span className="bars">
              <span className="bar">A<i data-s={row.a.verdict} /></span>
              <span className="bar">B<i data-s={row.b.verdict} /></span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
