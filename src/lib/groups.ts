// Forms of address that occur in more than one title, and what 箋校 says about them.
import { DATED, ROWS, type Row } from "./data";

/** Groups of rows that share a form of address, in the order of the record. */
export const GROUPS = [...new Set(ROWS.map((r) => r.address))]
  .map((a) => ROWS.filter((r) => r.address === a))
  .filter((g) => g.length > 1);

export const groupOf = (row: Row) => GROUPS.find((g) => g.includes(row)) || null;

export function groupFinding(g: Row[]) {
  const ids = g.map((r) => r.jianjiao);
  if (ids.some((x) => !x)) return { cls: "open", text: "Not yet checked in 箋校" };
  return new Set(ids).size === 1
    ? { cls: "same", text: "One person in every title (箋校)" }
    : { cls: "different", text: `${new Set(ids).size} different people (箋校)` };
}

export const UNDATED = ROWS.filter((r) => !DATED.includes(r));

const mid = (r: Row) => (r.time!.from + r.time!.to + 1) / 2;
/** The names on the timeline in order of time, then of the record. */
export const BY_TIME = [...DATED].sort((a, b) => mid(a) - mid(b) || Number(a.n) - Number(b.n));
export const midYear = mid;
