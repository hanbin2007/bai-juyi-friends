import type { Verdict } from "./data";

export const STATUS: Record<Verdict, { en: string; zh: string; short: string; tip: string }> = {
  correct: { en: "Correct", zh: "正確", short: "Correct", tip: "The AI named the person 箋校 identifies." },
  partly: { en: "Partly correct", zh: "部分正確", short: "Partly", tip: "The answer is partly right (see notes)." },
  wrong: { en: "Wrong", zh: "錯誤", short: "Wrong", tip: "The AI named someone else." },
  declined: { en: "Declined", zh: "未作答", short: "Declined", tip: "The AI gave no name, but 箋校 identifies the person." },
  unknown: { en: "Name unknown in 箋校", zh: "名未詳", short: "Name unknown", tip: "The AI gave no name, and 箋校 does not identify the person either." },
  untested: { en: "No verdict yet", zh: "未判定", short: "No verdict", tip: "No verdict recorded yet." },
  other: { en: "Other", zh: "其他", short: "Other", tip: "A verdict the site does not recognise." },
};

// Display order everywhere: chips, legends, stacked bars, matrix.
export const ORDER: Verdict[] = ["correct", "partly", "wrong", "declined", "unknown", "untested"];

export const CONF: Record<string, string> = { high: "High 高", medium: "Medium 中", low: "Low 低" };
export const confLabel = (c: string) => CONF[c] || c;

// Simplified -> traditional for characters that occur in the data, so 刘十九 finds 劉十九.
const S2T: Record<string, string> = {
  刘: "劉", 杨: "楊", 张: "張", 吴: "吳", 严: "嚴", 独: "獨", 窦: "竇", 韦: "韋", 郑: "鄭", 孙: "孫",
  诗: "詩", 题: "題", 赠: "贈", 问: "問", 梦: "夢", 东: "東", 韵: "韻", 员: "員", 书: "書", 给: "給",
  访: "訪", 见: "見", 怀: "懷", 对: "對", 庐: "廬", 页: "頁", 镇: "鎮", 宾: "賓", 历: "歷", 补: "補",
  阙: "闕", 遗: "遺", 军: "軍", 录: "錄", 録: "錄", 荅: "答", 笺: "箋", 绅: "紳", 锡: "錫", 颍: "潁",
  钟: "鍾", 园: "園", 觉: "覺", 师: "師", 传: "傳", 亚: "亞", 钦: "欽", 简: "簡", 宽: "寬", 缜: "縝",
  绩: "績", 处: "處", 归: "歸", 苏: "蘇", 顾: "顧", 陆: "陸", 萧: "蕭",
};
export const normalise = (s: string) =>
  String(s || "").toLowerCase().replace(/\s+/g, "").replace(/[一-鿿]/g, (c) => S2T[c] || c);
