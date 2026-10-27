/* The chrono-spatial stream (the home page). Depth is time, 800–846; across the screen, places sit where they lie
   on the map. Every year is a sheet of silk with the coast and rivers in ink, every reign era a stronger one.
   Bai Juyi's postings are a gold thread that brightens around the present year; each dated name hangs in the
   year of its poem, with a red thread (and a travelling spark) to where the addressee was. Characters from the
   poems drift in the air. Text is HTML laid over the canvas, so it stays sharp.
   The camera orbits a target in the present year. By default the target follows Bai Juyi's thread; the wheel
   moves through time, a drag turns the view, a right-drag (or two fingers) moves it, and pinching zooms. Zooming
   out squeezes time, so that at the far end the whole span fits on the screen. */
import * as THREE from "three";
import type { Place, Row, Station, Verdict } from "../lib/data";
import { ERAS, eraYear, yearLabel } from "../lib/era";
import { STATUS } from "../lib/status";
import { T0, T1, Y0, Y1 } from "../lib/timelineScale";

type V3 = [number, number, number];
interface MapLine { n: string; p: [number, number][] }
interface MapData { coast: MapLine[]; rivers: MapLine[]; lakes: MapLine[] }

/* ------------------------------------------------------------ world coordinates */
const LON0 = 113, LAT0 = 31.5, KX = 0.55, KY = 0.63, KZ = 2.4;
const BOUNDS = { w: 103.5, e: 121.5, s: 24, n: 38.5 };
const wx = (lon: number) => (lon - LON0) * KX;
const wy = (lat: number) => (lat - LAT0) * KY;
// time runs away from the viewer, down -z, so a camera looking ahead in time sees east on its right
const wz = (year: number) => -(year - Y0) * KZ;
const SHEET = { x: wx((BOUNDS.w + BOUNDS.e) / 2), y: wy((BOUNDS.s + BOUNDS.n) / 2), w: (BOUNDS.e - BOUNDS.w) * KX, h: (BOUNDS.n - BOUNDS.s) * KY };
const MAJOR_RIVERS = new Set(["Chang Jiang", "Yangtze", "Huang", "Huang He", "Yellow"]);

const mid = (r: Row) => (r.time!.from + r.time!.to + 1) / 2;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const ease = (t: number) => t * t * (3 - 2 * t);
const v3 = (p: V3) => new THREE.Vector3(p[0], p[1], p[2]);

interface NameNode {
  row: Row; at: THREE.Vector3; from: THREE.Vector3; curve: THREE.QuadraticBezierCurve3 | null;
  group: NameNode[] | null; sprite: THREE.Sprite; letter: THREE.Mesh | null; spark: THREE.Sprite | null;
  label: HTMLAnchorElement; phase: number;
  dy: number; shown: number;   // the label's eased nudge (px) and visibility, to keep it clear of nearer names
}

export interface TimelineOptions {
  rows: Row[];                          // dated rows whose place is on the map
  places: Record<string, Place>;
  stations: Station[];
  onSelect: (n: string | null) => void; // a name was chosen in the scene, or the empty scene was clicked
  onFrame: (year: number, zoomOut: number) => void;   // every frame: the present year, and 0–1 how far out the view is
  onView: (v: ViewState) => void;       // when following or playing changes
  onInteract: () => void;               // the first touch of any control
}
export interface ViewState { following: boolean; playing: boolean }
export interface TimelineHandle {
  destroy: () => void;
  /** Hold one entry in focus and fly to it (at once with `instant`). */
  select: (n: string | null, instant?: boolean) => void;
  setYear: (year: number, instant?: boolean) => void;
  /** Relative moves, for the keyboard and buttons: years, radians, and a zoom factor (below 1 is closer). */
  move: (d: { year?: number; yaw?: number; pitch?: number; zoom?: number }) => void;
  play: (on: boolean) => void;
  follow: () => void;
  overview: () => void;
  /** Pixels covered on the left (welcome card), right (side panel) and bottom (time bar, sheet): the view centres in the rest. */
  setInset: (left: number, right: number, bottom: number) => void;
}

