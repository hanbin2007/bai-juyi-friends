import { useEffect, useRef } from "react";

/* One shared tooltip for any element with data-tip (plain text). Follows the pointer; also shows on focus. */
export function TooltipLayer() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const tip = ref.current!;
    let current: HTMLElement | null = null;
    const place = (el: HTMLElement, x?: number, y?: number) => {
      const r = el.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
      let left = x != null ? x + 14 : r.left + r.width / 2 - tw / 2;
      let top = y != null ? y + 16 : r.top - th - 10;
      if (top < 8) top = r.bottom + 10;
      left = Math.max(8, Math.min(left, innerWidth - tw - 8));
      if (top + th > innerHeight - 8) top = (y != null ? y : r.top) - th - 12;
      tip.style.left = left + "px";
      tip.style.top = top + "px";
    };
    const show = (el: HTMLElement, x?: number, y?: number) => {
      current = el;
      tip.textContent = el.dataset.tip || "";
      tip.classList.add("show");
      place(el, x, y);
    };
    const hide = () => { current = null; tip.classList.remove("show"); };
    const over = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>("[data-tip]");
      if (el && el !== current) show(el, e.clientX, e.clientY);
      else if (!el && current) hide();
    };
    const move = (e: MouseEvent) => { if (current && current.contains(e.target as Node)) place(current, e.clientX, e.clientY); };
    const focus = (e: FocusEvent) => { const el = (e.target as HTMLElement).closest<HTMLElement>("[data-tip]"); if (el) show(el); };
    document.addEventListener("mouseover", over);
    document.addEventListener("mousemove", move);
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", hide);
    addEventListener("scroll", hide, { passive: true });
    return () => {
      document.removeEventListener("mouseover", over);
      document.removeEventListener("mousemove", move);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", hide);
      removeEventListener("scroll", hide);
    };
  }, []);
  return <div className="tooltip" role="tooltip" ref={ref} />;
}
