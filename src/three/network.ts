/* 3D network: Bai Juyi at the centre, his poems on an inner sphere, the names in them outside.
   Plain canvas 2D with a hand-written perspective projection; no libraries. */
import type { Row, Verdict } from "../lib/data";
import { STATUS } from "../lib/status";

type V3 = [number, number, number];
interface Projected { x: number; y: number; z: number; s: number }
interface PoemNode { kind: "poem"; title: string; rows: Row[]; home: V3; p?: Projected }
interface NameNode { kind: "name"; row: Row; poem: PoemNode; home: V3; p?: Projected }
interface CentreNode { kind: "centre"; home: V3; p?: Projected }
type Node = PoemNode | NameNode | CentreNode;

const norm3 = (v: V3): V3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const lerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export interface NetworkHandle { destroy: () => void; setPaused: (paused: boolean) => void }

/** Mounts the network into `host`. */
export function mountNetwork(host: HTMLElement, rows: Row[], onOpen: (n: string) => void): NetworkHandle {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx || !rows.length) return { destroy: () => {}, setPaused: () => {} };
  canvas.setAttribute("aria-hidden", "true");
  host.appendChild(canvas);
  host.classList.add("ready");
  const tip = document.createElement("div");
  tip.className = "net-tip";
  host.appendChild(tip);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");

  /* ------------------------------------------------------------ graph */
  const poems: PoemNode[] = [];
  const byTitle = new Map<string, PoemNode>();
  rows.forEach((r) => {
    let p = byTitle.get(r.title);
    if (!p) { p = { kind: "poem", title: r.title, rows: [], home: [0, 0, 0] }; byTitle.set(r.title, p); poems.push(p); }
    p.rows.push(r);
  });
  const golden = Math.PI * (3 - Math.sqrt(5));
  poems.forEach((p, i) => {
    const y = 1 - ((i + 0.5) / poems.length) * 2, rad = Math.sqrt(1 - y * y), th = i * golden;
    p.home = [Math.cos(th) * rad, y * 0.92, Math.sin(th) * rad];
  });
  const names: NameNode[] = [];
  poems.forEach((p) => {
    const n = p.rows.length, up: V3 = Math.abs(p.home[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const t1 = norm3(cross(p.home, up)), t2 = norm3(cross(p.home, t1));
    p.rows.forEach((r, j) => {
      const a = (j / n) * Math.PI * 2 + 0.6, spread = n > 1 ? 0.2 + n * 0.035 : 0;
      const b: V3 = [p.home[0] * 1.72, p.home[1] * 1.72, p.home[2] * 1.72];
      names.push({
        kind: "name", row: r, poem: p,
        home: [0, 1, 2].map((k) => b[k] + (t1[k] * Math.cos(a) + t2[k] * Math.sin(a)) * spread) as V3,
      });
    });
  });
  const centre: CentreNode = { kind: "centre", home: [0, 0, 0] };
  const nodes: Node[] = [centre, ...poems, ...names];

  // Faint characters drifting behind, taken from the poems themselves.
  let pool = rows.map((r) => (r.poem || []).join("")).join("").replace(/[，。、？！；：「」『』（）\s]/g, "");
  if (!pool) pool = rows.map((r) => r.title).join("");
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const chars = Array.from({ length: 90 }, () => {
    const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, rr = 2.3 + rnd() * 1.6, s = Math.sqrt(1 - u * u);
    return { ch: pool[Math.floor(rnd() * pool.length)], home: [Math.cos(th) * s * rr, u * rr * 0.8, Math.sin(th) * s * rr] as V3 };
  });

  /* ------------------------------------------------------------ colours from the CSS tokens */
  const C: Record<string, string> = {};
  let dark = false;
  const readColours = () => {
    const cs = getComputedStyle(document.documentElement);
    ["ink", "muted", "accent", "surface", "bg", "rule-strong", "s-correct", "s-partly", "s-wrong", "s-unverifiable", "s-declined", "s-unknown", "s-untested", "s-other"]
      .forEach((k) => { C[k] = cs.getPropertyValue("--" + k).trim() || "#888"; });
    const bg = C.bg.replace("#", "");
    dark = bg.length === 6 && parseInt(bg.slice(0, 2), 16) + parseInt(bg.slice(2, 4), 16) + parseInt(bg.slice(4, 6), 16) < 200;
  };
  const sc = (s: Verdict) => C["s-" + s] || C["s-other"];
  readColours();
  const mo = new MutationObserver(readColours);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const mq = matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", readColours);

  /* ------------------------------------------------------------ view */
  let W = 0, H = 0, DPR = 1, R = 100, K = 1;
  const CAM = 4.2;
  let yaw = 0.6, pitch = -0.22, vYaw = 0, vPitch = 0, dragging = false, lastX = 0, lastY = 0, moved = 0;
  let hover: Node | null = null, raf = 0, inView = true, paused = false;
  const born = performance.now();

  const resize = () => {
    const r = host.getBoundingClientRect();
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    R = Math.min(W, H) * (W < 520 ? 0.21 : 0.235);
    K = Math.max(0.62, Math.min(1, R / 130)); // shrink marks and labels on small canvases
  };
  const project = (p: V3, grow: number): Projected => {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const x = p[0] * grow, y = p[1] * grow, z = p[2] * grow;
    const x1 = x * cy - z * sy, z1 = x * sy + z * cy;
    const y1 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
    const s = (R * CAM) / (CAM - z2);
    return { x: W / 2 + x1 * s, y: H / 2 - y1 * s, z: z2, s: s / R };
  };

  // letters in transit along centre -> poem -> name (or back)
  let pulses: { name: NameNode; t: number; v: number; out: boolean }[] = [];
  let lastSpawn = 0;
  const spawn = (now: number) => {
    if (now - lastSpawn < 320 || pulses.length > 16) return;
    lastSpawn = now;
    pulses.push({ name: names[Math.floor(Math.random() * names.length)], t: 0, v: 0.006 + Math.random() * 0.004, out: Math.random() < 0.6 });
  };
  const pulsePos = (p: { name: NameNode; t: number; out: boolean }) => {
    const t = p.out ? p.t : 2 - p.t;
    return t < 1 ? lerp(centre.home, p.name.poem.home, t) : lerp(p.name.poem.home, p.name.home, t - 1);
  };

  const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  };
  const depthAlpha = (z: number) => Math.max(0.16, Math.min(1, 0.58 + z * 0.24));
  const SERIF = '"LXGW WenKai TC", "Kaiti TC", "Noto Serif TC", serif';

  const frame = (now: number) => {
    raf = 0;
    const motion = !reduce.matches && !paused;
    const age = (now - born) / 1000;
    const grow = motion ? 1 - Math.pow(1 - Math.min(1, age / 1.8), 3) : 1;
    if (!dragging) {
      yaw += vYaw; pitch += vPitch;
      vYaw *= 0.94; vPitch *= 0.9;
      if (motion && !hover) yaw += 0.0016;
      pitch += (-0.22 - pitch) * 0.02;
    }
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";

    chars.forEach((c) => {
      const p = project(c.home, 0.6 + grow * 0.4);
      if (p.z > CAM - 0.5) return;
      ctx.globalAlpha = Math.max(0, (dark ? 0.09 : 0.07) + p.z * 0.03);
      ctx.fillStyle = C.ink;
      ctx.font = "500 " + Math.round(Math.min(28, 19 * K * p.s)) + "px " + SERIF;
      ctx.fillText(c.ch, p.x, p.y);
    });

    nodes.forEach((n) => { n.p = project(n.home, grow); });
    const focus: Node[] | null = hover
      ? hover.kind === "name" ? [hover, hover.poem]
        : hover.kind === "poem" ? [hover as Node].concat(names.filter((m) => m.poem === hover)) : null
      : null;
    const inFocus = (n: Node) => !focus || focus.includes(n);
    const cp = centre.p!;

    ctx.lineCap = "round";
    poems.forEach((p) => {
      const on = !!focus && inFocus(p);
      ctx.globalAlpha = (on ? 0.7 : focus ? 0.06 : 0.16) * depthAlpha(p.p!.z / 2);
      ctx.strokeStyle = on ? C.accent : C.muted;
      ctx.lineWidth = on ? 1.6 : 1;
      ctx.beginPath(); ctx.moveTo(cp.x, cp.y); ctx.lineTo(p.p!.x, p.p!.y); ctx.stroke();
    });
    names.forEach((n) => {
      const on = !!focus && inFocus(n) && inFocus(n.poem);
      ctx.globalAlpha = (on ? 0.9 : focus ? 0.08 : 0.4) * depthAlpha(n.p!.z);
      ctx.strokeStyle = on ? C.accent : sc(n.row.a.verdict);
      ctx.lineWidth = on ? 1.8 : 1.1;
      ctx.beginPath(); ctx.moveTo(n.poem.p!.x, n.poem.p!.y); ctx.lineTo(n.p!.x, n.p!.y); ctx.stroke();
    });

    if (motion && grow >= 1) spawn(now);
    pulses = pulses.filter((pl) => { pl.t += motion ? pl.v * 1.6 : 0; return pl.t < 2; });
    pulses.forEach((pl) => {
      const p = project(pulsePos(pl), grow);
      ctx.globalAlpha = depthAlpha(p.z) * Math.sin((Math.PI * pl.t) / 2);
      ctx.fillStyle = C.accent;
      ctx.beginPath(); ctx.arc(p.x, p.y, 2.4 * K * p.s, 0, Math.PI * 2); ctx.fill();
    });

    nodes.slice().sort((a, b) => a.p!.z - b.p!.z).forEach((n) => {
      const p = n.p!;
      const a = depthAlpha(p.z) * (focus && !inFocus(n) && n !== centre ? 0.3 : 1);
      ctx.globalAlpha = a;
      if (n.kind === "centre") {
        const s = 46 * K * Math.max(0.8, p.s);
        ctx.fillStyle = C.accent;
        roundRect(p.x - s / 2, p.y - s / 2, s, s, 4); ctx.fill();
        ctx.strokeStyle = C.surface; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.5;
        roundRect(p.x - s / 2 + 4, p.y - s / 2 + 4, s - 8, s - 8, 3); ctx.stroke();
        ctx.globalAlpha = 1; ctx.fillStyle = dark ? "#0f1318" : "#ffffff";
        ctx.font = "900 " + Math.round(s * 0.36) + "px " + SERIF;
        ctx.fillText("樂", p.x, p.y - s * 0.19); ctx.fillText("天", p.x, p.y + s * 0.2);
        ctx.fillStyle = C.ink; ctx.font = "600 " + Math.round(13 * Math.max(0.85, K)) + "px 'Source Sans 3', system-ui, sans-serif";
        ctx.fillText("Bai Juyi 白居易", p.x, p.y + s / 2 + 14);
      } else if (n.kind === "poem") {
        ctx.fillStyle = C.ink;
        ctx.beginPath(); ctx.arc(p.x, p.y, 3.2 * K * p.s * (n === hover ? 1.7 : 1), 0, Math.PI * 2); ctx.fill();
      } else {
        const r = 6 * K * p.s * (n === hover ? 1.4 : 1), va = n.row.a.verdict, vb = n.row.b.verdict;
        ctx.fillStyle = va === "untested" ? C.surface : sc(va);
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = 2.2 * K * p.s;
        ctx.setLineDash(vb === "untested" ? [2.5, 2.5] : []);
        ctx.strokeStyle = vb === "untested" ? C["rule-strong"] : sc(vb);
        ctx.beginPath(); ctx.arc(p.x, p.y, r + 2.6 * K * p.s, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        const fs = Math.round(Math.max(10, 14.5 * K * p.s) * (n === hover ? 1.15 : 1));
        ctx.font = "600 " + fs + "px " + SERIF;
        const label = n.row.address, tw = ctx.measureText(label).width, ly = p.y - r - 6 - fs / 2;
        ctx.globalAlpha = a * 0.82; ctx.fillStyle = C.surface;
        roundRect(p.x - tw / 2 - 5, ly - fs / 2 - 3, tw + 10, fs + 6, 3); ctx.fill();
        ctx.globalAlpha = a; ctx.fillStyle = n === hover ? C.accent : C.ink;
        ctx.fillText(label, p.x, ly + 0.5);
      }
    });
    ctx.globalAlpha = 1;
    // keep animating while something moves; a still view redraws only on interaction
    if (motion || dragging || Math.abs(vYaw) > 1e-4 || Math.abs(vPitch) > 1e-4 || Math.abs(pitch + 0.22) > 1e-3) start();
  };

  /* ------------------------------------------------------------ interaction */
  const pick = (x: number, y: number): PoemNode | NameNode | null => {
    let best: PoemNode | NameNode | null = null, bd = 18;
    [...names, ...poems].forEach((n) => {
      if (!n.p) return;
      const d = Math.hypot(n.p.x - x, n.p.y - y) - (n.kind === "name" ? 4 : 0);
      if (d < bd && n.p.z > -1.6) { bd = d; best = n; }
    });
    return best;
  };
  const showTip = (n: Node | null) => {
    if (!n || n.kind === "centre") { tip.classList.remove("show"); return; }
    tip.replaceChildren();
    const line = (text: string, cls?: string, zh?: boolean) => {
      const el = document.createElement(cls === "strong" ? "strong" : "span");
      if (zh) el.lang = "zh-Hant";
      el.textContent = text;
      tip.appendChild(el); tip.appendChild(document.createElement("br"));
    };
    if (n.kind === "name") {
      line(n.row.address + "  No. " + n.row.n, "strong", true);
      line(n.row.title, undefined, true);
      line("Round A: " + STATUS[n.row.a.verdict].en + " · Round B: " + STATUS[n.row.b.verdict].en);
      line("Select to open the entry", "em");
    } else {
      line(n.title, undefined, true);
      line(n.rows.length + (n.rows.length > 1 ? " names" : " name") + " in this title");
    }
    tip.lastChild?.remove();
    tip.classList.add("show");
    const x = Math.min(W - tip.offsetWidth - 8, Math.max(8, n.p!.x + 14)), y = Math.max(8, n.p!.y - tip.offsetHeight - 14);
    tip.style.transform = `translate(${x}px,${y}px)`;
  };
  const local = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

  const down = (e: PointerEvent) => {
    dragging = true; moved = 0; lastX = e.clientX; lastY = e.clientY; start();
    if (e.pointerType === "mouse") canvas.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    if (dragging) {
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      moved += Math.abs(dx) + Math.abs(dy);
      vYaw = dx * 0.006; vPitch = e.pointerType === "mouse" ? dy * 0.004 : 0;
      yaw += vYaw; pitch = Math.max(-1.1, Math.min(1.1, pitch + vPitch));
      lastX = e.clientX; lastY = e.clientY;
      if (moved > 6) { hover = null; showTip(null); }
      return;
    }
    const [x, y] = local(e), n = pick(x, y);
    if (n !== hover) { hover = n; canvas.style.cursor = n && n.kind === "name" ? "pointer" : "grab"; start(); }
    showTip(hover);
  };
  const up = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    if (moved < 6) {
      const [x, y] = local(e), n = pick(x, y);
      if (n && n.kind === "name") onOpen(n.row.n);
      else { hover = n; showTip(n); }
    }
  };
  const cancel = () => { dragging = false; };
  const leave = (e: PointerEvent) => { if (e.pointerType === "mouse") { hover = null; showTip(null); start(); } };
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", cancel);
  canvas.addEventListener("pointerleave", leave);

  /* ------------------------------------------------------------ lifecycle: one animation frame in flight at most */
  function start() { if (!raf && inView && !document.hidden) raf = requestAnimationFrame(frame); }
  const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };
  const redraw = () => { resize(); start(); };
  resize();
  const ro = new ResizeObserver(redraw);
  ro.observe(host);
  const io = new IntersectionObserver((en) => { inView = en[0].isIntersecting; if (inView) start(); else stop(); });
  io.observe(host);
  const vis = () => { if (document.hidden) stop(); else start(); };
  document.addEventListener("visibilitychange", vis);
  const themeRedraw = new MutationObserver(() => start());
  themeRedraw.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  start();

  return {
    setPaused: (p) => { paused = p; start(); },
    destroy: () => {
      stop();
      ro.disconnect(); io.disconnect(); mo.disconnect(); themeRedraw.disconnect();
      mq.removeEventListener("change", readColours);
      document.removeEventListener("visibilitychange", vis);
      canvas.remove(); tip.remove();
      host.classList.remove("ready");
    },
  };
}
