import { useEffect, useState, type ReactNode } from "react";

/** Side table of contents that highlights the section in view. */
export function Toc({ items }: { items: [string, string][] }) {
  const [active, setActive] = useState(items[0]?.[0]);
  useEffect(() => {
    const io = new IntersectionObserver((en) => {
      en.forEach((e) => { if (e.isIntersecting) setActive(e.target.id); });
    }, { rootMargin: "-20% 0px -70% 0px" });
    items.forEach(([id]) => { const el = document.getElementById(id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, [items]);
  return (
    <nav className="toc" aria-label="On this page">
      <ol>
        {items.map(([id, label]) => (
          <li key={id}><a href={"#" + id} className={active === id ? "active" : undefined}>{label}</a></li>
        ))}
      </ol>
    </nav>
  );
}

export function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button className="copy" type="button" onClick={() => {
      navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1400); }, () => {});
    }}>{done ? "Copied" : "Copy"}</button>
  );
}

export function PageHead({ title, zh, children }: { title: string; zh: string; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div className="wrap">
        <h1>{title} <span className="zh" lang="zh-Hant">{zh}</span></h1>
        {children && <p>{children}</p>}
      </div>
    </div>
  );
}

export const Zh = ({ children }: { children: ReactNode }) => <span lang="zh-Hant">{children}</span>;
