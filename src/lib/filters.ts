import { useSearchParams } from "react-router-dom";
import { ROWS, type Row, type Verdict } from "./data";
import { ORDER, STATUS, normalise } from "./status";

export interface Filters { q: string; s: Verdict | "all"; r: "either" | "a" | "b" }

const hay = new Map<Row, string>();
const haystack = (r: Row) => {
  let h = hay.get(r);
  if (!h) {
    h = normalise([r.n, r.title, r.address, r.a.answer, r.b.answer, r.b.sources, r.jianjiao, r.notes, r.locate].join("|"));
    hay.set(r, h);
  }
  return h;
};

const roundHas = (r: Row, rnd: Filters["r"], s: Verdict) =>
  rnd === "a" ? r.a.verdict === s : rnd === "b" ? r.b.verdict === s : r.a.verdict === s || r.b.verdict === s;

export function matches(r: Row, f: Filters) {
  if (f.s !== "all" && !roundHas(r, f.r, f.s)) return false;
  return !f.q || haystack(r).includes(normalise(f.q));
}

export function statusCounts(rnd: Filters["r"]) {
  const c = {} as Record<Verdict, number>;
  ORDER.forEach((s) => { c[s] = ROWS.filter((r) => roundHas(r, rnd, s)).length; });
  return c;
}

/** Filters live in the query string (?q=&status=&round=) so a filtered view can be linked. */
export function useFilters(): [Filters, (p: Partial<Filters>) => void, () => void] {
  const [params, setParams] = useSearchParams();
  const s = params.get("status") as Verdict | null;
  const r = params.get("round");
  const f: Filters = {
    q: params.get("q") || "",
    s: s && s in STATUS ? s : "all",
    r: r === "a" || r === "b" ? r : "either",
  };
  const set = (p: Partial<Filters>) => {
    const n = { ...f, ...p };
    const next = new URLSearchParams();
    if (n.q) next.set("q", n.q);
    if (n.s !== "all") next.set("status", n.s);
    if (n.r !== "either") next.set("round", n.r);
    setParams(next, { replace: true, preventScrollReset: true });
  };
  return [f, set, () => setParams(new URLSearchParams(), { replace: true, preventScrollReset: true })];
}
