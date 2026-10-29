import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, ScrollRestoration, useLocation, useNavigate } from "react-router-dom";
import { DATA } from "../lib/data";
import { TooltipLayer } from "./Tooltip";

const NAV = [
  { to: "/", en: "Timeline", zh: "時空" },
  { to: "/record", en: "Names", zh: "稱謂" },
  { to: "/table", en: "Table", zh: "總表" },
  { to: "/summary", en: "Summary", zh: "統計" },
  { to: "/method", en: "Method", zh: "方法" },
  { to: "/about", en: "About", zh: "關於" },
];

function ThemeButton() {
  const isDark = () => {
    const t = document.documentElement.dataset.theme;
    return t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  };
  const [dark, setDark] = useState(isDark);
  const flip = () => {
    const next = isDark() ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch { /* storage blocked: theme lasts for this visit */ }
    setDark(next === "dark");
  };
  return (
    <button className="icon-btn theme-btn" type="button" onClick={flip} aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}>
      <svg className="sun" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="10" cy="10" r="3.5" /><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4" /></svg>
      <svg className="moon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d="M16.5 12.5A7 7 0 0 1 7.5 3.5a7 7 0 1 0 9 9z" /></svg>
    </button>
  );
}

export function Layout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  // pages built around one wide table widen the header and footer with them, so the edges line up
  const wrap = "wrap" + (location.pathname === "/table" ? " wrap-wide" : "");

  useEffect(() => setOpen(false), [location.pathname]);

  // Old links of the form #r12 now open /entry/12; the names moved from / to /record, and the table and its
  // filters (?q=&status=&round=, #record) to /table. Other hashes scroll to their section.
  useEffect(() => {
    const m = /^#r(\d+)$/.exec(location.hash);
    if (m) { navigate("/entry/" + m[1], { replace: true }); return; }
    const toTable = (location.pathname === "/" || location.pathname === "/record") && (location.hash === "#record" || /[?&](q|status|round)=/.test(location.search));
    if (toTable) { navigate("/table" + location.search + "#record", { replace: true }); return; }
    if (location.pathname === "/" && /^#(names|journey)$/.test(location.hash)) { navigate("/record" + location.hash, { replace: true }); return; }
    if (!location.hash) return;
    const t = setTimeout(() => document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView(), 30);
    return () => clearTimeout(t);
  }, [location.pathname, location.hash, navigate]);

  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <header className="site-header">
        <div className={wrap}>
          <Link className="brand" to="/">
            <span className="seal" aria-hidden="true">樂天</span>
            <span className="brand-text"><strong>Bai Juyi's Friends</strong><span>白居易的朋友</span></span>
          </Link>
          <button className="icon-btn menu-btn" type="button" aria-label="Menu" aria-expanded={open} aria-controls="nav" onClick={() => setOpen(!open)}>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M3 6h14M3 10h14M3 14h14" /></svg>
          </button>
          <nav className={"nav" + (open ? " open" : "")} id="nav" aria-label="Main">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.to === "/"}>
                {n.en} <small>{n.zh}</small>
              </NavLink>
            ))}
          </nav>
          <ThemeButton />
        </div>
      </header>

      <main id="main">
        <Outlet />
      </main>

      <footer className="site-footer">
        <div className={wrap}>
          <div>
            <p><strong>Identifying Bai Juyi's Friends with AI and Historical Sources</strong> · ZHANG Hanbin · CHC1M51, The Hong Kong Polytechnic University</p>
            <p>Data updated {DATA.meta.built} from the record sheet. Built with AI coding help; see <Link to="/about#ai">About</Link>.</p>
          </div>
          <div className="foot-links">
            <Link to="/summary">Summary</Link>
            <Link to="/method">Method</Link>
            <Link to="/about">About</Link>
            <a href={import.meta.env.BASE_URL + "data/records.json"}>Data (JSON)</a>
          </div>
        </div>
      </footer>
      <TooltipLayer />
      <ScrollRestoration getKey={(loc) => loc.pathname} />
    </>
  );
}
