import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { DATED, type Row } from "../lib/data";
import { confLabel } from "../lib/status";
import { eraYear, yearLabel } from "../lib/era";
import { Badge, MarkedTitle } from "./Badge";

function KV({ k, zh, v }: { k: string; zh?: string; v: ReactNode }) {
  return (
    <>
      <dt>{k}{zh && <> <span lang="zh-Hant">{zh}</span></>}</dt>
      {v ? <dd lang="zh-Hant">{v}</dd> : <dd className="empty">Not recorded yet</dd>}
    </>
  );
}

/** Both rounds, the 箋校 check and the poem for one form of address. */
export function EntryDetail({ row, permalink = true }: { row: Row; permalink?: boolean }) {
  return (
    <div className="detail-inner">
      <div>
        <h4>Round A <span>僅詩題</span> · title only</h4>
        <dl className="kv">
          <KV k="Answer" v={row.a.answer} />
          <KV k="Confidence" v={confLabel(row.a.confidence)} />
          <dt>Verdict</dt><dd><Badge s={row.a.verdict} raw={row.a.verdictRaw} /></dd>
        </dl>
        <h4>Round B <span>詩題＋史料</span> · title + sources</h4>
        <dl className="kv">
          <KV k="Answer" v={row.b.answer} />
          <KV k="Confidence" v={confLabel(row.b.confidence)} />
          <KV k="Sources the AI cited" v={row.b.sources} />
          <dt>Verdict</dt><dd><Badge s={row.b.verdict} raw={row.b.verdictRaw} /></dd>
        </dl>
        <h4>Checked against <span>白居易集箋校</span></h4>
        <dl className="kv">
          <KV k="Identification" v={row.jianjiao} />
          <KV k="Where" zh="卷·頁" v={row.locate} />
          <KV k="Year" zh="繫年" v={row.time && <>{yearLabel(row.time)}{eraYear(row.time.from) && " · " + eraYear(row.time.from)}{DATED.includes(row) && <> <Link to={"/?n=" + row.n} lang="en">on the timeline</Link></>}</>} />
          <KV k="Bai Juyi at" v={row.baiAt && <>{row.baiAt}{row.baiAtFrom === "career" && <span lang="en" className="muted"> (from his postings that year)</span>}</>} />
          <KV k="Addressee's post" v={row.post} />
          <KV k="Addressee at" v={row.toAt} />
          <KV k="Notes" v={row.notes} />
        </dl>
        {permalink && (
          <p className="row-link">
            Page for this entry: <Link to={"/entry/" + row.n}>/entry/{row.n}</Link>
          </p>
        )}
      </div>
      <div>
        <h4>The poem <span>原詩</span></h4>
        {row.poem ? (
          <>
            <figure className="poem" lang="zh-Hant">
              <span className="ptitle"><MarkedTitle title={row.title} name={row.address} /></span>
              {row.poem.map((line, i) => <span className="pline" key={i}>{line}</span>)}
            </figure>
            <p className="poem-note">
              Text from the open <a href="https://github.com/chinese-poetry/chinese-poetry" rel="noopener">chinese-poetry</a> edition of 全唐詩, the same text the AI was given in Round B. It leaves out Bai Juyi's own notes (自注) and may differ from 箋校.
            </p>
          </>
        ) : (
          <p className="poem-note">Poem text not available.</p>
        )}
      </div>
    </div>
  );
}
