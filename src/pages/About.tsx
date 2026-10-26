import { Link } from "react-router-dom";
import { DATA } from "../lib/data";
import { CopyButton, PageHead, Toc, Zh } from "../components/Prose";
import { useTitle } from "../lib/useTitle";

const SITE_URL = "https://hanbin2007.github.io/bai-juyi-friends/";
const TOC: [string, string][] = [
  ["author", "Author and course"], ["references", "References"], ["ai", "AI assistance"],
  ["data", "Data and credits"], ["privacy", "Privacy"], ["cite", "How to cite"],
];

export function About() {
  useTitle("About");
  const base = import.meta.env.BASE_URL;
  const cite = `Zhang, H. (2026). Identifying Bai Juyi's friends with AI and historical sources [Website]. ${SITE_URL}`;
  return (
    <>
      <PageHead title="About this project" zh="關於本站">
        A student project for a course on exploring Chinese history with generative AI and digital technology.
      </PageHead>
      <div className="wrap layout">
        <Toc items={TOC} />
        <div className="prose">
          <section id="author">
            <h2>Author and course <span className="zh" lang="zh-Hant">作者與課程</span></h2>
            <div className="person">
              <span className="seal" aria-hidden="true">漢彬</span>
              <div>
                <strong>ZHANG Hanbin</strong>
                <span>CHC1M51 Exploring Chinese History through Generative AI and Digital Technology<br />
                  Teacher: Dr Jing CHEN · The Hong Kong Polytechnic University · Semester 1, 2026/27</span>
              </div>
            </div>
          </section>

          <section id="references">
            <h2>References <span className="zh" lang="zh-Hant">參考文獻</span></h2>
            <ul className="refs">
              <li>Bai, J. (2020). <i>Bai Juyi ji jianjiao</i> [<Zh>白居易集箋校</Zh>; The collected works of Bai Juyi, annotated and collated] (J. Zhu, Ed.). Shanghai Guji Chubanshe. (Original work published 1988)</li>
              <li>Cen, Z. (1978). <i>Tangren hangdi lu</i> [<Zh>唐人行第録</Zh>; Records of the sibling-rank names of Tang people]. Shanghai Guji Chubanshe.</li>
              <li>Mazanec, T. J. (2018). Networks of exchange poetry in late medieval China: Notes toward a dynamic history of Tang literature. <i>Journal of Chinese Literature and Culture, 5</i>(2), 322–359. <a href="https://doi.org/10.1215/23290048-7257015">https://doi.org/10.1215/23290048-7257015</a></li>
              <li>Tsui, L. H., &amp; Wang, H. (2020). Harvesting big biographical data for Chinese history: The China Biographical Database (CBDB). <i>Journal of Chinese History, 4</i>(2), 505–511. <a href="https://doi.org/10.1017/jch.2020.21">https://doi.org/10.1017/jch.2020.21</a></li>
            </ul>
          </section>

          <section id="ai">
            <h2>AI assistance <span className="zh" lang="zh-Hant">AI 協助說明</span></h2>
            <div className="callout">
              <p>The code for this website (page layout, styles, the 3D views and the script that turns the record sheet into the site's data) was written with help from an AI coding assistant, Claude Code (Anthropic). The course teacher allowed AI help for the project, and it is declared in the Honour Declaration.</p>
              <p>The test results, the readings of <Zh>箋校</Zh> and <Zh>唐人行第録</Zh>, and the verdicts are the student's own. The AI being tested is a separate model, named on the <Link to="/method#run">Method</Link> page. The site's <a href="https://github.com/hanbin2007/bai-juyi-friends">git history</a> records which changes were AI-assisted.</p>
            </div>
          </section>

          <section id="data">
            <h2>Data and credits <span className="zh" lang="zh-Hant">資料來源</span></h2>
            <ul>
              <li><strong>Record sheet:</strong> every result on this site comes from <a href={base + "data/Bai-Juyi-Experiment-Record-Sheet.xlsx"}>the experiment record sheet</a> (also as <a href={base + "data/records.json"}>JSON</a>). Last rebuilt {DATA.meta.built}; file fingerprint <code>{DATA.meta.sha256.slice(0, 12)}</code>.</li>
              <li><strong>Poem text:</strong> the open <a href="https://github.com/chinese-poetry/chinese-poetry">chinese-poetry</a> edition of <Zh>全唐詩</Zh> (MIT licence), shown for reading only.</li>
              <li><strong>Mount Lu terrain:</strong> elevation from <a href="https://registry.opendata.aws/terrain-tiles/">Terrain Tiles</a> on AWS Open Data; SRTM and GMTED2010 terrain data courtesy of the U.S. Geological Survey. Heights are shown ×1.5.</li>
              <li><strong>Satellite imagery:</strong> <a href="https://cloudless.eox.at">EOxCloudless</a> by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2024), used under <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/">CC BY-NC-SA 4.0</a>. The stitched images in <code>public/terrain/</code> are shared under the same licence.</li>
              <li><strong>Software:</strong> <a href="https://threejs.org">three.js</a>, <a href="https://react.dev">React</a> and <a href="https://reactrouter.com">React Router</a> (MIT licence), built with <a href="https://vite.dev">Vite</a>.</li>
              <li><strong>Fonts:</strong> Inter, Newsreader and Noto Serif TC, under the SIL Open Font License, served by Google Fonts.</li>
            </ul>
          </section>

          <section id="privacy">
            <h2>Privacy <span className="zh" lang="zh-Hant">隱私</span></h2>
            <p>No login, no cookies, no analytics and no tracking. The site is a set of static files on GitHub Pages. Fonts load from Google Fonts, which receives your IP address as any web server would. If you switch between light and dark themes, that choice is saved in your own browser only.</p>
          </section>

          <section id="cite">
            <h2>How to cite this site <span className="zh" lang="zh-Hant">引用本站</span></h2>
            <div className="cite-box">
              <span>Zhang, H. (2026). <i>Identifying Bai Juyi's friends with AI and historical sources</i> [Website]. {SITE_URL}</span>
              <CopyButton text={cite} />
            </div>
            <p className="ui muted" style={{ marginTop: 12 }}>
              Each entry has its own address, e.g. <code>{SITE_URL}entry/9</code> for <Zh>楊八</Zh>.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
