import { Link } from "react-router-dom";
import { useTitle } from "../lib/useTitle";

export function NotFound() {
  useTitle("Not found");
  return (
    <div className="page-head">
      <div className="wrap">
        <h1>Page not found <span className="zh" lang="zh-Hant">查無此頁</span></h1>
        <p>There is nothing at this address. <Link to="/">Go to the timeline</Link> or <Link to="/table">the table</Link>.</p>
      </div>
    </div>
  );
}
