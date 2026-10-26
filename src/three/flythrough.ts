/* Scroll-driven flight over Mount Lu. The relief is real (SRTM elevation); it is drawn as ink on paper. */
import * as THREE from "three";

interface TerrainMeta {
  west: number; east: number; north: number; south: number;
  widthMetres: number; heightMetres: number; maxElevation: number;
}

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((res, rej) => { const im = new Image(); im.decoding = "async"; im.onload = () => res(im); im.onerror = rej; im.src = src; });

// Colours as raw sRGB so the shader output matches the page's paper exactly.
const rgb = (hex: number) => new THREE.Vector3(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
const PAPER = 0xefe7d6, INK = 0x1d2324, MIST = 0xf4eee2, WATER = 0xe4e2d6;

const vertexShader = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vNormal;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uPaper, uInk, uMist, uWater, uSun;
  uniform float uMetresPerY, uFog, uMistTop;
  varying vec3 vWorld;
  varying vec3 vNormal;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }

  void main() {
    vec3 n = normalize(vNormal);
    vec3 toCam = cameraPosition - vWorld;
    float dist = length(toCam);
    vec3 v = toCam / dist;
    float h = vWorld.y * uMetresPerY;              // metres above sea level
    float slope = 1.0 - clamp(n.y, 0.0, 1.0);

    // ink tone: shadowed, steep and high ground takes more ink
    float lit = clamp(dot(n, uSun), 0.0, 1.0);
    float tone = (1.0 - lit) * 0.8 + slope * 0.75 + smoothstep(80.0, 1100.0, h) * 0.4;
    // texture strokes (皴) run down the slope; a dry-brush grain breaks up the wash
    vec2 down = normalize(n.xz + 1e-4);
    vec2 across = vec2(-down.y, down.x);
    float cun = fbm(vec2(dot(vWorld.xz, across) * 0.09, dot(vWorld.xz, down) * 0.012));
    float grain = fbm(vWorld.xz * 0.05);
    float ink = smoothstep(0.30, 0.9, tone + (cun - 0.5) * 0.5 * slope * 2.0 + (grain - 0.5) * 0.35);

    // ridge outlines where a slope turns away from the viewer (not on flat ground seen edge-on)
    float rim = 1.0 - abs(dot(n, v));
    ink = max(ink, smoothstep(0.72, 0.97, rim) * smoothstep(0.12, 0.45, slope) * 0.85);

    // faint contours every 100 m, a little stronger every 500 m
    float c = h / 100.0;
    float line = 1.0 - min(abs(fract(c - 0.5) - 0.5) / max(fwidth(c), 1e-4), 1.0);
    float c5 = h / 500.0;
    float line5 = 1.0 - min(abs(fract(c5 - 0.5) - 0.5) / max(fwidth(c5), 1e-4), 1.0);
    float contour = max(line * 0.16, line5 * 0.32) * step(30.0, h) * (1.0 - smoothstep(600.0, 2600.0, dist));

    // the plain and the water stay mostly paper
    float low = 1.0 - smoothstep(18.0, 70.0, h);
    vec3 ground = mix(uPaper, uWater, low * (1.0 - slope));
    ink *= mix(1.0, 0.18, low);

    vec3 col = mix(ground, uInk, clamp(pow(ink, 1.2) * 0.84 + contour, 0.0, 1.0));

    // valley mist, and distant ridges fading into the paper as in a landscape scroll
    float mist = (1.0 - smoothstep(uMistTop * 0.3, uMistTop, h)) * (0.2 + 0.4 * fbm(vWorld.xz * 0.004));
    col = mix(col, uMist, mist * (1.0 - low * 0.6));
    float fog = 1.0 - exp(-pow(dist * uFog, 1.6));
    col = mix(col, uPaper, clamp(fog, 0.0, 1.0));
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** Builds the scene inside `section` (which must contain #fly-canvas, .fly-labels, .fly-cap, .fly-progress i).
 *  Resolves to a cleanup function. */
export async function mountFlythrough(section: HTMLElement, canvas: HTMLCanvasElement): Promise<() => void> {
  const small = Math.min(innerWidth, innerHeight) < 700 || matchMedia("(pointer: coarse)").matches;
  const base = import.meta.env.BASE_URL + "terrain/";
  const [meta, demImg] = await Promise.all([
    fetch(base + "terrain.json").then((r) => r.json() as Promise<TerrainMeta>),
    loadImage(base + "height.png"),
  ]);

  /* ------------------------------------------------------------ elevation */
  const dw = demImg.width, dh = demImg.height;
  const c2 = document.createElement("canvas");
  c2.width = dw; c2.height = dh;
  const cx2 = c2.getContext("2d", { willReadFrequently: true })!;
  cx2.drawImage(demImg, 0, 0);
  const px = cx2.getImageData(0, 0, dw, dh).data;
  const elev = new Float32Array(dw * dh);
  for (let i = 0; i < dw * dh; i++) elev[i] = px[i * 4] * 256 + px[i * 4 + 1] + px[i * 4 + 2] / 256 - 32768;

  const UNIT = 10;   // metres per scene unit
  const EXAG = 1.5;  // vertical exaggeration (stated in the credit line)
  const W = meta.widthMetres / UNIT, H = meta.heightMetres / UNIT;

  const heightAtUV = (u: number, v: number) => {
    const x = Math.min(dw - 1.001, Math.max(0, u * (dw - 1))), y = Math.min(dh - 1.001, Math.max(0, v * (dh - 1)));
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, i = y0 * dw + x0;
    const h = elev[i] * (1 - fx) * (1 - fy) + elev[i + 1] * fx * (1 - fy) + elev[i + dw] * (1 - fx) * fy + elev[i + dw + 1] * fx * fy;
    return Math.max(0, h);
  };
  const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const groundY = (x: number, z: number) => (heightAtUV(x / W + 0.5, z / H + 0.5) * EXAG) / UNIT;
  const at = (lat: number, lon: number, altMetres?: number) => {
    const u = (lon - meta.west) / (meta.east - meta.west);
    const v = (mercY(meta.north) - mercY(lat)) / (mercY(meta.north) - mercY(meta.south));
    const x = (u - 0.5) * W, z = (v - 0.5) * H;
    return new THREE.Vector3(x, altMetres == null ? groundY(x, z) : (altMetres * EXAG) / UNIT, z);
  };

  /* ------------------------------------------------------------ renderer */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, small ? 1.5 : 2));
  renderer.setClearColor(0x000000, 0); // the paper and sky come from the page behind the canvas

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 5, 60000);
  const sun = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 32), THREE.MathUtils.degToRad(-128));

  // A shader that fails to compile must reject, so the page falls back to the plain captions.
  let shaderFailed = false;
  renderer.debug.onShaderError = () => { shaderFailed = true; };

  const inkMat = new THREE.ShaderMaterial({
    vertexShader, fragmentShader,
    extensions: { derivatives: true }, // fwidth() on WebGL1; built in on WebGL2
    uniforms: {
      uPaper: { value: rgb(PAPER) }, uInk: { value: rgb(INK) }, uMist: { value: rgb(MIST) }, uWater: { value: rgb(WATER) },
      uSun: { value: sun }, uMetresPerY: { value: UNIT / EXAG },
      uFog: { value: small ? 0.0002 : 0.00017 }, uMistTop: { value: 260 },
    },
  });

  /* ------------------------------------------------------------ terrain */
  const segX = small ? 320 : Math.min(dw - 1, 680), segY = Math.round(segX * (H / W));
  const geo = new THREE.PlaneGeometry(W, H, segX, segY);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, groundY(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  scene.add(new THREE.Mesh(geo, inkMat));

  // paper beyond the data, drawn with the same ink so the edge disappears
  const apronGeo = new THREE.PlaneGeometry(W * 12, H * 12);
  apronGeo.rotateX(-Math.PI / 2);
  apronGeo.translate(0, -0.5, 0);
  scene.add(new THREE.Mesh(apronGeo, inkMat));

  /* ------------------------------------------------------------ drifting mist */
  const mistCanvas = document.createElement("canvas");
  mistCanvas.width = mistCanvas.height = 256;
  const g = mistCanvas.getContext("2d")!;
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 40; k++) {
    const x = 128 + (rand() - 0.5) * 128, y = 128 + (rand() - 0.5) * 64, r = 256 * (0.12 + rand() * 0.2);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, "rgba(244,238,226,0.2)"); gr.addColorStop(1, "rgba(244,238,226,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  }
  const mistTex = new THREE.CanvasTexture(mistCanvas);
  mistTex.colorSpace = THREE.SRGBColorSpace;
  const mist = new THREE.Group();
  for (let k = 0; k < (small ? 90 : 160); k++) {
    const p = at(29.43 + rand() * 0.24, 115.88 + rand() * 0.2);
    if ((p.y * UNIT) / EXAG < 380) continue;
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTex, transparent: true, depthWrite: false, opacity: 0.2 + rand() * 0.3, fog: false }));
    const size = 220 + rand() * 420;
    m.scale.set(size, size * 0.38, 1);
    m.position.set(p.x, p.y + 20 + rand() * 80, p.z);
    mist.add(m);
  }
  scene.add(mist);

  /* ------------------------------------------------------------ places */
  let summit = { u: 0.5, v: 0.5, h: 0 };
  for (let y = 0; y < dh; y += 2) for (let x = 0; x < dw; x += 2) {
    const h = elev[y * dw + x];
    if (h > summit.h) summit = { u: x / (dw - 1), v: y / (dh - 1), h };
  }
  const places = [
    { zh: "江州", en: "Jiujiang", p: at(29.705, 115.99) },
    { zh: "長江", en: "Yangtze", p: at(29.748, 116.07) },
    // modern temple site, from the DILA place authority (PL000000018801)
    { zh: "東林寺", en: "Donglin Temple", p: at(29.601618, 115.944301) },
    { zh: "廬山", en: "Mount Lu · " + Math.round(summit.h) + " m", p: new THREE.Vector3((summit.u - 0.5) * W, (summit.h * EXAG) / UNIT, (summit.v - 0.5) * H) },
    { zh: "鄱陽湖", en: "Poyang Lake", p: at(29.46, 116.15) },
  ].map((pl) => {
    const el = document.createElement("div");
    el.className = "fly-label";
    const b = document.createElement("b"); b.lang = "zh-Hant"; b.textContent = pl.zh;
    const s = document.createElement("span"); s.textContent = pl.en;
    el.append(b, s);
    section.querySelector(".fly-labels")!.appendChild(el);
    pl.p.y += 18;
    return { ...pl, el };
  });

  /* ------------------------------------------------------------ camera path: one key per caption */
  const keys = [
    { cam: at(29.762, 115.985, 1500), look: at(29.64, 115.965, 350) },
    { cam: at(29.70, 115.925, 1350), look: at(29.585, 115.96, 700) },
    { cam: at(29.635, 115.93, 1250), look: at(29.565, 115.975, 1000) },
    { cam: at(29.60, 116.015, 1650), look: at(29.555, 115.97, 950) },
    // out over Poyang Lake, then looking back at the mountain (keeps the data's edges behind the camera)
    { cam: at(29.50, 116.15, 1700), look: at(29.535, 116.0, 500) },
    { cam: at(29.43, 116.17, 3000), look: at(29.57, 115.98, 600) },
  ];
  const camCurve = new THREE.CatmullRomCurve3(keys.map((k) => k.cam), false, "centripetal");
  const lookCurve = new THREE.CatmullRomCurve3(keys.map((k) => k.look), false, "centripetal");

  const caps = Array.from(section.querySelectorAll<HTMLElement>(".fly-cap"));
  const bar = section.querySelector<HTMLElement>(".fly-progress i");
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const progress = () => {
    const r = section.getBoundingClientRect();
    return Math.min(1, Math.max(0, -r.top / (r.height - innerHeight || 1)));
  };

  let t = progress(), inView = true, raf = 0, alive = true;
  const visible = () => inView && !document.hidden;
  const camPos = new THREE.Vector3(), look = new THREE.Vector3(), v = new THREE.Vector3();

  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 0.8 ? 62 : 50;
    camera.updateProjectionMatrix();
  };
  resize();

  const frame = (now: number) => {
    raf = 0;
    if (!alive) return;
    const target = progress();
    t += (target - t) * (still ? 1 : 0.075);
    if (Math.abs(target - t) < 0.0002) t = target;

    // getPoint (not getPointAt) keeps each key at an even share of the scroll, in step with the captions
    camCurve.getPoint(t, camPos);
    lookCurve.getPoint(t, look);
    if (!still) camPos.x += Math.sin(now / 4200) * 6;
    camPos.y = Math.max(camPos.y, groundY(camPos.x, camPos.z) + 25);
    // tall phone screens: tilt down so the land, not the sky, fills the frame
    if (camera.aspect < 0.8) look.y -= (camPos.y - look.y) * 0.45 + 60;
    camera.position.copy(camPos);
    camera.lookAt(look);
    mist.children.forEach((m, i) => { ((m as THREE.Sprite).material as THREE.SpriteMaterial).rotation = Math.sin(now / 9000 + i) * 0.04; });
    renderer.render(scene, camera);

    const f = t * (caps.length - 1);
    caps.forEach((c, i) => {
      const o = Math.max(0, 1 - Math.abs(f - i) * 1.8);
      c.style.opacity = o.toFixed(3);
      c.style.transform = `translateY(${((f - i) * -14).toFixed(1)}px)`;
      c.style.visibility = o > 0.01 ? "visible" : "hidden";
    });
    if (bar) bar.style.transform = `scaleX(${t.toFixed(4)})`;

    const w = canvas.clientWidth, h = canvas.clientHeight;
    places.forEach((pl) => {
      v.copy(pl.p).project(camera);
      const dist = camera.position.distanceTo(pl.p);
      const on = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 && dist < 3600;
      pl.el.style.opacity = on ? Math.min(1, (3600 - dist) / 900).toFixed(2) : "0";
      if (on) pl.el.style.transform = `translate(${((v.x * 0.5 + 0.5) * w).toFixed(1)}px,${((-v.y * 0.5 + 0.5) * h).toFixed(1)}px)`;
    });

    if (visible() && (Math.abs(target - t) > 0.0002 || !still)) raf = requestAnimationFrame(frame);
  };
  const kick = () => { if (!raf && visible() && alive) raf = requestAnimationFrame(frame); };

  // Compile now so a broken shader is caught before the canvas is shown.
  renderer.compile(scene, camera);
  if (shaderFailed) {
    geo.dispose(); apronGeo.dispose(); inkMat.dispose(); mistTex.dispose(); renderer.dispose();
    places.forEach((pl) => pl.el.remove());
    throw new Error("terrain shader did not compile");
  }

  const io = new IntersectionObserver((en) => { inView = en[0].isIntersecting; kick(); });
  io.observe(section);
  const vis = () => kick();
  addEventListener("resize", resize);
  addEventListener("scroll", kick, { passive: true });
  document.addEventListener("visibilitychange", vis);
  section.classList.add("fly-ready");
  kick();

  return () => {
    alive = false;
    cancelAnimationFrame(raf);
    io.disconnect();
    removeEventListener("resize", resize);
    removeEventListener("scroll", kick);
    document.removeEventListener("visibilitychange", vis);
    places.forEach((pl) => pl.el.remove());
    geo.dispose(); apronGeo.dispose(); inkMat.dispose();
    mistTex.dispose(); mist.children.forEach((m) => ((m as THREE.Sprite).material as THREE.Material).dispose());
    renderer.dispose();
    section.classList.remove("fly-ready");
  };
}
