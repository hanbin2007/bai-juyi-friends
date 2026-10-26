// Tang reign eras (年號) across Bai Juyi's life. An era is counted from the first full year it covers.
export const ERAS = [
  { start: 785, zh: "貞元", en: "Zhenyuan" },
  { start: 805, zh: "永貞", en: "Yongzhen" },
  { start: 806, zh: "元和", en: "Yuanhe" },
  { start: 821, zh: "長慶", en: "Changqing" },
  { start: 825, zh: "寶曆", en: "Baoli" },
  { start: 827, zh: "大和", en: "Dahe" },
  { start: 836, zh: "開成", en: "Kaicheng" },
  { start: 841, zh: "會昌", en: "Huichang" },
];

const DIGITS = "〇一二三四五六七八九";
const zhNumber = (n: number) =>
  n < 10 ? DIGITS[n] : (n >= 20 ? DIGITS[Math.floor(n / 10)] : "") + "十" + (n % 10 ? DIGITS[n % 10] : "");

export const eraOf = (year: number) => [...ERAS].reverse().find((e) => year >= e.start) || ERAS[0];

/** 833 -> "大和七年"; the first year of an era is 元年. Empty before 785, the first era listed. */
export function eraYear(year: number) {
  if (year < ERAS[0].start) return "";
  const e = eraOf(year), n = year - e.start + 1;
  return e.zh + (n === 1 ? "元" : zhNumber(n)) + "年";
}

/** "833", "833?" or "831–833" for display. */
export const yearLabel = (t: { from: number; to: number; circa: boolean }) =>
  (t.from === t.to ? String(t.from) : t.from + "–" + t.to) + (t.circa ? "?" : "");
