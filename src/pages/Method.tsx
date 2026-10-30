import { Link } from "react-router-dom";
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
  ["unverifiable", <>The AI names someone, but <Zh>箋校</Zh> gives no name: it does not annotate the addressee, or says the name is unknown. The answer is neither confirmed nor ruled out. The sheet's verdict is <code>wrong</code>; the evidence status says why.</>, "unverifiable: …"],
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
  const roles = run.roles;
  const checks = roles?.studentChecks || [];
  return (
    <>
      <PageHead title="How the names were tested" zh="測試方法">
        The same AI model answers the same {TOTAL} names twice: once from the poem title alone, and once with historical sources. Every answer is checked against the annotated edition of Bai Juyi's works.
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
                <p>The AI sees the poem titles and the names to identify (all {TOTAL} in one prompt), for example <span lang="zh-Hant" className="pn">元九</span> in <Zh>酬元九對新栽竹有懷見寄</Zh>. It names each person and gives its confidence (high, medium or low), or declines.</p>
              </div>
              <div className="round-card">
                <h3>Round B · title + sources</h3>
                <div className="zh-sub" lang="zh-Hant">詩題＋史料</div>
                <p>The AI answers the same names again, this time with each poem's full text and a fixed set of historical sources, and says what its answer relies on. This is shown in each entry's details.</p>
              </div>
            </div>
          </section>

          <section id="steps">
            <h2>Steps <span className="zh" lang="zh-Hant">步驟</span></h2>
            <ol className="steps">
              <li><strong>Choose the names</strong><span>{TOTAL} forms of address of the type surname + sibling rank (<Zh>姓＋行第</Zh>) in {POEM_COUNT} poem titles by Bai Juyi, each with its place in <Zh>箋校</Zh> (volume and page) noted beforehand.</span></li>
              <li><strong>Round A</strong><span>Ask the AI to identify each name from the title alone and record the answer and stated confidence.</span></li>
              <li><strong>Round B</strong><span>Ask again with sources, and record the answer, confidence and the sources the AI cited.</span></li>
              <li><strong>Check</strong><span>Look up each entry in <Zh>《白居易集箋校》</Zh> and note whom the editor identifies, and when and where the poem was written.</span></li>
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
            {DATA.method.promptB && <p className="ui muted">The Round B prompt above is shortened. <a href={import.meta.env.BASE_URL + "data/test-run/prompt-round-b.txt"}>The full prompt</a> includes every poem and all three sources. The model's raw answers are also there: <a href={import.meta.env.BASE_URL + "data/test-run/round-a-answer.txt"}>Round A</a>, <a href={import.meta.env.BASE_URL + "data/test-run/round-b-answer.txt"}>Round B</a>.</p>}
          </section>

          <section id="checking">
            <h2>How answers were checked <span className="zh" lang="zh-Hant">核對</span></h2>
            <ul>
              <li><strong>Main reference:</strong> Zhu Jincheng's <Zh>《白居易集箋校》</Zh> (Bai, 2020). Its notes (<Zh>箋</Zh>) name the person behind a form of address where the editor could establish it, or say <Zh>名未詳</Zh> (“name unknown”).</li>
              <li><strong>Related reference:</strong> Cen Zhongmian's <Zh>《唐人行第録》</Zh> (Cen, 1978), a dictionary of Tang people listed by surname and sibling rank. <Zh>箋校</Zh> sometimes cites or corrects it.</li>
              <li><strong>What the verdicts rest on:</strong> <Zh>箋校</Zh> only. CBDB (Tsui &amp; Wang, 2020) was one of the sources given to the AI in Round B, not a check on its answers, and epitaphs (<Zh>墓誌</Zh>) and other sources were not consulted. So “correct” means “agrees with <Zh>箋校</Zh>”; the project tests the AI against this scholarship and makes no new identifications of its own.</li>
              <li><strong>Access:</strong> <Zh>箋校</Zh> was read in the <Zh>汇典·典籍整理文献数据库</Zh> database through the university's subscription, by Claude Code on the student's instruction: it searched for each poem, opened its entry and read the page on screen, one entry at a time. No files were downloaded and nothing was copied in bulk.</li>
              <li><strong>Quoting:</strong> the site quotes <Zh>箋校</Zh> only briefly, a name or a short phrase, always with volume and page (<Zh>卷·頁</Zh>).</li>
            </ul>
            {checks.length > 0 && (
              <>
                <h3 id="student-checks">Checked again by the student <span className="zh" lang="zh-Hant">學生覆核</span></h3>
                <p>{roles?.student}</p>
                <div className="table-scroll">
                  <table className="data-table text-table">
                    <thead><tr><th scope="col">Entry</th><th scope="col"><Zh>箋校</Zh></th><th scope="col">What the student read</th><th scope="col">Result</th></tr></thead>
                    <tbody>
                      {checks.map((c) => (
                        <tr key={c.n}>
                          <th scope="row" style={{ whiteSpace: "nowrap" }}><Link to={`/entry/${c.n}`}>{c.n} <span lang="zh-Hant">{c.address}</span></Link></th>
                          <td lang="zh-Hant" style={{ whiteSpace: "nowrap" }}>{c.locate}</td><td>{c.found}</td><td>{c.result}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          <section id="verdicts">
            <h2>Verdicts <span className="zh" lang="zh-Hant">判定</span></h2>
            <p>Each answer gets one verdict per round, by comparing the name the AI gives with the person <Zh>箋校</Zh> names. Only an exact match counts as correct: a relative of the right person (such as <Zh>沈傳師</Zh>, the elder brother of <Zh>沈述師</Zh>) is wrong. The value at the end is what is typed in the record sheet.</p>
            <p>The sheet's verdict follows one strict rule: any name other than the one <Zh>箋校</Zh> gives is <code>wrong</code>, even where <Zh>箋校</Zh> gives no name at all. Not matching this reference is not the same as being disproved, so a second column records each answer's evidence status, and the site shows those answers as <em>can't verify</em>. None of the AI's names is explicitly rejected by <Zh>箋校</Zh>. The Summary page gives the counts both ways.</p>
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
              <li><strong>Round B adds several things at once.</strong> The full poem and three sources were given together, so a change between rounds cannot be traced to any one of them. The sources the AI says it used are its own account, not proof of how it reached the answer.</li>
              <li><strong>The reference is scholarship too.</strong> <Zh>箋校</Zh> leaves some names unidentified and sometimes disagrees with <Zh>唐人行第録</Zh>. Verdicts follow <Zh>箋校</Zh>. Mazanec (2018, p. 329) makes the same point about his own data on Tang exchange poems: addressees named only by surname and title have to be identified from annotated editions, so the data are only as good as that scholarship, and famous poets' friends are better identified than others'.</li>
              <li><strong>Poem text.</strong> The poems shown in each entry come from an open digital edition of <Zh>全唐詩</Zh> that leaves out Bai Juyi's own notes (<Zh>自注</Zh>). The same text was given to the AI in Round B. It was not used for the verdicts.</li>
              <li><strong>Run and checked by an AI assistant.</strong> Claude Code ran both rounds, read <Zh>箋校</Zh> and gave the verdicts and evidence statuses. A misreading of <Zh>箋校</Zh> is possible, and would carry into the verdict for that entry.{checks.length > 0 && <> The student checked {checks.length} entries again (<a href="#student-checks">above</a>): all the verdicts held, and one recorded reading was corrected. The other {TOTAL - checks.length} rest on Claude Code's reading.</>}</li>
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