/* ------------------------------------------------------------ shaders */
const threadVertex = /* glsl */ `
  varying float vZ, vDepth;
  #include <fog_pars_vertex>
  void main() {
    vZ = position.z;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vDepth = -mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
// gold that brightens around the year in view; the glow variant fades to nothing away from it.
// Both fade out just in front of the camera, where the tube would fill the screen.
const threadFragment = /* glsl */ `
  uniform vec3 uColor, uHot;
  uniform float uPresent, uGlow, uOpacity, uNear;
  varying float vZ, vDepth;
  #include <fog_pars_fragment>
  void main() {
    float near = exp(-pow((vZ - uPresent) / 2.2, 2.0));
    vec3 c = mix(uColor, uHot, near * 0.8);
    float a = (uGlow > 0.5 ? uOpacity * (0.25 + near) : 1.0) * smoothstep(uNear, uNear + 4.5, vDepth);
    if (a < 0.01) discard;
    gl_FragColor = vec4(c, a);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;
const charVertex = /* glsl */ `
  uniform float uTime, uScale;
  attribute float aCell, aSeed;
  varying float vCell, vNear;
  #include <fog_pars_vertex>
  void main() {
    vec3 p = position;
    p.y += sin(uTime * 0.13 + aSeed * 6.283) * 0.22;
    p.x += cos(uTime * 0.09 + aSeed * 4.1) * 0.14;
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = uScale * (0.2 + aSeed * 0.16) / -mvPosition.z;
    vCell = aCell;
    vNear = smoothstep(2.5, 6.0, -mvPosition.z);
    #include <fog_vertex>
  }
`;
const charFragment = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vCell, vNear;
  #include <fog_pars_fragment>
  void main() {
    vec2 cell = vec2(mod(vCell, 16.0), floor(vCell / 16.0));
    vec2 uv = vec2((cell.x + gl_PointCoord.x) / 16.0, 1.0 - (cell.y + gl_PointCoord.y) / 8.0);
    float a = texture2D(uAtlas, uv).a * uOpacity * vNear;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor, a);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export class Cancelled extends Error {}

/** Builds the scene inside `host` and resolves to its handle. Rejects with Cancelled when `signal` was set
 *  while the map loaded (nothing is created then), and with another error when WebGL is unavailable. */
export async function mountTimeline(section: HTMLElement, host: HTMLElement, o: TimelineOptions, signal: { cancelled: boolean }): Promise<TimelineHandle> {
  const map: MapData = await fetch(import.meta.env.BASE_URL + "map/china.json").then((r) => r.json());
  if (signal.cancelled) throw new Cancelled();
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  try {
    return buildScene(renderer, map, section, host, o);
  } catch (err) {
    renderer.dispose(); renderer.forceContextLoss();
    throw err;
  }
}

function buildScene(renderer: THREE.WebGLRenderer, map: MapData, section: HTMLElement, host: HTMLElement, o: TimelineOptions): TimelineHandle {
  const small = Math.min(innerWidth, innerHeight) < 700 || matchMedia("(pointer: coarse)").matches;
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, small ? 1.5 : 2));
  const canvas = renderer.domElement;
  canvas.setAttribute("aria-hidden", "true");
  const labels = document.createElement("div");
  labels.className = "tl-labels";
  labels.setAttribute("aria-hidden", "true");
  const tip = document.createElement("div");
  tip.className = "net-tip";

  const scene = new THREE.Scene();
  const world = new THREE.Group();
  scene.add(world);
  scene.fog = new THREE.Fog(0xffffff, 7, 30);
  const camera = new THREE.PerspectiveCamera(50, 1, 2.2, 600);
  const disposables: { dispose: () => void }[] = [];
  const keep = <T extends { dispose: () => void }>(x: T) => { disposables.push(x); return x; };

  /* ------------------------------------------------------------ colours from the CSS tokens */
  const css: Record<string, string> = {};
  let dark = false;
  const readColours = () => {
    const cs = getComputedStyle(document.documentElement);
    ["bg", "surface", "ink", "ink-2", "muted", "accent", "gold", "rule-strong",
      "s-correct", "s-partly", "s-wrong", "s-declined", "s-unknown", "s-untested", "s-other"]
      .forEach((k) => { css[k] = cs.getPropertyValue("--" + k).trim() || "#888888"; });
    const c = new THREE.Color(css.bg);
    dark = c.r + c.g + c.b < 0.4;
  };
  readColours();
  const col = (k: string) => new THREE.Color(css[k]);
  const sc = (s: Verdict) => css["s-" + s] || css["s-other"];

  const P = (name: string): [number, number] | null => {
    const p = o.places[name];
    return p ? [wx(p.lon), wy(p.lat)] : null;
  };

  /* ------------------------------------------------------------ the map, drawn once as white ink on a transparent sheet */
  const mapTexture = (() => {
    const W = small ? 1024 : 2048, H = Math.round(W * SHEET.h / SHEET.w);
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const g = cv.getContext("2d")!;
    const X = (lon: number) => ((lon - BOUNDS.w) / (BOUNDS.e - BOUNDS.w)) * W;
    const Yp = (lat: number) => ((BOUNDS.n - lat) / (BOUNDS.n - BOUNDS.s)) * H;
    const s = W / 2048;
    g.strokeStyle = g.fillStyle = "#fff"; g.lineCap = g.lineJoin = "round";
    // graticule
    g.globalAlpha = 0.14; g.lineWidth = 1.2 * s; g.setLineDash([6 * s, 12 * s]);
    for (let lon = 104; lon <= 121; lon += 2) { g.beginPath(); g.moveTo(X(lon), 0); g.lineTo(X(lon), H); g.stroke(); }
    for (let lat = 25; lat <= 38; lat += 2) { g.beginPath(); g.moveTo(0, Yp(lat)); g.lineTo(W, Yp(lat)); g.stroke(); }
    g.setLineDash([]);
    const path = (pts: [number, number][]) => {
      g.beginPath();
      g.moveTo(X(pts[0][0]), Yp(pts[0][1]));
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (X(pts[i][0]) + X(pts[i + 1][0])) / 2, my = (Yp(pts[i][1]) + Yp(pts[i + 1][1])) / 2;
        g.quadraticCurveTo(X(pts[i][0]), Yp(pts[i][1]), mx, my);
      }
      const last = pts[pts.length - 1];
      g.lineTo(X(last[0]), Yp(last[1]));
    };
    // coast: a broad wash, then the line
    map.coast.forEach((l) => { path(l.p); g.globalAlpha = 0.07; g.lineWidth = 26 * s; g.stroke(); });
    map.coast.forEach((l) => { path(l.p); g.globalAlpha = 0.85; g.lineWidth = 3 * s; g.stroke(); });
    map.lakes.forEach((l) => { path(l.p); g.closePath(); g.globalAlpha = 0.2; g.fill(); g.globalAlpha = 0.6; g.lineWidth = 1.6 * s; g.stroke(); });
    map.rivers.forEach((l) => {
      const major = MAJOR_RIVERS.has(l.n);
      path(l.p); g.globalAlpha = major ? 0.8 : 0.42; g.lineWidth = (major ? 3.4 : 1.6) * s; g.stroke();
    });
    // mount: a double rule around the sheet, as on a hanging scroll
    g.globalAlpha = 0.55; g.lineWidth = 3 * s; g.strokeRect(14 * s, 14 * s, W - 28 * s, H - 28 * s);
    g.globalAlpha = 0.3; g.lineWidth = 1.2 * s; g.strokeRect(26 * s, 26 * s, W - 52 * s, H - 52 * s);
    const t = keep(new THREE.CanvasTexture(cv));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  })();

  /* ------------------------------------------------------------ sheets: one per year, a stronger one per era */
  const sheetGeo = keep(new THREE.PlaneGeometry(SHEET.w, SHEET.h));
  // two-sided, so the sheets still show when the camera swings round to the side
  const sheet = { transparent: true, depthWrite: false, side: THREE.DoubleSide } as const;
  const silkMat = keep(new THREE.MeshBasicMaterial({ ...sheet, opacity: 0.2 }));
  const inkMat = keep(new THREE.MeshBasicMaterial({ ...sheet, map: mapTexture, opacity: 0.75 }));
  const faintMat = keep(new THREE.MeshBasicMaterial({ ...sheet, map: mapTexture, opacity: 0.09 }));
  const eraSheets = [{ year: 800, zh: "貞元", en: "Zhenyuan · 800" }, ...ERAS.filter((e) => e.start >= 806 && e.start <= 846)
    .map((e) => ({ year: e.start, zh: e.zh, en: `${e.en} ${e.start}` }))];
  const eraYears = new Set(eraSheets.map((e) => e.year));
  eraSheets.forEach((e) => {
    const silk = new THREE.Mesh(sheetGeo, silkMat), ink = new THREE.Mesh(sheetGeo, inkMat);
    silk.position.set(SHEET.x, SHEET.y, wz(e.year)); ink.position.set(SHEET.x, SHEET.y, wz(e.year) + 0.001);
    world.add(silk, ink);
  });
  const yearsOnly = Array.from({ length: 47 }, (_, i) => 800 + i).filter((y) => !eraYears.has(y));
  const faint = new THREE.InstancedMesh(sheetGeo, faintMat, yearsOnly.length);
  const m4 = new THREE.Matrix4();
  yearsOnly.forEach((y, i) => faint.setMatrixAt(i, m4.makeTranslation(SHEET.x, SHEET.y, wz(y))));
  world.add(faint);

  /* ------------------------------------------------------------ rails: each place runs through time */
  const stations = o.stations.filter((s) => P(s.place));
  const career = new Set(stations.map((s) => s.place));
  const used = new Set<string>(career);
  o.rows.forEach((r) => { used.add(r.baiAt); if (P(r.toAt)) used.add(r.toAt); });
  const rails = [...used].map((name) => ({ name, en: o.places[name].en, xy: P(name)!, major: career.has(name), el: null as HTMLElement | null }))
    .sort((a, b) => Number(b.major) - Number(a.major));
  const railGeo = (major: boolean) => {
    const pts: number[] = [];
    rails.filter((r) => r.major === major).forEach((r) => pts.push(r.xy[0], r.xy[1], wz(Y0), r.xy[0], r.xy[1], wz(Y1)));
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  };
  const railMajorMat = keep(new THREE.LineBasicMaterial({ transparent: true, opacity: 0.45 }));
  const railMinorMat = keep(new THREE.LineBasicMaterial({ transparent: true, opacity: 0.22 }));
  world.add(new THREE.LineSegments(railGeo(true), railMajorMat), new THREE.LineSegments(railGeo(false), railMinorMat));
  // a dot where each rail crosses an era sheet
  const dotTex = (() => {
    const cv = document.createElement("canvas"); cv.width = cv.height = 64;
    const g = cv.getContext("2d")!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)"); grad.addColorStop(0.45, "rgba(255,255,255,0.9)"); grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    return keep(new THREE.CanvasTexture(cv));
  })();
  const crossPts: number[] = [];
  rails.forEach((r) => eraSheets.forEach((e) => crossPts.push(r.xy[0], r.xy[1], wz(e.year) + 0.01)));
  const crossGeo = keep(new THREE.BufferGeometry());
  crossGeo.setAttribute("position", new THREE.Float32BufferAttribute(crossPts, 3));
  const crossMat = keep(new THREE.PointsMaterial({ size: 0.09, map: dotTex, transparent: true, depthWrite: false, opacity: 0.8 }));
  world.add(new THREE.Points(crossGeo, crossMat));
  // a gold frame around the sheet of the present year, so the present stays findable from any angle
  const nowMat = keep(new THREE.LineBasicMaterial({ transparent: true, depthWrite: false }));
  const nowGeo = keep(new THREE.BufferGeometry().setFromPoints([[-1, -1], [1, -1], [1, 1], [-1, 1]]
    .map(([sx, sy]) => new THREE.Vector3(SHEET.x + sx * (SHEET.w / 2 + 0.12), SHEET.y + sy * (SHEET.h / 2 + 0.12), 0))));
  const nowFrame = new THREE.LineLoop(nowGeo, nowMat);
  world.add(nowFrame);

  /* ------------------------------------------------------------ Bai Juyi's thread */
  const threadAt = (y: number): V3 => {
    if (!stations.length) return [0, 0, wz(y)];
    let i = stations.findIndex((s) => y <= s.to);
    if (i < 0) i = stations.length - 1;
    const s = stations[i], [x, yy] = P(s.place)!;
    if (y >= s.from || i === 0) return [x, yy, wz(y)];
    const prev = stations[i - 1], [px, py] = P(prev.place)!;   // travelling from the previous posting
    const t = ease(clamp((y - prev.to) / (s.from - prev.to || 1), 0, 1));
    return [px + (x - px) * t, py + (yy - py) * t, wz(y)];
  };
  const tStart = stations[0]?.from ?? 800, tEnd = stations[stations.length - 1]?.to ?? 846;
  const threadPts: THREE.Vector3[] = [];
  for (let y = tStart; y <= tEnd; y += 0.1) threadPts.push(v3(threadAt(y)));
  const threadCurve = new THREE.CatmullRomCurve3(threadPts, false, "centripetal");
  const segs = Math.min(2400, threadPts.length * 3);
  const threadUniforms = (glow: boolean) => THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uColor: { value: new THREE.Color() }, uHot: { value: new THREE.Color() }, uPresent: { value: 0 },
    uGlow: { value: glow ? 1 : 0 }, uOpacity: { value: 0.22 }, uNear: { value: 2.5 },
  }]);
  const threadMat = keep(new THREE.ShaderMaterial({
    vertexShader: threadVertex, fragmentShader: threadFragment, uniforms: threadUniforms(false), fog: true, transparent: true,
  }));
  const glowMat = keep(new THREE.ShaderMaterial({
    vertexShader: threadVertex, fragmentShader: threadFragment, uniforms: threadUniforms(true), fog: true,
    transparent: true, depthWrite: false,
  }));
  world.add(new THREE.Mesh(keep(new THREE.TubeGeometry(threadCurve, segs, 0.022, 8)), threadMat));
  world.add(new THREE.Mesh(keep(new THREE.TubeGeometry(threadCurve, segs, 0.065, 10)), glowMat));
  // a gold lozenge where each posting begins
  const lozGeo = keep(new THREE.OctahedronGeometry(0.075));
  const goldMat = keep(new THREE.MeshBasicMaterial());
  const stationMarks = stations.map((s) => {
    const m = new THREE.Mesh(lozGeo, goldMat);
    m.position.copy(v3(threadAt(s.from)));
    world.add(m);
    return m;
  });
  // the camera follows a smoothed thread so it glides rather than jerks between postings. The thread is
  // sampled finely and blurred once here: a coarse blur of a sudden move is a staircase, which shakes on scroll
  const FS = 0.05, F0 = Y0 - 4, followPts: [number, number][] = [];
  {
    const raw: V3[] = [];
    for (let y = F0; y <= Y1 + 4 + 1e-9; y += FS) raw.push(threadAt(clamp(y, Y0, Y1)));
    const sigma = 1.3 / FS, R = Math.ceil(sigma * 3);
    const wts = Array.from({ length: 2 * R + 1 }, (_, k) => Math.exp(-((k - R) ** 2) / (2 * sigma * sigma)));
    raw.forEach((_, i) => {
      let x = 0, yy = 0, w = 0;
      for (let k = -R; k <= R; k++) { const p = raw[clamp(i + k, 0, raw.length - 1)], g = wts[k + R]; x += p[0] * g; yy += p[1] * g; w += g; }
      followPts.push([x / w, yy / w]);
    });
  }
  const follow = (y: number): V3 => {
    const f = (clamp(y, F0, Y1 + 4) - F0) / FS, i = Math.min(Math.floor(f), followPts.length - 2), a = f - i;
    const [px, py] = followPts[i], [qx, qy] = followPts[i + 1];
    return [px + (qx - px) * a, py + (qy - py) * a, wz(y)];
  };

  /* ------------------------------------------------------------ names */
  const sparkTex = (() => {
    const cv = document.createElement("canvas"); cv.width = cv.height = 64;
    const g = cv.getContext("2d")!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)"); grad.addColorStop(0.2, "rgba(255,255,255,0.8)"); grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    return keep(new THREE.CanvasTexture(cv));
  })();
  const sealTexture = (va: Verdict, vb: Verdict) => {
    const cv = document.createElement("canvas"); cv.width = cv.height = 128;
    const g = cv.getContext("2d")!;
    g.fillStyle = va === "untested" ? css.surface : sc(va);
    g.beginPath(); g.arc(64, 64, 34, 0, Math.PI * 2); g.fill();
    g.lineWidth = 12;
    g.strokeStyle = vb === "untested" ? css["rule-strong"] : sc(vb);
    if (vb === "untested") g.setLineDash([10, 9]);
    g.beginPath(); g.arc(64, 64, 50, 0, Math.PI * 2); g.stroke();
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const stalkMat = keep(new THREE.LineBasicMaterial({ transparent: true, opacity: 0.6 }));
  const dotGeo = keep(new THREE.SphereGeometry(0.022, 10, 8));
  const poemMat = keep(new THREE.MeshBasicMaterial());
  const base = import.meta.env.BASE_URL;

  const nodes: NameNode[] = [];
  // names that land on the same place in the same year share a spot: a letter's destination, or
  // Bai Juyi's own place (where a name always steps off the thread)
  const away = (r: Row) => r.toAt && r.toAt !== r.baiAt ? r.toAt : "";
  const spotOf = (r: Row) => (away(r) || r.baiAt) + "@" + Math.round(mid(r) * 2);
  const spotSize = new Map<string, number>();
  o.rows.forEach((r) => spotSize.set(spotOf(r), (spotSize.get(spotOf(r)) || 0) + 1));
  const crowd = new Map<string, number>();
  [...o.rows].sort((a, b) => mid(a) - mid(b) || Number(a.n) - Number(b.n)).forEach((r, idx) => {
    const [bx, by] = P(r.baiAt)!, z = wz(mid(r)), to = away(r) ? P(r.toAt) : null;
    const from = new THREE.Vector3(bx, by, z);
    const [ax, ay] = to || [bx, by];
    const key = spotOf(r), i = crowd.get(key) || 0;
    crowd.set(key, i + 1);
    // slot 0 is the place itself (only a letter arriving may sit there). One name off the place stands
    // just above it; several stand in two columns above it, spaced for the labels, which are wide
    const slot = to ? i : i + 1, others = spotSize.get(key)! - (to ? 1 : 0);
    let dx = 0, dy = 0;
    if (slot && others === 1) dy = 0.6;
    else if (slot) {
      const k = slot - 1, row = Math.floor(k / 2), last = k === others - 1 && others % 2 === 1;
      dx = last ? 0 : k % 2 ? 0.62 : -0.62;
      dy = 0.5 + row * 0.42;
    }
    const at = new THREE.Vector3(ax + dx, ay + dy, z + i * 0.1);

    const dot = new THREE.Mesh(dotGeo, poemMat);
    dot.position.copy(from);
    world.add(dot);
    let curve: THREE.QuadraticBezierCurve3 | null = null, letter: THREE.Mesh | null = null, spark: THREE.Sprite | null = null;
    if (to) {
      const lift = 0.6 + from.distanceTo(at) * 0.28;
      curve = new THREE.QuadraticBezierCurve3(from, new THREE.Vector3((from.x + at.x) / 2, Math.max(from.y, at.y) + lift, z), at);
      letter = new THREE.Mesh(keep(new THREE.TubeGeometry(curve, 48, 0.013, 6)), keep(new THREE.MeshBasicMaterial({ transparent: true })));
      spark = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: sparkTex, transparent: true, depthWrite: false })));
      spark.scale.setScalar(0.16);
      world.add(letter, spark);
    } else {
      const g = keep(new THREE.BufferGeometry().setFromPoints([from, at]));
      world.add(new THREE.Line(g, stalkMat));
    }
    const sprite = new THREE.Sprite(keep(new THREE.SpriteMaterial({ transparent: true, depthWrite: false })));
    sprite.position.copy(at);
    sprite.scale.setScalar(0.24);
    world.add(sprite);
    // the name, as a link laid over the canvas
    const label = document.createElement("a");
    label.className = "tl-name";
    label.href = base + "?n=" + r.n;
    label.tabIndex = -1;
    label.lang = "zh-Hant";
    label.textContent = r.address;
    labels.appendChild(label);
    nodes.push({ row: r, at, from, curve, group: null, sprite, letter, spark, label, phase: (idx * 0.37) % 1, dy: 0, shown: 1 });
  });
  const byAddress = new Map<string, NameNode[]>();
  nodes.forEach((n) => byAddress.set(n.row.address, [...(byAddress.get(n.row.address) || []), n]));
  // the same form of address in more than one title: linked through time
  const sameness = (a: Row, b: Row) => !a.jianjiao || !b.jianjiao ? "open" : a.jianjiao === b.jianjiao ? "same" : "different";
  const links: { line: THREE.Line; nodes: NameNode[]; kind: string }[] = [];
  byAddress.forEach((g) => {
    if (g.length < 2) return;
    g.forEach((n) => { n.group = g; });
    for (let i = 1; i < g.length; i++) {
      const kind = sameness(g[i - 1].row, g[i].row);
      const geo = keep(new THREE.BufferGeometry().setFromPoints([g[i - 1].at, g[i].at]));
      const mat = keep(kind === "same"
        ? new THREE.LineBasicMaterial({ transparent: true })
        : new THREE.LineDashedMaterial({ transparent: true, dashSize: kind === "different" ? 0.18 : 0.04, gapSize: kind === "different" ? 0.12 : 0.1 }));
      const line = new THREE.Line(geo, mat);
      line.computeLineDistances();
      world.add(line);
      links.push({ line, nodes: [g[i - 1], g[i]], kind });
    }
  });

  /* ------------------------------------------------------------ characters from the poems, drifting */
  const charPool = [...new Set(o.rows.flatMap((r) => (r.poem || []).join("").replace(/[，。、？！；：「」『』（）\[\]\s]/g, "").split("")))];
  const atlasChars = (charPool.length ? charPool : ["白", "居", "易"]).slice(0, 128);
  const atlas = (() => {
    const cv = document.createElement("canvas"); cv.width = 1024; cv.height = 512;
    const g = cv.getContext("2d")!;
    g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "middle";
    g.font = '600 46px "Noto Serif TC", "Songti TC", serif';
    atlasChars.forEach((ch, i) => g.fillText(ch, (i % 16) * 64 + 32, Math.floor(i / 16) * 64 + 34));
    return keep(new THREE.CanvasTexture(cv));
  })();
  const nChars = small ? 90 : 170;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const cPos: number[] = [], cCell: number[] = [], cSeed: number[] = [];
  for (let i = 0; i < nChars; i++) {
    cPos.push(SHEET.x + (rnd() - 0.5) * SHEET.w * 1.4, SHEET.y + (rnd() - 0.5) * SHEET.h * 1.3, wz(Y0) + rnd() * (wz(Y1) - wz(Y0)));
    cCell.push(Math.floor(rnd() * atlasChars.length)); cSeed.push(rnd());
  }
  const charGeo = keep(new THREE.BufferGeometry());
  charGeo.setAttribute("position", new THREE.Float32BufferAttribute(cPos, 3));
  charGeo.setAttribute("aCell", new THREE.Float32BufferAttribute(cCell, 1));
  charGeo.setAttribute("aSeed", new THREE.Float32BufferAttribute(cSeed, 1));
  const charMat = keep(new THREE.ShaderMaterial({
    vertexShader: charVertex, fragmentShader: charFragment, fog: true, transparent: true, depthWrite: false,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uAtlas: { value: null }, uColor: { value: new THREE.Color() }, uOpacity: { value: 0.16 }, uTime: { value: 0 }, uScale: { value: 400 },
    }]),
  }));
  charMat.uniforms.uAtlas.value = atlas;   // set after the merge, which would clone a texture
  world.add(new THREE.Points(charGeo, charMat));

  /* ------------------------------------------------------------ more labels: eras, postings, places */
  const mk = (cls: string, html: string) => {
    const el = document.createElement("div");
    el.className = cls; el.innerHTML = html;
    labels.appendChild(el);
    return el;
  };
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
  const eraLabels = eraSheets.map((e) => ({
    // top right of the sheet: the year readout holds the top left of the screen
    pos: new THREE.Vector3(SHEET.x + SHEET.w / 2 - 0.45, SHEET.y + SHEET.h / 2 - 0.7, wz(e.year)),
    el: mk("tl-era", `<b lang="zh-Hant">${esc(e.zh)}</b><span>${esc(e.en)}</span>`),
  }));
  const stationLabels = stations.map((s, i) => ({
    pos: stationMarks[i].position,
    el: mk("tl-post", `<b lang="zh-Hant">${esc(s.post.split(" · ")[0])}</b><span>${Math.floor(s.from)}</span>`),
  }));
  rails.forEach((r) => { r.el = mk("tl-place" + (r.major ? " major" : ""), `<b lang="zh-Hant">${esc(r.name)}</b><span>${esc(r.en)}</span>`); });

  /* ------------------------------------------------------------ theme */
  const paint = () => {
    readColours();
    const bg = col("bg");
    scene.background = bg;
    (scene.fog as THREE.Fog).color = bg;
    silkMat.color = col("surface"); silkMat.opacity = dark ? 0.26 : 0.34;
    inkMat.color = col(dark ? "ink-2" : "ink"); inkMat.opacity = dark ? 0.5 : 0.62;
    faintMat.color = col("ink"); faintMat.opacity = dark ? 0.07 : 0.08;
    railMajorMat.color = col("ink-2"); railMinorMat.color = col("muted");
    crossMat.color = col("ink-2");
    const gold = col("gold");
    [threadMat, glowMat].forEach((m) => {
      m.uniforms.uColor.value = gold;
      m.uniforms.uHot.value = dark ? new THREE.Color("#ffe3a3") : new THREE.Color("#7a4f00");
    });
    glowMat.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
    glowMat.uniforms.uOpacity.value = dark ? 0.16 : 0.14;
    goldMat.color = gold; nowMat.color = gold;
    poemMat.color = col("ink"); stalkMat.color = col("accent");
    nodes.forEach((n) => {
      const sm = n.sprite.material;
      sm.map?.dispose();
      sm.map = sealTexture(n.row.a.verdict, n.row.b.verdict);
      sm.needsUpdate = true;
      if (n.letter) (n.letter.material as THREE.MeshBasicMaterial).color = col("accent");
      if (n.spark) {
        n.spark.material.color = dark ? new THREE.Color("#ffb8a6") : col("accent");
        n.spark.material.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
      }
    });
    links.forEach((l) => {
      (l.line.material as THREE.LineBasicMaterial).color = col(l.kind === "different" ? "accent" : l.kind === "same" ? "ink" : "muted");
    });
    charMat.uniforms.uColor.value = col("ink");
    charMat.uniforms.uOpacity.value = dark ? 0.2 : 0.15;
    kick();
  };

  /* ------------------------------------------------------------ camera */
  // The camera orbits a target point T in the present year: yaw turns it around T (0 = behind, looking ahead
  // in time), pitch lifts it, dist pulls it back. Every control moves a goal; the camera eases toward it.
  const centre = new THREE.Vector3(SHEET.x, SHEET.y, wz((Y0 + Y1) / 2));
  // from the stage's own shape: the view offset changes camera.aspect while a panel is open
  const portrait = () => W() / H() < 0.85;
  const defDist = () => (portrait() ? 12 : 8.6);
  const DEF_PITCH = 0.18, PITCH_MIN = -1.35, PITCH_MAX = 1.4;
  // seen from the east and above, time runs left to right; on a tall screen the camera looks up from the
  // south instead, so east stays on the right, the map spreads across and time runs top to bottom
  const overviewAngle = () => (portrait() ? { yaw: 0.08, pitch: -1.22 } : { yaw: 1.29, pitch: 0.7 });
  const overviewSquash = () => (portrait() ? 0.19 : 0.3);
  let overviewDist = 60;
  const maxDist = () => overviewDist * 1.35;
  const smooth = (a: number, b: number, x: number) => ease(clamp((x - a) / (b - a), 0, 1));
  // zooming out squeezes time, so the far end of the zoom shows the whole span
  const squashFor = (dist: number) => 1 - (1 - overviewSquash()) * smooth(12, overviewDist, dist);
  const zoomOutFor = (dist: number) => smooth(16, overviewDist * 0.75, dist);
  let zs = 1;
  const setSquash = (s: number) => {
    zs = s;
    world.scale.z = s;
    world.position.z = centre.z * (1 - s);
    world.updateMatrixWorld();
  };
  const squash = (p: THREE.Vector3) => new THREE.Vector3(p.x, p.y, centre.z + (p.z - centre.z) * zs);

  interface View { year: number; x: number; y: number; yaw: number; pitch: number; dist: number }
  const goal: View = { year: T0, x: 0, y: 0, yaw: 0, pitch: DEF_PITCH, dist: 8.6 };
  const cur: View = { ...goal };
  let following = true, playing = false;
  // how quickly the camera catches its goal (ms): quick under a dragging hand, slower for a flight
  const TAU_DRAG = 70, TAU_WHEEL = 190, TAU_FLY = 480;
  let tau = TAU_FLY;
  const inset = { l: 0, r: 0, b: 0 }, insetGoal = { l: 0, r: 0, b: 0 };
  const clampDist = (d: number) => clamp(d, 2.4, maxDist());
  const followXY = (year: number) => {
    // a little ahead of the year, so the view turns into a move before the thread does
    const f = follow(clamp(year + 1.2, Y0, Y1));
    return [f[0] * 0.6, f[1] * 0.6] as const;
  };
  const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  const view = () => o.onView({ following, playing });
  const fly = () => { tau = still.matches ? 1 : TAU_FLY; kick(); };

  // the target's place on the screen: square up the view to the part the panel and time bar leave free
  const fullH = () => (camera.view?.enabled ? camera.view.fullHeight : H());
  const placeCamera = () => {
    setSquash(squashFor(cur.dist));
    const T = new THREE.Vector3(cur.x, cur.y, centre.z + (wz(cur.year) - centre.z) * zs);
    const cp = Math.cos(cur.pitch);
    camera.position.set(T.x + cur.dist * Math.sin(cur.yaw) * cp, T.y + cur.dist * Math.sin(cur.pitch), T.z + cur.dist * Math.cos(cur.yaw) * cp);
    camera.up.set(0, 1, 0);
    camera.lookAt(T);
    const zo = zoomOutFor(cur.dist);
    const fog = scene.fog as THREE.Fog;
    fog.near = cur.dist - 1.5 + zo * 400; fog.far = cur.dist * 1.2 + 20 + zo * 900;
    camera.near = clamp(cur.dist * 0.26, 0.08, 2.2) + zo * 6; camera.far = 600 + zo * 400;
    const w = W(), h = H(), l = Math.round(inset.l), r = Math.round(inset.r), b = Math.round(inset.b);
    if (l > 0 || r > 0 || b > 0) { camera.aspect = (w + l + r) / (h + b); camera.setViewOffset(w + l + r, h + b, r, b, w, h); }
    else { camera.aspect = w / h; camera.clearViewOffset(); }
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    [threadMat, glowMat].forEach((m) => {
      m.uniforms.uPresent.value = wz(cur.year);
      m.uniforms.uNear.value = camera.near + 0.3;
    });
    nowFrame.position.z = wz(cur.year);
    nowMat.opacity = (dark ? 0.32 : 0.42) + zo * 0.45;
    return zo;
  };
  // distance at which the whole box fits the part of the screen the panel and bars leave free, from the overview
  // angle, found by projecting its corners with a camera that sees only that part
  const fitOverview = () => {
    const corners: THREE.Vector3[] = [];
    for (const x of [SHEET.x - SHEET.w / 2, SHEET.x + SHEET.w / 2]) for (const y of [SHEET.y - SHEET.h / 2, SHEET.y + SHEET.h / 2])
      for (const z of [wz(Y0), wz(Y1)]) corners.push(new THREE.Vector3(x, y, z));
    const saved = zs, { yaw, pitch } = overviewAngle();
    setSquash(overviewSquash());
    const fw = Math.max(1, W() - insetGoal.l - insetGoal.r), fh = Math.max(1, H() - insetGoal.b), fov = camera.fov;
    camera.clearViewOffset(); camera.aspect = fw / fh;
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan((fh / (H() + insetGoal.b)) * Math.tan(THREE.MathUtils.degToRad(fov) / 2)));
    camera.updateProjectionMatrix();
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    let d = 60;
    for (let it = 0; it < 5; it++) {
      camera.position.copy(centre).addScaledVector(dir, d); camera.up.set(0, 1, 0); camera.lookAt(centre); camera.updateMatrixWorld();
      let mx = 0, my = 0;
      corners.forEach((c) => { const p = squash(c).project(camera); mx = Math.max(mx, Math.abs(p.x)); my = Math.max(my, Math.abs(p.y)); });
      d *= Math.max(mx / (portrait() ? 0.8 : 0.86), my / (portrait() ? 0.62 : 0.66));
    }
    overviewDist = d;
    camera.fov = fov; camera.updateProjectionMatrix();
    setSquash(saved);
  };

  const resize = () => {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 0.8 ? 64 : 50;
    camera.updateProjectionMatrix();
    charMat.uniforms.uScale.value = (h * renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    fitOverview();
    goal.dist = clampDist(goal.dist);
    kick();
  };

  /* ------------------------------------------------------------ labels each frame */
  const v = new THREE.Vector3();
  const W = () => host.clientWidth, H = () => host.clientHeight;
  // screen position, distance from the camera and pixels per scene unit at that distance
  const screen = (p: THREE.Vector3) => {
    v.copy(p).applyMatrix4(world.matrixWorld);
    const dist = v.distanceTo(camera.position);
    v.project(camera);
    if (v.z > 1 || v.z < -1) return null;
    const ppu = fullH() / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * dist);
    return { x: (v.x * 0.5 + 0.5) * W(), y: (-v.y * 0.5 + 0.5) * H(), dist, ppu };
  };
  const fogAlpha = (dist: number) => {
    const fog = scene.fog as THREE.Fog;
    return clamp((fog.far - dist) / (fog.far - fog.near), 0, 1) * clamp((dist - camera.near - 0.6) / 2.5, 0, 1);
  };
  const place = (el: HTMLElement, x: number, y: number, a: number, s = 1) => {
    // a hidden label must not keep catching taps at its last position
    if (a < 0.03) { if (el.style.opacity !== "0") { el.style.opacity = "0"; el.style.pointerEvents = "none"; } return; }
    el.style.opacity = a.toFixed(2);
    el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-50%) scale(${s.toFixed(3)})`;
  };

  /* ------------------------------------------------------------ focus and the hover note */
  let hover: NameNode | null = null, pinned: NameNode | null = null;
  const fillTip = (n: NameNode) => {
    tip.replaceChildren();
    const line = (text: string, kind?: "strong" | "em", zh?: boolean) => {
      const el = document.createElement(kind || "span");
      if (zh) el.lang = "zh-Hant";
      el.textContent = text;
      tip.append(el, document.createElement("br"));
    };
    const r = n.row, pl = (name: string) => name + (o.places[name] ? " " + o.places[name].en : "");
    line(r.address + "  No. " + r.n, "strong", true);
    line(r.title, undefined, true);
    line(yearLabel(r.time!) + " · " + eraYear(r.time!.from) + " · Bai Juyi at " + pl(r.baiAt));
    line("Round A: " + STATUS[r.a.verdict].en + " · Round B: " + STATUS[r.b.verdict].en);
    line("Select for the details", "em");
    tip.lastChild?.remove();
  };
  let tipFor: NameNode | null = null;
  const placeTip = (n: NameNode | null, x = 0, y = 0) => {
    if (!n) { tip.classList.remove("show"); tipFor = null; return; }
    if (tipFor !== n) { fillTip(n); tipFor = n; }
    tip.classList.add("show");
    const tx = clamp(x + 18, 8, W() - inset.r - tip.offsetWidth - 8), ty = clamp(y - tip.offsetHeight - 18, 8, H() - tip.offsetHeight - 8);
    tip.style.transform = `translate(${tx}px,${ty}px)`;
  };
  const applyFocus = () => {
    const f = hover || pinned, set = new Set<NameNode>(f ? f.group || [f] : []);
    nodes.forEach((n) => {
      const on = !f || set.has(n);
      n.sprite.material.opacity = on ? 1 : 0.25;
      if (n.letter) (n.letter.material as THREE.MeshBasicMaterial).opacity = on ? 0.95 : 0.15;
      if (n.spark) n.spark.material.opacity = on ? 1 : 0.15;
      n.label.classList.toggle("dim", !on);
      n.label.classList.toggle("focus", n === f);
      n.label.classList.toggle("picked", n === pinned);
      n.label.classList.toggle("kin", !!f && on && n !== f);
    });
    links.forEach((l) => { (l.line.material as THREE.LineBasicMaterial).opacity = f ? (l.nodes.some((n) => set.has(n)) ? 1 : 0.12) : 0.55; });
    kick();
  };
  nodes.forEach((n) => {
    n.label.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse" && !pointers.size) { hover = n; applyFocus(); } });
    n.label.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse" && hover === n) { hover = null; applyFocus(); } });
    n.label.addEventListener("click", (e) => {
      // a plain click opens the panel; a click with a modifier keeps the link's own behaviour (new tab)
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      hover = null;
      o.onInteract();
      o.onSelect(n.row.n);
    });
  });

  /* ------------------------------------------------------------ input: turn, move, zoom, travel */
  const pointers = new Map<number, { x: number; y: number }>();
  let gesture: "orbit" | "pan" | "pinch" | null = null, downT = 0, travelled = 0;
  const pinch0 = { d: 1, dist: 1, mx: 0, my: 0 };
  const stopPlaying = () => { if (playing) { playing = false; view(); } };
  // move the target across the screen, at the scale of the target's distance; moving it along the time
  // axis moves the present
  const pan = (dx: number, dy: number) => {
    const per = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * cur.dist) / fullH();
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const d = right.multiplyScalar(-dx * per).addScaledVector(up, dy * per);
    if (following) { following = false; view(); }
    goal.x = clamp(goal.x + d.x, SHEET.x - SHEET.w, SHEET.x + SHEET.w);
    goal.y = clamp(goal.y + d.y, SHEET.y - SHEET.h, SHEET.y + SHEET.h);
    goal.year = clamp(goal.year - d.z / (KZ * zs), T0, T1);
  };
  const startPinch = () => {
    const [a, b] = [...pointers.values()];
    gesture = "pinch"; travelled = 99;
    Object.assign(pinch0, { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, dist: goal.dist, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 });
  };
  const onDown = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest(".tl-name")) return;
    if (e.pointerType === "mouse" && e.button > 2) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { host.setPointerCapture(e.pointerId); } catch { /* the pointer is already gone */ }
    if (pointers.size === 1) {
      gesture = e.button === 1 || e.button === 2 || e.shiftKey || e.ctrlKey || e.metaKey ? "pan" : "orbit";
      downT = performance.now(); travelled = 0;
    } else if (pointers.size === 2) startPinch();
    hover = null; placeTip(null);
    host.classList.add("dragging");
    o.onInteract();
  };
  const onMove = (e: PointerEvent) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    travelled += Math.abs(dx) + Math.abs(dy);
    tau = still.matches ? 1 : TAU_DRAG;
    if (gesture === "orbit") {
      goal.yaw -= dx * 0.0055;
      goal.pitch = clamp(goal.pitch + dy * 0.0045, PITCH_MIN, PITCH_MAX);
    } else if (gesture === "pan") pan(dx, dy);
    else if (gesture === "pinch" && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      goal.dist = clampDist((pinch0.dist * pinch0.d) / d);
      pan(mx - pinch0.mx, my - pinch0.my);
      pinch0.mx = mx; pinch0.my = my;
    }
    kick();
  };
  const onUp = (e: PointerEvent) => {
    if (!pointers.delete(e.pointerId)) return;
    if (pointers.size === 1 && gesture === "pinch") gesture = "orbit";   // the finger left carries on turning
    if (pointers.size) return;
    host.classList.remove("dragging");
    // a click on the empty scene lets go of the name in focus
    if (e.type === "pointerup" && gesture !== "pinch" && travelled < 6 && performance.now() - downT < 500 && pinned) o.onSelect(null);
    gesture = null;
  };
  const noMenu = (e: Event) => e.preventDefault();
  // The wheel moves through time (Ctrl or a trackpad pinch zooms). A turn of the wheel that starts while the
  // stage is not squarely in view, or at either end of time going outward, scrolls the page instead.
  let lastWheel = 0, wheelOwn = false;
  const onWheel = (e: WheelEvent) => {
    const now = performance.now(), fresh = now - lastWheel > 260;
    lastWheel = now;
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? H() : 1;
    const dy = e.deltaY * unit, dx = e.deltaX * unit;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      goal.dist = clampDist(goal.dist * Math.exp(dy * 0.01));
      tau = still.matches ? 1 : TAU_WHEEL; o.onInteract(); kick();
      return;
    }
    if (fresh) {
      const outward = (dy > 0 && goal.year >= T1 - 1e-3) || (dy < 0 && goal.year <= T0 + 1e-3);
      wheelOwn = section.getBoundingClientRect().top > -8 && !outward;
    }
    if (!wheelOwn) return;
    e.preventDefault();
    stopPlaying();
    goal.year = clamp(goal.year + dy * 0.0075, T0, T1);
    if (Math.abs(dx) > Math.abs(dy)) goal.yaw -= dx * 0.003;
    tau = still.matches ? 1 : TAU_WHEEL; o.onInteract(); kick();
  };

  /* ------------------------------------------------------------ frame */
  let raf = 0, inView = true, alive = true, lastNow = 0;
  const visible = () => inView && !document.hidden;
  const boxes: [number, number, number, number][] = [];
  const hit = (x: number, y: number, w: number, h: number) =>
    boxes.some(([bx, by, bw, bh]) => Math.abs(bx - x) < (w + bw) / 2 && Math.abs(by - y) < (h + bh) / 2);
  const settled = () => Math.abs(goal.year - cur.year) < 1e-4 && Math.abs(goal.x - cur.x) < 1e-4 && Math.abs(goal.y - cur.y) < 1e-4
    && Math.abs(wrap(goal.yaw - cur.yaw)) < 1e-4 && Math.abs(goal.pitch - cur.pitch) < 1e-4 && Math.abs(goal.dist - cur.dist) < 1e-4
    && Math.abs(insetGoal.l - inset.l) < 0.5 && Math.abs(insetGoal.r - inset.r) < 0.5 && Math.abs(insetGoal.b - inset.b) < 0.5;

  const frame = (now: number) => {
    raf = 0;
    if (!alive) return;
    // glide by elapsed time, not per frame, so the speed is the same at 60 or 120 Hz and through a dropped frame
    const dt = lastNow ? Math.min(now - lastNow, 100) : 1000 / 60;
    lastNow = now;
    if (playing) {
      goal.year = Math.min(T1, goal.year + dt * 0.00085);   // about a year a second
      if (goal.year >= T1) { playing = false; view(); }
    }
    if (following) [goal.x, goal.y] = followXY(goal.year);
    const k = 1 - Math.exp(-dt / tau);
    cur.year += (goal.year - cur.year) * k;
    cur.x += (goal.x - cur.x) * k;
    cur.y += (goal.y - cur.y) * k;
    cur.yaw += wrap(goal.yaw - cur.yaw) * k;
    cur.pitch += (goal.pitch - cur.pitch) * k;
    cur.dist += (goal.dist - cur.dist) * k;
    const ki = still.matches ? 1 : 1 - Math.exp(-dt / 260);
    inset.l += (insetGoal.l - inset.l) * ki;
    inset.r += (insetGoal.r - inset.r) * ki;
    inset.b += (insetGoal.b - inset.b) * ki;
    if (settled()) { Object.assign(cur, goal); Object.assign(inset, insetGoal); }
    const zo = placeCamera();
    o.onFrame(cur.year, zo);
    const secs = now / 1000;
    charMat.uniforms.uTime.value = still.matches ? 0 : secs;
    nodes.forEach((n) => {
      if (n.spark && n.curve) {
        const p = still.matches ? 0.5 : (secs * 0.28 + n.phase) % 1;
        n.spark.position.copy(n.curve.getPoint(p));
        n.spark.material.opacity = (hover || pinned) && n.sprite.material.opacity < 1 ? 0.15 : Math.sin(Math.PI * p);
      }
    });
    // a marker right in front of the lens would fill the screen
    stationMarks.forEach((m) => { m.visible = m.getWorldPosition(v).distanceTo(camera.position) > camera.near + 2.5; });
    renderer.render(scene, camera);

    // labels: names first, then the places and eras give way to them
    boxes.length = 0;
    const f = hover || pinned;
    let tipShown = false;
    // nearer names (and the one in focus) claim their space first; a farther label that would cover one
    // slides a row up or down, or fades out when there is no room, easing so that nothing jumps
    const glide = still.matches ? 1 : 1 - Math.exp(-dt / 90);
    nodes.map((n) => ({ n, s: screen(n.at) }))
      .sort((a, b) => Number(b.n === f) - Number(a.n === f) || (a.s?.dist ?? 1e9) - (b.s?.dist ?? 1e9))
      .forEach(({ n, s }) => {
        if (!s) { place(n.label, 0, 0, 0); return; }
        const a = fogAlpha(s.dist);
        const scale = clamp(s.ppu / 70, 0.62, 1.25);
        const y0 = s.y - 0.16 * s.ppu - 14 * scale;
        const w = n.row.address.length * 18 * scale + 16, h = 28 * scale, step = h + 4;
        let target = n.dy, room = true;
        if (a > 0.3) {
          // keep the current nudge while it is still clear, so labels do not swap places back and forth
          const tries = [n.dy, 0, -step, step, -2 * step, 2 * step];
          const free = tries.find((d) => !hit(s.x, y0 + d, w, h));
          room = free !== undefined || n === f;
          target = free ?? 0;
        }
        n.dy += (target - n.dy) * glide;
        n.shown += ((room ? 1 : 0) - n.shown) * glide;
        const y = y0 + n.dy, shown = a * n.shown;
        place(n.label, s.x, y, shown * (n.label.classList.contains("dim") ? 0.35 : 1), scale);
        if (shown >= 0.03) n.label.style.pointerEvents = shown > 0.25 ? "auto" : "none";
        n.label.style.zIndex = String(1000 - Math.round(s.dist));
        if (a > 0.3 && room) boxes.push([s.x, y0 + target, w, h]);
        // the hover note follows its name, and only while it is in view
        if (n === hover && a > 0.25) { placeTip(n, s.x, y); tipShown = true; }
      });
    if (!tipShown) placeTip(null);
    const labelZ = zo > 0.5 ? wz(T0) : wz(cur.year);
    rails.forEach((r) => {
      const s = screen(new THREE.Vector3(r.xy[0], r.xy[1], labelZ));
      if (!s) { place(r.el!, 0, 0, 0); return; }
      const a = fogAlpha(s.dist) * (zo > 0.5 ? 0.9 : 1) * (r.major ? 1 : 0.8), w = r.name.length * 15 + 40;
      if (a < 0.05 || hit(s.x, s.y, w, 34)) { place(r.el!, 0, 0, 0); return; }
      boxes.push([s.x, s.y, w, 34]);
      place(r.el!, s.x, s.y + 12, a);
    });
    stationLabels.forEach((l) => {
      const s = screen(l.pos);
      const a = s && zo < 0.5 ? fogAlpha(s.dist) * clamp((14 - s.dist) / 4, 0, 1) : 0;
      if (!s || a < 0.05 || hit(s.x + 40, s.y, 80, 30)) { place(l.el, 0, 0, 0); return; }
      boxes.push([s.x + 40, s.y, 80, 30]);
      place(l.el, s.x + 46, s.y, a);
    });
    let lastEraY = -1e9;
    eraLabels.forEach((l) => {
      const s = screen(l.pos);
      const a = s ? fogAlpha(s.dist) * (zo > 0.5 ? 0.7 : 1) : 0;
      const column = zo > 0.5 && portrait();
      l.el.classList.toggle("flat", column);
      if (!s) { place(l.el, 0, 0, 0); return; }
      // side view on a tall screen: the eras stand in a column down the left edge, level with their sheets
      if (column) {
        if (s.y - lastEraY < 30) { place(l.el, 0, 0, 0); return; }
        lastEraY = s.y;
        place(l.el, 34, s.y, a, 0.62);
      } else place(l.el, s.x, s.y, a, clamp(s.ppu / 60, 0.45, 1.4));
    });

    const moving = !still.matches || playing || !settled();
    if (visible() && moving) raf = requestAnimationFrame(frame);
    else lastNow = 0;   // a paused loop restarts with one ordinary frame, not one long jump
  };
  function kick() { if (!raf && visible() && alive) raf = requestAnimationFrame(frame); }

  /* ------------------------------------------------------------ lifecycle: touch the page only once everything is built */
  host.append(canvas, labels, tip);
  paint();
  resize();
  [goal.x, goal.y] = followXY(goal.year);
  goal.dist = defDist();
  Object.assign(cur, goal);
  placeCamera();
  renderer.compile(scene, camera);
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  const io = new IntersectionObserver((en) => { inView = en[0].isIntersecting; kick(); });
  io.observe(section);
  const onVisibility = () => kick();
  document.addEventListener("visibilitychange", onVisibility);
  const mo = new MutationObserver(paint);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const mq = matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", paint);
  host.addEventListener("pointerdown", onDown);
  host.addEventListener("pointermove", onMove);
  host.addEventListener("pointerup", onUp);
  host.addEventListener("pointercancel", onUp);
  host.addEventListener("contextmenu", noMenu);
  host.addEventListener("wheel", onWheel, { passive: false });
  host.classList.add("ready");
  kick();

  return {
    select: (n, instant) => {
      pinned = nodes.find((m) => m.row.n === n) || null;
      hover = null;
      applyFocus();
      if (!pinned) return;
      // fly to the name: centred, a little closer, seen from behind if the view was far out
      stopPlaying();
      if (following) { following = false; view(); }
      const far = zoomOutFor(goal.dist) > 0.3;
      goal.year = clamp(mid(pinned.row), T0, T1);
      goal.x = pinned.at.x; goal.y = pinned.at.y - 0.25;
      goal.dist = far ? defDist() * 0.8 : clamp(goal.dist, 5, defDist() * 0.9);
      if (far) { goal.yaw = 0; goal.pitch = DEF_PITCH; }
      if (instant) { Object.assign(cur, goal); kick(); } else fly();
    },
    setYear: (year, instant) => {
      goal.year = clamp(year, T0, T1);
      if (instant) { tau = TAU_DRAG; kick(); } else fly();
    },
    move: (d) => {
      if (d.year) { stopPlaying(); goal.year = clamp(goal.year + d.year, T0, T1); }
      if (d.yaw) goal.yaw += d.yaw;
      if (d.pitch) goal.pitch = clamp(goal.pitch + d.pitch, PITCH_MIN, PITCH_MAX);
      if (d.zoom) goal.dist = clampDist(goal.dist * d.zoom);
      tau = still.matches ? 1 : TAU_WHEEL; kick();
    },
    play: (on) => {
      if (on && goal.year >= T1 - 0.05) goal.year = T0;   // from the start again
      if (on && !following) { following = true; goal.yaw = 0; goal.pitch = DEF_PITCH; goal.dist = defDist(); }
      playing = on; view(); fly();
    },
    follow: () => {
      following = true;
      goal.yaw = 0; goal.pitch = DEF_PITCH; goal.dist = defDist();
      view(); fly();
    },
    overview: () => {
      stopPlaying();
      following = false; view();
      const a = overviewAngle();
      goal.year = (Y0 + Y1) / 2; goal.x = centre.x; goal.y = centre.y;
      goal.yaw = a.yaw; goal.pitch = a.pitch; goal.dist = overviewDist;
      fly();
    },
    setInset: (l, r, b) => {
      if (insetGoal.l === l && insetGoal.r === r && insetGoal.b === b) return;
      // the overview's distance depends on the free space; keep a view that is at the overview there
      const atOverview = Math.abs(goal.dist - overviewDist) < 1e-6;
      Object.assign(insetGoal, { l, r, b });
      fitOverview();
      if (atOverview) goal.dist = overviewDist; else goal.dist = clampDist(goal.dist);
      kick();
    },
    destroy: () => {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect(); io.disconnect(); mo.disconnect();
      mq.removeEventListener("change", paint);
      document.removeEventListener("visibilitychange", onVisibility);
      host.removeEventListener("pointerdown", onDown);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerup", onUp);
      host.removeEventListener("pointercancel", onUp);
      host.removeEventListener("contextmenu", noMenu);
      host.removeEventListener("wheel", onWheel);
      nodes.forEach((n) => n.sprite.material.map?.dispose());
      disposables.forEach((d) => d.dispose());
      faint.dispose();
      renderer.dispose();
      canvas.remove(); labels.remove(); tip.remove();
      host.classList.remove("ready", "dragging");
    },
  };
}
