import { Link, useParams } from "react-router-dom";
import { ROWS, TOTAL, rowByN } from "../lib/data";
import { MarkedTitle } from "../components/Badge";
import { EntryDetail } from "../components/EntryDetail";
import { LetterCard } from "../components/LetterCard";
import { useTitle } from "../lib/useTitle";
import { NotFound } from "./NotFound";

/** /entry/:n — one form of address, linkable from the essay. */
export function Entry() {
  const { n } = useParams();
  const row = rowByN(n);
  useTitle(row ? `No. ${row.n} ${row.address}` : "Entry not found");
  if (!row) return <NotFound />;
  const i = ROWS.indexOf(row);
  const prev = ROWS[i - 1], next = ROWS[i + 1];

  return (
    <>
      <div className="page-head">
        <div className="wrap">
          <p className="crumbs"><Link to="/">Record</Link> / Entry {row.n} of {TOTAL}</p>
          <h1 className="entry-name" lang="zh-Hant">{row.address}</h1>
          <p className="entry-title" lang="zh-Hant"><MarkedTitle title={row.title} name={row.address} /></p>
        </div>
      </div>
      <div className="wrap entry-layout">
        <LetterCard row={row} />
        <div className="entry-detail">
          <EntryDetail row={row} permalink={false} />
          <nav className="pager" aria-label="Other entries">
            {prev ? <Link to={"/entry/" + prev.n} rel="prev">← No. {prev.n} <span lang="zh-Hant">{prev.address}</span></Link> : <span />}
            <Link to={"/?q=" + encodeURIComponent(row.address)}>All entries for <span lang="zh-Hant">{row.address}</span></Link>
            {next ? <Link to={"/entry/" + next.n} rel="next">No. {next.n} <span lang="zh-Hant">{next.address}</span> →</Link> : <span />}
          </nav>
        </div>
      </div>
    </>
  );
}
