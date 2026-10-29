import { TOTAL } from "../lib/data";
import { useFilters } from "../lib/filters";
import { FilterBar, RecordTable } from "../components/RecordTable";
import { useTitle } from "../lib/useTitle";

/** /table — the record table on its own, as wide as the screen allows. Filters live in ?q=&status=&round=. */
export function Table() {
  useTitle("Table");
  const [f, set, reset] = useFilters();

  return (
    <>
      <div className="page-head">
        <div className="wrap wrap-wide">
          <h1>Names, answers and the annotated edition <span className="zh" lang="zh-Hant">總表</span></h1>
          <p>
            One row for each of the {TOTAL} forms of address: the AI's answer from the title alone (Round A), its answer with sources (Round B),
            and what <span lang="zh-Hant">《白居易集箋校》</span> says. Select a row for the sources the AI cited and the poem itself.
            The underlined name in each title follows the proper-name line (<span lang="zh-Hant">專名線</span>) of annotated editions.
          </p>
        </div>
      </div>
      <section className="table-page" id="record">
        <div className="wrap wrap-wide">
          <FilterBar f={f} set={set} />
          <RecordTable f={f} reset={reset} />
        </div>
      </section>
    </>
  );
}
