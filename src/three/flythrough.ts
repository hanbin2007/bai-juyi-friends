/* Scroll-driven flight over Mount Lu. The relief is real (SRTM elevation); it is drawn as ink on paper:
   per-pixel shading from the elevation, water picked out of the data, moss dots on the ridges,
   labelled places and a small locator map. */
import * as THREE from "three";

interface TerrainMeta {
  west: number; east: number; north: number; south: number;
  widthMetres: number; heightMetres: number; maxElevation: number;
}
type Kind = "region" | "peak" | "site" | "town" | "water";
interface Place { zh: string; en: string; kind: Kind; lat: number; lon: number; approx?: boolean; snap?: number }

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((res, rej) => { const im = new Image(); im.decoding = "async"; im.onload = () => res(im); im.onerror = rej; im.src = src; });

// Colours as raw sRGB so the shader output matches the page's paper exactly.
const rgb = (hex: number) => new THREE.Vector3(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
const PAPER = 0xefe7d6, INK = 0x1d2324, MIST = 0xf4eee2, WATER = 0xdfe0d6;

/* Places. Sources: Donglin Temple, DILA place authority PL000000018801; White Deer Grotto Academy,
   Guling and Nankang (Xingzi), Wikipedia; Wulao Peak snapped to the nearest high point of the data;
   Pipa Pavilion (south bank, east of the Yangtze bridge) and Huajing (about 2 km south-west of Guling)
   are approximate. */
const PLACES: Place[] = [
  { zh: "廬山", en: "Mount Lu", kind: "region", lat: 29.545, lon: 115.99 },
  { zh: "江州", en: "Jiujiang", kind: "town", lat: 29.705, lon: 115.99 },
  { zh: "長江", en: "Yangtze", kind: "water", lat: 29.752, lon: 116.08 },
  { zh: "鄱陽湖", en: "Poyang Lake", kind: "water", lat: 29.46, lon: 116.15 },
  { zh: "琵琶亭", en: "Pipa Pavilion · approx.", kind: "site", lat: 29.746, lon: 116.022, approx: true },
  { zh: "東林寺", en: "Donglin Temple", kind: "site", lat: 29.601618, lon: 115.944301 },
  { zh: "牯嶺", en: "Guling", kind: "town", lat: 29.57024, lon: 115.97675 },
  { zh: "花徑", en: "Huajing · cottage rebuilt · approx.", kind: "site", lat: 29.557, lon: 115.962, approx: true },
  { zh: "五老峰", en: "Wulao Peak", kind: "peak", lat: 29.55, lon: 116.015, snap: 2000 },
  { zh: "白鹿洞書院", en: "White Deer Grotto Academy", kind: "site", lat: 29.51961, lon: 116.03719 },
  { zh: "星子", en: "Xingzi (Nankang)", kind: "town", lat: 29.4472, lon: 116.0417 },
];
const FADE: Record<Kind, number> = { region: 7000, water: 6000, town: 3400, peak: 3600, site: 2600 };
const PRIORITY: Record<Kind, number> = { region: 0, water: 1, peak: 2, town: 3, site: 4 };

const terrainVertex = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const terrainFragment = /* glsl */ `
  uniform sampler2D uDem, uMask;
  uniform vec2 uTexel, uSize;
  uniform vec3 uPaper, uInk, uMist, uWater, uSun;
  uniform float uMetresPerY, uYPerMetre, uFog, uMistTop;
  varying vec3 vWorld;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
  float isoline(float v) { return 1.0 - min(abs(fract(v - 0.5) - 0.5) / max(fwidth(v), 1e-4), 1.0); }

  void main() {
    vec3 toCam = cameraPosition - vWorld;
    float dist = length(toCam);
    vec3 v = toCam / dist;
    float h = vWorld.y * uMetresPerY;               // metres above sea level
    vec2 uv = vec2(vWorld.x / uSize.x + 0.5, vWorld.z / uSize.y + 0.5);
    bool inside = uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0;

    // per-pixel normal from the elevation data (sharper than the mesh)
    vec3 n = vec3(0.0, 1.0, 0.0);
    float water = 0.0;
    if (inside) {
      float hl = texture2D(uDem, uv - vec2(uTexel.x, 0.0)).r, hr = texture2D(uDem, uv + vec2(uTexel.x, 0.0)).r;
      float hn = texture2D(uDem, uv - vec2(0.0, uTexel.y)).r, hs = texture2D(uDem, uv + vec2(0.0, uTexel.y)).r;
      float dx = (hr - hl) * uYPerMetre / (2.0 * uTexel.x * uSize.x);
      float dz = (hs - hn) * uYPerMetre / (2.0 * uTexel.y * uSize.y);
      n = normalize(vec3(-dx, 1.0, -dz));
      water = texture2D(uMask, uv).r;
    }
    float slope = 1.0 - clamp(n.y, 0.0, 1.0);
    float wet = smoothstep(0.35, 0.65, water);
    float near = 1.0 - smoothstep(500.0, 2600.0, dist);

    // ink tone: shadowed, steep and high ground takes more ink
    float lit = clamp(dot(n, uSun), 0.0, 1.0);
    float tone = (1.0 - lit) * 0.8 + slope * 0.75 + smoothstep(80.0, 1100.0, h) * 0.4;
    // texture strokes (皴) run down the slope; a dry-brush grain breaks up the wash
    vec2 down = normalize(n.xz + 1e-4);
    vec2 across = vec2(-down.y, down.x);
    float cun = fbm(vec2(dot(vWorld.xz, across) * 0.11, dot(vWorld.xz, down) * 0.014));
    float grain = fbm(vWorld.xz * 0.06);
    float ink = smoothstep(0.30, 0.9, tone + (cun - 0.5) * 1.1 * slope + (grain - 0.5) * 0.35);

    // ridge lines where a slope turns away from the viewer (not on flat ground seen edge-on)
    float rim = 1.0 - abs(dot(n, v));
    ink = max(ink, smoothstep(0.72, 0.97, rim) * smoothstep(0.12, 0.45, slope) * 0.85);

    // contours: 50 m faint near the camera, 100 m, and 500 m stronger
    float contour = (isoline(h / 50.0) * 0.08 * near + isoline(h / 100.0) * 0.16 + isoline(h / 500.0) * 0.3)
                    * step(30.0, h) * (1.0 - smoothstep(900.0, 3200.0, dist));

    // farmland and plain stay mostly paper
    float low = 1.0 - smoothstep(18.0, 70.0, h);
    ink *= mix(1.0, 0.18, low) * (1.0 - wet);
    vec3 ground = mix(uPaper, mix(uPaper, uWater, 0.4), low * (1.0 - slope));
    vec3 col = mix(ground, uInk, clamp(pow(ink, 1.2) * 0.84 + contour * (1.0 - wet), 0.0, 1.0));

    // water: pale wash, horizontal ripple strokes and an ink shoreline
    float rip = sin(vWorld.z * 0.75 + fbm(vWorld.xz * 0.015) * 7.0);
    float ripple = smoothstep(0.9, 1.0, rip) * step(0.5, fbm(vWorld.xz * 0.03 + 3.1)) * near;
    float shore = 1.0 - smoothstep(0.0, max(fwidth(water) * 1.6, 1e-4), abs(water - 0.5));
    col = mix(col, uWater, wet);
    col = mix(col, uInk, wet * ripple * 0.32 + shore * 0.55 * (1.0 - smoothstep(1500.0, 4500.0, dist)));

    // valley mist, and distant ridges fading into the paper as in a landscape scroll
    float mist = (1.0 - smoothstep(uMistTop * 0.3, uMistTop, h)) * (0.2 + 0.4 * fbm(vWorld.xz * 0.004)) * (1.0 - wet);
    col = mix(col, uMist, mist * (1.0 - low * 0.6));
    float fog = 1.0 - exp(-pow(dist * uFog, 1.6));
    col = mix(col, uPaper, clamp(fog, 0.0, 1.0));
    gl_FragColor = vec4(col, 1.0);
  }
`;

// Moss dots (苔點) and horizontal dabs (米點) scattered on the ridges.
const dotVertex = /* glsl */ `
  attribute float aSize;
  attribute float aKind;
  attribute float aSeed;
  uniform float uScale;
  varying float vKind, vSeed, vDist;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDist = -mv.z;
    gl_PointSize = clamp(aSize * uScale / vDist, 0.0, 11.0);
    gl_Position = projectionMatrix * mv;
    vKind = aKind; vSeed = aSeed;
  }
`;
const dotFragment = /* glsl */ `
  uniform vec3 uInk;
  uniform float uFog;
  varying float vKind, vSeed, vDist;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    if (vKind > 0.5) {
      // horizontal dab: wide and flat, tilted a little
      float a = (vSeed - 0.5) * 0.5;
      p = mat2(cos(a), -sin(a), sin(a), cos(a)) * p;
      p.y *= 2.8;
    }
    // a slightly irregular edge, like ink on paper
    float d = length(p) * (1.0 + 0.1 * sin(atan(p.y, p.x) * 5.0 + vSeed * 17.0));
    float alpha = 1.0 - smoothstep(0.3, 0.5, d);
    float fog = 1.0 - exp(-pow(vDist * uFog, 1.6));
    // dots belong to the middle distance: gone right by the camera and far away
    alpha *= (1.0 - fog) * 0.75 * smoothstep(180.0, 520.0, vDist) * (1.0 - smoothstep(2600.0, 4800.0, vDist));
    if (alpha < 0.02) discard;
    gl_FragColor = vec4(uInk, alpha);
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
  for (let i = 0; i < dw * dh; i++) elev[i] = Math.max(0, px[i * 4] * 256 + px[i * 4 + 1] + px[i * 4 + 2] / 256 - 32768);

  const UNIT = 10;   // metres per scene unit
  const EXAG = 1.5;  // vertical exaggeration (stated in the credit line)
  const W = meta.widthMetres / UNIT, H = meta.heightMetres / UNIT;
  const metresPerPx = meta.widthMetres / dw;

  const elevAt = (x: number, y: number) => elev[Math.min(dh - 1, Math.max(0, y)) * dw + Math.min(dw - 1, Math.max(0, x))];
  const heightAtUV = (u: number, v: number) => {
    const x = Math.min(dw - 1.001, Math.max(0, u * (dw - 1))), y = Math.min(dh - 1.001, Math.max(0, v * (dh - 1)));
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, i = y0 * dw + x0;
    return elev[i] * (1 - fx) * (1 - fy) + elev[i + 1] * fx * (1 - fy) + elev[i + dw] * (1 - fx) * fy + elev[i + dw + 1] * fx * fy;
  };
  const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const uvOf = (lat: number, lon: number) => [
    (lon - meta.west) / (meta.east - meta.west),
    (mercY(meta.north) - mercY(lat)) / (mercY(meta.north) - mercY(meta.south)),
  ];
  const groundY = (x: number, z: number) => (heightAtUV(x / W + 0.5, z / H + 0.5) * EXAG) / UNIT;
  const at = (lat: number, lon: number, altMetres?: number) => {
    const [u, v] = uvOf(lat, lon);
    const x = (u - 0.5) * W, z = (v - 0.5) * H;
    return new THREE.Vector3(x, altMetres == null ? groundY(x, z) : (altMetres * EXAG) / UNIT, z);
  };

  /* ------------------------------------------------------------ water, from the data: SRTM flattens water bodies */
  const mask = new Uint8Array(dw * dh);
  {
    const R = 2;
    for (let y = R; y < dh - R; y++) for (let x = R; x < dw - R; x++) {
      const h0 = elev[y * dw + x];
      if (h0 > 24) continue;
      let flat = true;
      for (let j = -R; j <= R && flat; j++) for (let i = -R; i <= R; i++) {
        if (Math.abs(elev[(y + j) * dw + x + i] - h0) > 0.5) { flat = false; break; }
      }
      if (flat) mask[y * dw + x] = 255;
    }
    // grow each flat patch back to its edge, then drop specks smaller than about 0.2 km²
    const grown = mask.slice();
    for (let y = R; y < dh - R; y++) for (let x = R; x < dw - R; x++) {
      if (mask[y * dw + x]) for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) {
        const k = (y + j) * dw + x + i;
        if (Math.abs(elev[k] - elev[y * dw + x]) <= 0.5) grown[k] = 255;
      }
    }
    const seen = new Uint8Array(dw * dh), minPx = Math.round(200000 / (metresPerPx * metresPerPx));
    const stack: number[] = [], comp: number[] = [];
    for (let s = 0; s < dw * dh; s++) {
      if (!grown[s] || seen[s]) continue;
      stack.length = 0; comp.length = 0; stack.push(s); seen[s] = 1;
      while (stack.length) {
        const k = stack.pop()!; comp.push(k);
        const x = k % dw, y = (k - x) / dw;
        for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + ox, ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= dw || ny >= dh) continue;
          const q = ny * dw + nx;
          if (grown[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
        }
      }
      for (const k of comp) mask[k] = comp.length >= minPx ? 255 : 0;
    }
  }
  const isWater = (u: number, v: number) => mask[Math.round(Math.min(1, Math.max(0, v)) * (dh - 1)) * dw + Math.round(Math.min(1, Math.max(0, u)) * (dw - 1))] > 0;

  /* ------------------------------------------------------------ renderer */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, small ? 1.5 : 2));
  renderer.setClearColor(0x000000, 0); // the paper and sky come from the page behind the canvas
  let shaderFailed = false;
  renderer.debug.onShaderError = () => { shaderFailed = true; };

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 5, 60000);
  const sun = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 32), THREE.MathUtils.degToRad(-128));

  const demTex = new THREE.DataTexture(Uint16Array.from(elev, (h) => THREE.DataUtils.toHalfFloat(h)), dw, dh, THREE.RedFormat, THREE.HalfFloatType);
  const maskTex = new THREE.DataTexture(mask, dw, dh, THREE.RedFormat, THREE.UnsignedByteType);
  for (const t of [demTex, maskTex]) {
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.generateMipmaps = false; t.needsUpdate = true;
  }
  const fogDensity = small ? 0.0002 : 0.00017;

  const inkMat = new THREE.ShaderMaterial({
    vertexShader: terrainVertex, fragmentShader: terrainFragment,
    extensions: { derivatives: true }, // fwidth() on WebGL1; built in on WebGL2
    uniforms: {
      uDem: { value: demTex }, uMask: { value: maskTex },
      uTexel: { value: new THREE.Vector2(1 / dw, 1 / dh) }, uSize: { value: new THREE.Vector2(W, H) },
      uPaper: { value: rgb(PAPER) }, uInk: { value: rgb(INK) }, uMist: { value: rgb(MIST) }, uWater: { value: rgb(WATER) },
      uSun: { value: sun }, uMetresPerY: { value: UNIT / EXAG }, uYPerMetre: { value: EXAG / UNIT },
      uFog: { value: fogDensity }, uMistTop: { value: 260 },
    },
  });

  /* ------------------------------------------------------------ terrain */
  const segX = small ? 420 : dw - 1, segY = Math.round(segX * (H / W));
  const geo = new THREE.PlaneGeometry(W, H, segX, segY);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, groundY(pos.getX(i), pos.getZ(i)));
  scene.add(new THREE.Mesh(geo, inkMat));

  // paper beyond the data, drawn with the same ink so the edge disappears
  const apronGeo = new THREE.PlaneGeometry(W * 12, H * 12);
  apronGeo.rotateX(-Math.PI / 2);
  apronGeo.translate(0, -0.5, 0);
  scene.add(new THREE.Mesh(apronGeo, inkMat));

  /* ------------------------------------------------------------ moss dots on the ridges */
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const dotPos: number[] = [], dotSize: number[] = [], dotKind: number[] = [], dotSeed: number[] = [];
  const wanted = small ? 3500 : 9000;
  for (let tries = 0; tries < wanted * 30 && dotSize.length < wanted; tries++) {
    const x = 4 + Math.floor(rand() * (dw - 8)), y = 4 + Math.floor(rand() * (dh - 8));
    const h = elevAt(x, y);
    if (h < 110 || mask[y * dw + x]) continue;
    let ring = 0;
    for (const [ox, oy] of [[3, 0], [-3, 0], [0, 3], [0, -3], [2, 2], [-2, 2], [2, -2], [-2, -2]]) ring += elevAt(x + ox, y + oy);
    const convex = h - ring / 8;                                   // positive on ridges and knolls
    const gx = elevAt(x + 1, y) - elevAt(x - 1, y), gy = elevAt(x, y + 1) - elevAt(x, y - 1);
    const steep = Math.hypot(gx, gy) / (2 * metresPerPx);
    const p = Math.min(1, Math.max(0, convex / 9)) * 0.85 + (steep > 0.15 && steep < 0.7 ? 0.12 : 0);
    if (rand() > p) continue;
    const wx = ((x + rand() - 0.5) / (dw - 1) - 0.5) * W, wz = ((y + rand() - 0.5) / (dh - 1) - 0.5) * H;
    dotPos.push(wx, groundY(wx, wz) + 1.5, wz);
    dotSize.push(4 + rand() * 6);
    dotKind.push(h < 450 && rand() < 0.7 ? 1 : 0);
    dotSeed.push(rand());
  }
  const dotGeo = new THREE.BufferGeometry();
  dotGeo.setAttribute("position", new THREE.Float32BufferAttribute(dotPos, 3));
  dotGeo.setAttribute("aSize", new THREE.Float32BufferAttribute(dotSize, 1));
  dotGeo.setAttribute("aKind", new THREE.Float32BufferAttribute(dotKind, 1));
  dotGeo.setAttribute("aSeed", new THREE.Float32BufferAttribute(dotSeed, 1));
  const dotMat = new THREE.ShaderMaterial({
    vertexShader: dotVertex, fragmentShader: dotFragment, transparent: true, depthWrite: false,
    uniforms: { uInk: { value: rgb(INK) }, uFog: { value: fogDensity }, uScale: { value: 800 } },
  });
  scene.add(new THREE.Points(dotGeo, dotMat));

  /* ------------------------------------------------------------ drifting mist */
  const mistCanvas = document.createElement("canvas");
  mistCanvas.width = mistCanvas.height = 256;
  const g = mistCanvas.getContext("2d")!;
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
  const snapToPeak = (lat: number, lon: number, radiusM: number) => {
    const [u, v] = uvOf(lat, lon), cx = Math.round(u * (dw - 1)), cy = Math.round(v * (dh - 1));
    const r = Math.round(radiusM / metresPerPx);
    let best = { x: cx, y: cy, h: -1 };
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
      const h = elevAt(x, y);
      if (h > best.h) best = { x, y, h };
    }
    return best;
  };
  let summit = { x: 0, y: 0, h: 0 };
  for (let y = 0; y < dh; y += 1) for (let x = 0; x < dw; x += 1) if (elev[y * dw + x] > summit.h) summit = { x, y, h: elev[y * dw + x] };
  const fromPx = (x: number, y: number, h: number) => new THREE.Vector3((x / (dw - 1) - 0.5) * W, (h * EXAG) / UNIT, (y / (dh - 1) - 0.5) * H);

  const labelHost = section.querySelector(".fly-labels")!;
  const makeLabel = (zh: string, en: string, kind: Kind) => {
    const el = document.createElement("div");
    el.className = "fly-label k-" + kind;
    const b = document.createElement("b"); b.lang = "zh-Hant"; b.textContent = zh;
    const s = document.createElement("span"); s.textContent = en;
    el.append(b, s);
    labelHost.appendChild(el);
    return el;
  };
  const places = PLACES.map((pl) => {
    let p: THREE.Vector3;
    let en = pl.en;
    if (pl.snap) {
      const pk = snapToPeak(pl.lat, pl.lon, pl.snap);
      p = fromPx(pk.x, pk.y, pk.h);
      en += " · " + Math.round(pk.h) + " m";
    } else if (pl.kind === "region") {
      p = at(pl.lat, pl.lon, 1900);   // floats above the massif
    } else {
      p = at(pl.lat, pl.lon);
    }
    if (pl.kind === "water") {
      const [u, v] = uvOf(pl.lat, pl.lon);
      if (!isWater(u, v)) console.warn("Label not on detected water:", pl.zh);
    }
    p.y += pl.kind === "region" ? 0 : 6;
    return { ...pl, en, p, el: makeLabel(pl.zh, en, pl.kind) };
  });
  places.push({
    zh: "大漢陽峰", en: "Dahanyang Peak · " + Math.round(summit.h) + " m", kind: "peak", lat: 0, lon: 0,
    p: fromPx(summit.x, summit.y, summit.h + 4), el: makeLabel("大漢陽峰", "Dahanyang Peak · " + Math.round(summit.h) + " m", "peak"),
  });
  places.sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind]);

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

  /* ------------------------------------------------------------ locator map: hill-shaded paper map with the flight path */
  const locator = document.createElement("canvas");
  locator.className = "fly-locator";
  locator.setAttribute("aria-hidden", "true");
  section.querySelector(".fly-stage")!.appendChild(locator);
  const LW = small ? 108 : 168, LH = Math.round(LW * (H / W));
  const ldpr = Math.min(devicePixelRatio || 1, 2);
  locator.width = LW * ldpr; locator.height = LH * ldpr;
  locator.style.width = LW + "px"; locator.style.height = LH + "px";
  const lctx = locator.getContext("2d")!;
  const baseMap = document.createElement("canvas");
  baseMap.width = LW * ldpr; baseMap.height = LH * ldpr;
  {
    const bctx = baseMap.getContext("2d")!, bw = baseMap.width, bh = baseMap.height;
    const img = bctx.createImageData(bw, bh);
    const sx = sun.x, sz = sun.z, sy = sun.y;
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      const gx = Math.round((x / (bw - 1)) * (dw - 1)), gy = Math.round((y / (bh - 1)) * (dh - 1));
      const step = Math.max(1, Math.round(dw / bw));
      const h = elevAt(gx, gy);
      const dx = (elevAt(gx + step, gy) - elevAt(gx - step, gy)) / (2 * step * metresPerPx) * EXAG;
      const dz = (elevAt(gx, gy + step) - elevAt(gx, gy - step)) / (2 * step * metresPerPx) * EXAG;
      const len = Math.hypot(dx, 1, dz), nx = -dx / len, ny = 1 / len, nz = -dz / len;
      const lit = Math.max(0, nx * sx + ny * sy + nz * sz);
      let ink = Math.min(1, Math.max(0, (1 - lit) * 0.9 + (1 - ny) * 0.6 + Math.min(1, h / 1200) * 0.35 - 0.3)) * 0.8;
      const contour = Math.floor(h / 200) !== Math.floor(elevAt(gx + step, gy) / 200) ? 0.25 : 0;
      const water = mask[gy * dw + gx] > 0;
      if (water) ink = 0;
      const pr = 239, pg = 231, pb = 214, ir = 29, ig = 35, ib = 36;
      const wr = 223, wg = 224, wb = 214;
      const k = Math.min(1, ink + (h > 30 ? contour : 0));
      const o = (y * bw + x) * 4;
      img.data[o] = water ? wr : pr + (ir - pr) * k;
      img.data[o + 1] = water ? wg : pg + (ig - pg) * k;
      img.data[o + 2] = water ? wb : pb + (ib - pb) * k;
      img.data[o + 3] = 255;
    }
    bctx.putImageData(img, 0, 0);
    // flight path
    bctx.strokeStyle = "rgba(176,58,41,0.85)"; bctx.lineWidth = 1.4 * ldpr; bctx.setLineDash([3 * ldpr, 2.5 * ldpr]);
    bctx.beginPath();
    for (let i = 0; i <= 120; i++) {
      const q = camCurve.getPoint(i / 120);
      const mx = (q.x / W + 0.5) * bw, my = (q.z / H + 0.5) * bh;
      if (i) bctx.lineTo(mx, my); else bctx.moveTo(mx, my);
    }
    bctx.stroke(); bctx.setLineDash([]);
    // places
    bctx.fillStyle = "#1d2324";
    places.forEach((pl) => {
      if (pl.kind === "region" || pl.kind === "water") return;
      const mx = (pl.p.x / W + 0.5) * bw, my = (pl.p.z / H + 0.5) * bh;
      bctx.beginPath(); bctx.arc(mx, my, 1.6 * ldpr, 0, Math.PI * 2); bctx.fill();
    });
    // north arrow and 10 km scale bar
    bctx.fillStyle = "#1d2324"; bctx.strokeStyle = "#1d2324"; bctx.lineWidth = 1 * ldpr;
    bctx.font = `600 ${10 * ldpr}px Inter, system-ui, sans-serif`; bctx.textAlign = "center";
    const ax = bw - 14 * ldpr, ay = 10 * ldpr;
    bctx.beginPath(); bctx.moveTo(ax, ay); bctx.lineTo(ax - 4 * ldpr, ay + 9 * ldpr); bctx.lineTo(ax + 4 * ldpr, ay + 9 * ldpr); bctx.closePath(); bctx.fill();
    bctx.fillText("N", ax, ay + 20 * ldpr);
    const kmPx = (bw / (meta.widthMetres / 1000)) * 10;
    const bx = 8 * ldpr, by = bh - 9 * ldpr;
    bctx.fillStyle = "rgba(239,231,214,0.85)"; bctx.fillRect(bx - 3 * ldpr, by - 13 * ldpr, kmPx + 6 * ldpr, 17 * ldpr);
    bctx.fillStyle = "#1d2324";
    bctx.fillRect(bx, by, kmPx, 2 * ldpr);
    bctx.fillRect(bx, by - 3 * ldpr, 1 * ldpr, 5 * ldpr); bctx.fillRect(bx + kmPx - ldpr, by - 3 * ldpr, 1 * ldpr, 5 * ldpr);
    bctx.textAlign = "left"; bctx.font = `500 ${9 * ldpr}px Inter, system-ui, sans-serif`;
    bctx.fillText("10 km", bx, by - 4 * ldpr);
  }
  const drawLocator = (cam: THREE.Vector3, target: THREE.Vector3) => {
    const bw = locator.width, bh = locator.height;
    lctx.drawImage(baseMap, 0, 0);
    const mx = (cam.x / W + 0.5) * bw, my = (cam.z / H + 0.5) * bh;
    const ang = Math.atan2(target.z - cam.z, target.x - cam.x);
    const half = THREE.MathUtils.degToRad(camera.fov * camera.aspect) / 2, r = 26 * ldpr;
    lctx.fillStyle = "rgba(176,58,41,0.18)";
    lctx.beginPath(); lctx.moveTo(mx, my);
    lctx.arc(mx, my, r, ang - Math.min(half, 1.2), ang + Math.min(half, 1.2)); lctx.closePath(); lctx.fill();
    lctx.fillStyle = "#b03a29"; lctx.strokeStyle = "#fffaf3"; lctx.lineWidth = 1.5 * ldpr;
    lctx.beginPath(); lctx.arc(mx, my, 3.5 * ldpr, 0, Math.PI * 2); lctx.fill(); lctx.stroke();
  };

  /* ------------------------------------------------------------ frame loop */
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
    dotMat.uniforms.uScale.value = (h * renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  };
  resize();

  const boxes: [number, number, number, number][] = [];
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
    drawLocator(camPos, look);

    const f = t * (caps.length - 1);
    caps.forEach((c, i) => {
      const o = Math.max(0, 1 - Math.abs(f - i) * 1.8);
      c.style.opacity = o.toFixed(3);
      c.style.transform = `translateY(${((f - i) * -14).toFixed(1)}px)`;
      c.style.visibility = o > 0.01 ? "visible" : "hidden";
    });
    if (bar) bar.style.transform = `scaleX(${t.toFixed(4)})`;

    // labels: fade and shrink with distance; lower-priority labels give way when they would overlap
    const w = canvas.clientWidth, h = canvas.clientHeight;
    boxes.length = 0;
    places.forEach((pl) => {
      v.copy(pl.p).project(camera);
      const dist = camera.position.distanceTo(pl.p), max = FADE[pl.kind];
      const sx = (v.x * 0.5 + 0.5) * w, sy = (-v.y * 0.5 + 0.5) * h;
      let on = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05 && dist < max;
      const scale = Math.max(0.72, Math.min(1.12, 1.25 - dist / max * 0.6));
      const bw = (pl.kind === "region" ? 90 : 70 + pl.en.length * 2.2) * scale, bh = 34 * scale;
      if (on && (sx - bw / 2 < 4 || sx + bw / 2 > w - 4)) on = false;   // would be cut off at the edge
      if (on && boxes.some(([x, y, bw2, bh2]) => Math.abs(x - sx) < (bw + bw2) / 2 && Math.abs(y - sy) < (bh + bh2) / 2)) on = false;
      if (on) boxes.push([sx, sy, bw, bh]);
      pl.el.style.opacity = on ? Math.min(1, (max - dist) / (max * 0.3)).toFixed(2) : "0";
      if (on) pl.el.style.transform = `translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px) scale(${scale.toFixed(3)})`;
    });

    if (visible() && (Math.abs(target - t) > 0.0002 || !still)) raf = requestAnimationFrame(frame);
  };
  const kick = () => { if (!raf && visible() && alive) raf = requestAnimationFrame(frame); };

  const disposeAll = () => {
    places.forEach((pl) => pl.el.remove());
    locator.remove();
    geo.dispose(); apronGeo.dispose(); inkMat.dispose(); demTex.dispose(); maskTex.dispose();
    dotGeo.dispose(); dotMat.dispose();
    mistTex.dispose(); mist.children.forEach((m) => ((m as THREE.Sprite).material as THREE.Material).dispose());
    renderer.dispose();
  };

  // Compile now so a broken shader is caught before the canvas is shown.
  renderer.compile(scene, camera);
  if (shaderFailed) { disposeAll(); throw new Error("terrain shader did not compile"); }

  const io = new IntersectionObserver((en) => { inView = en[0].isIntersecting; kick(); });
  io.observe(section);
  addEventListener("resize", resize);
  addEventListener("scroll", kick, { passive: true });
  document.addEventListener("visibilitychange", kick);
  section.classList.add("fly-ready");
  kick();

  return () => {
    alive = false;
    cancelAnimationFrame(raf);
    io.disconnect();
    removeEventListener("resize", resize);
    removeEventListener("scroll", kick);
    document.removeEventListener("visibilitychange", kick);
    disposeAll();
    section.classList.remove("fly-ready");
  };
}
