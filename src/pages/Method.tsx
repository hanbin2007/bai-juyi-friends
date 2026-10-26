import { DATA, POEM_COUNT, TOTAL, type Verdict } from "../lib/data";
import { Badge } from "../components/Badge";
import { CopyButton, PageHead, Toc, Zh } from "../components/Prose";
import { useTitle } from "../lib/useTitle";

const TOC: [string, string][] = [
  ["rounds", "The two rounds"], ["steps", "Steps"], ["run", "Model and dates"], ["prompts", "Prompts"],
  ["checking", "How answers were checked"], ["verdicts", "Verdicts"], ["limits", "Limits"],
];

const RUN: [string, string, string][] = [
  ["model", "AI model", "模型"],
  ["interface", "Used through", "介面"],
  ["roundADate", "Round A run on", "僅詩題"],
  ["roundBDate", "Round B run on", "詩題＋史料"],
  ["sourcesGiven", "Sources given in Round B", "所給史料"],
  ["checkingDates", "Answers checked on", "核對日期"],
];

const VERDICTS: [Verdict, React.ReactNode, string | null][] = [
  ["correct", <>The AI names the person <Zh>箋校</Zh> identifies.</>, "correct"],
  ["partly", <>The answer is partly right; the entry's notes say how.</>, "partly"],
  ["wrong", <>The AI names someone other than the person in <Zh>箋校</Zh>.</>, "wrong"],
  ["declined", <>The AI gives no name, although <Zh>箋校</Zh> identifies the person.</>, "declined: answer exists"],
  ["unknown", <>The AI gives no name, and <Zh>箋校</Zh> does not identify the person either.</>, "declined: none exists"],
  ["untested", <>No verdict has been recorded yet (the cell is empty).</>, null],
];

function Prompt({ label, zh, text }: { label: string; zh: string; text: string }) {
  return (
    <div className="prompt">
      <div className="prompt-head"><span>{label} <span className="zh" lang="zh-Hant">{zh}</span></span>{text && <CopyButton text={text} />}</div>
      <pre className={text ? undefined : "placeholder"}>{text || "To be added."}</pre>
    </div>
  );
}

export function Method() {
  useTitle("Method");
  const run = DATA.method.run || {};
  return (
    <>
      <PageHead title="How the names were tested" zh="測試方法">
        The same AI model answers the same {TOTAL} names twice: once from the poem title alone, and once with historical sources. Every answer is checked by hand against the annotated edition of Bai Juyi's works. Results appear on the site as each round is recorded.
      </PageHead>
      <div className="wrap layout">
        <Toc items={TOC} />
        <div className="prose">
          <section id="rounds">
            <h2>The two rounds <span className="zh" lang="zh-Hant">兩輪</span></h2>
            <div className="rounds">
              <div className="round-card">
                <h3>Round A · title only</h3>
                <div className="zh-sub" lang="zh-Hant">僅詩題</div>
                <p>The AI sees one poem title and the name to identify, for example <span lang="zh-Hant" className="pn">元九</span> in <Zh>酬元九對新栽竹有懷見寄</Zh>. It names the person and gives its confidence (high, medium or low), or declines.</p>
              </div>
              <div className="round-card">
                <h3>Round B · title + sources</h3>
                <div className="zh-sub" lang="zh-Hant">詩題＋史料</div>
                <p>The AI answers the same names again, this time with historical sources to draw on, and lists the sources its answer relies on. These are shown in each entry's details.</p>
              </div>
            </div>
          </section>

          <section id="steps">
            <h2>Steps <span className="zh" lang="zh-Hant">步驟</span></h2>
            <ol className="steps">
              <li><strong>Choose the names</strong><span>{TOTAL} forms of address of the type surname + sibling rank (<Zh>姓＋行第</Zh>) in {POEM_COUNT} poem titles by Bai Juyi, each with its place in <Zh>箋校</Zh> (volume and page) noted beforehand.</span></li>
              <li><strong>Round A</strong><span>Ask the AI to identify each name from the title alone and record the answer and stated confidence.</span></li>
              <li><strong>Round B</strong><span>Ask again with sources, and record the answer, confidence and the sources the AI cited.</span></li>
              <li><strong>Check by hand</strong><span>Look up each entry in <Zh>《白居易集箋校》</Zh>, with <Zh>《唐人行第録》</Zh> as a second reference, and note what the editor says.</span></li>
              <li><strong>Give a verdict</strong><span>Mark each answer in each round with one of the verdicts below. The site is rebuilt from the record sheet.</span></li>
            </ol>
          </section>

          <section id="run">
            <h2>Model and dates <span className="zh" lang="zh-Hant">模型與日期</span></h2>
            <table className="info">
              <tbody>
                {RUN.map(([k, label, zh]) => (
                  <tr key={k}>
                    <th scope="row">{label}<span lang="zh-Hant">{zh}</span></th>
                    {run[k] ? <td>{run[k]}</td> : <td className="placeholder">To be added</td>}
                  </tr>
                ))}
              </tbody>
            </table>
            {run.note && <p className="ui muted">{run.note}</p>}
          </section>

          <section id="prompts">
            <h2>Prompts <span className="zh" lang="zh-Hant">提示詞</span></h2>
            <p>The exact wording given to the AI in each round.</p>
            <Prompt label="Round A prompt" zh="僅詩題" text={DATA.method.promptA} />
            <Prompt label="Round B prompt" zh="詩題＋史料" text={DATA.method.promptB} />
          </section>

          <section id="checking">
            <h2>How answers were checked <span className="zh" lang="zh-Hant">核對</span></h2>
            <ul>
              <li><strong>Main reference:</strong> Zhu Jincheng's <Zh>《白居易集箋校》</Zh> (Bai, 2020). Its notes (<Zh>箋</Zh>) name the person behind a form of address where the editor could establish it, or say <Zh>名未詳</Zh> (“name unknown”).</li>
              <li><strong>Second reference:</strong> Cen Zhongmian's <Zh>《唐人行第録》</Zh> (Cen, 1978), a dictionary of Tang people listed by surname and sibling rank.</li>
              <li><strong>Access:</strong> both books are read in the <Zh>汇典·典籍整理文献数据库</Zh> database, one entry at a time and by hand. Nothing is scraped or downloaded from it.</li>
              <li><strong>Quoting:</strong> the site quotes <Zh>箋校</Zh> only briefly, a name or a short phrase, always with volume and page (<Zh>卷·頁</Zh>).</li>
            </ul>
          </section>

          <section id="verdicts">
            <h2>Verdicts <span className="zh" lang="zh-Hant">判定</span></h2>
            <p>Each answer gets one verdict per round. The value at the end is what is typed in the record sheet.</p>
            <dl className="def-list">
              {VERDICTS.map(([s, text, sheet]) => (
                <div key={s}><dt><Badge s={s} /></dt><dd>{text} {sheet && <code>{sheet}</code>}</dd></div>
              ))}
            </dl>
          </section>

          <section id="limits">
            <h2>Limits <span className="zh" lang="zh-Hant">局限</span></h2>
            <ul>
              <li><strong>Small sample.</strong> {TOTAL} names from {POEM_COUNT} poems by one poet. The counts describe this set only and are not a measure of AI accuracy in general.</li>
              <li><strong>Memorised answers.</strong> Bai Juyi's best-known friends, such as <Zh>元九</Zh> (Yuan Zhen) and <Zh>劉二十八</Zh> (Liu Yuxi), are widely discussed online. A correct answer about a famous name may come from the AI having seen that scholarship, not from working it out.</li>
              <li><strong>One model, one run.</strong> Another model, or the same model on another day, may answer differently.</li>
              <li><strong>The reference is scholarship too.</strong> <Zh>箋校</Zh> leaves some names unidentified and sometimes disagrees with <Zh>唐人行第録</Zh>. Verdicts follow <Zh>箋校</Zh>.</li>
              <li><strong>Poem text.</strong> The poems shown in each entry come from an open digital edition of <Zh>全唐詩</Zh> that leaves out Bai Juyi's own notes (<Zh>自注</Zh>). They are there for reading and were not used for the verdicts.</li>
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
