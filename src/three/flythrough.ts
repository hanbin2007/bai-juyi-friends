/* Scroll-driven flight over Mount Lu: real elevation (SRTM) draped with Sentinel-2 imagery. */
import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";

interface TerrainMeta {
  west: number; east: number; north: number; south: number;
  widthMetres: number; heightMetres: number; maxElevation: number;
}

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((res, rej) => { const im = new Image(); im.decoding = "async"; im.onload = () => res(im); im.onerror = rej; im.src = src; });

/** Builds the scene inside `section` (which must contain #fly-canvas, .fly-labels, .fly-cap, .fly-progress i).
 *  Resolves to a cleanup function. */
export async function mountFlythrough(section: HTMLElement, canvas: HTMLCanvasElement): Promise<() => void> {
  const small = Math.min(innerWidth, innerHeight) < 700 || matchMedia("(pointer: coarse)").matches;
  const base = import.meta.env.BASE_URL + "terrain/";
  const [meta, demImg, satImg] = await Promise.all([
    fetch(base + "terrain.json").then((r) => r.json() as Promise<TerrainMeta>),
    loadImage(base + "height.png"),
    loadImage(base + (small ? "satellite-2048.jpg" : "satellite-4096.jpg")),
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

  /* ------------------------------------------------------------ renderer, sky, light */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, small ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.55;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 5, 60000);

  // physically based sky, late-afternoon sun from the south-west
  const sky = new Sky();
  sky.scale.setScalar(200000);
  const su = sky.material.uniforms;
  su.turbidity.value = 7; su.rayleigh.value = 1.6; su.mieCoefficient.value = 0.006; su.mieDirectionalG.value = 0.86;
  const sun = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 11), THREE.MathUtils.degToRad(-128));
  su.sunPosition.value.copy(sun);
  scene.add(sky);

  // image-based light from the same sky
  const pmrem = new THREE.PMREMGenerator(renderer);
  const skyScene = new THREE.Scene();
  const sky2 = new Sky();
  sky2.scale.setScalar(1000);
  Object.keys(su).forEach((k) => { sky2.material.uniforms[k].value = su[k].value; });
  skyScene.add(sky2);
  const envRT = pmrem.fromScene(skyScene);
  scene.environment = envRT.texture;

  scene.fog = new THREE.FogExp2(0xcdd2cf, small ? 0.00026 : 0.00023);

  const sunLight = new THREE.DirectionalLight(0xffe2bf, 2.6);
  sunLight.position.copy(sun).multiplyScalar(6000);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(small ? 2048 : 4096, small ? 2048 : 4096);
  const sc = sunLight.shadow.camera;
  sc.left = -W * 0.62; sc.right = W * 0.62; sc.top = H * 0.62; sc.bottom = -H * 0.62; sc.near = 100; sc.far = 16000;
  sunLight.shadow.bias = -0.0004; sunLight.shadow.normalBias = 1.2;
  scene.add(sunLight);
  scene.add(new THREE.HemisphereLight(0xcfd8e6, 0x4a3f2c, 0.35));

  /* ------------------------------------------------------------ terrain */
  const segX = small ? 320 : Math.min(dw - 1, 900), segY = Math.round(segX * (H / W));
  const geo = new THREE.PlaneGeometry(W, H, segX, segY);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, groundY(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();

  const sat = new THREE.Texture(satImg);
  sat.colorSpace = THREE.SRGBColorSpace;
  sat.anisotropy = renderer.capabilities.getMaxAnisotropy();
  sat.minFilter = THREE.LinearMipmapLinearFilter;
  sat.needsUpdate = true;

  const terrainMat = new THREE.MeshStandardMaterial({ map: sat, roughness: 0.93, metalness: 0, envMapIntensity: 0.6 });
  const terrain = new THREE.Mesh(geo, terrainMat);
  terrain.castShadow = true; terrain.receiveShadow = true;
  scene.add(terrain);

  // ground beyond the data takes the imagery's average colour, so the edge melts into the haze
  const avg = document.createElement("canvas");
  avg.width = avg.height = 1;
  const actx = avg.getContext("2d")!;
  actx.drawImage(satImg, 0, 0, 1, 1);
  const [ar, ag, ab] = actx.getImageData(0, 0, 1, 1).data;
  const apronColour = new THREE.Color().setRGB(ar / 255, ag / 255, ab / 255, THREE.SRGBColorSpace).lerp((scene.fog as THREE.FogExp2).color, 0.35);
  const apronGeo = new THREE.PlaneGeometry(W * 12, H * 12), apronMat = new THREE.MeshBasicMaterial({ color: apronColour });
  const apron = new THREE.Mesh(apronGeo, apronMat);
  apron.rotation.x = -Math.PI / 2; apron.position.y = -1;
  scene.add(apron);

  /* ------------------------------------------------------------ mist (Mount Lu is known for its cloud) */
  const mistCanvas = document.createElement("canvas");
  mistCanvas.width = mistCanvas.height = 256;
  const g = mistCanvas.getContext("2d")!;
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 40; k++) {
    const x = 128 + (rand() - 0.5) * 128, y = 128 + (rand() - 0.5) * 64, r = 256 * (0.12 + rand() * 0.2);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, "rgba(255,255,255,0.16)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  }
  const mistTex = new THREE.CanvasTexture(mistCanvas);
  mistTex.colorSpace = THREE.SRGBColorSpace;
  const mist = new THREE.Group();
  for (let k = 0; k < (small ? 90 : 160); k++) {
    const p = at(29.43 + rand() * 0.24, 115.88 + rand() * 0.2);
    // thin wisps over the high ground only, so the ridges stay readable
    if ((p.y * UNIT) / EXAG < 420) continue;
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTex, color: 0xfff6ea, transparent: true, depthWrite: false, opacity: 0.18 + rand() * 0.3 }));
    const size = 180 + rand() * 380;
    m.scale.set(size, size * 0.42, 1);
    m.position.set(p.x, p.y + 30 + rand() * 90, p.z);
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
    { zh: "東林寺", en: "Donglin Temple", p: at(29.6045, 115.9556) },
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

  let t = progress(), visible = true, raf = 0, alive = true;
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

    if (visible && (Math.abs(target - t) > 0.0002 || !still)) raf = requestAnimationFrame(frame);
  };
  const kick = () => { if (!raf && visible && alive) raf = requestAnimationFrame(frame); };

  const io = new IntersectionObserver((en) => { visible = en[0].isIntersecting; kick(); });
  io.observe(section);
  const vis = () => { visible = !document.hidden; kick(); };
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
    geo.dispose(); terrainMat.dispose(); sat.dispose(); apronGeo.dispose(); apronMat.dispose();
    mistTex.dispose(); mist.children.forEach((m) => ((m as THREE.Sprite).material as THREE.Material).dispose());
    envRT.dispose(); pmrem.dispose();
    sky.geometry.dispose(); (sky.material as THREE.Material).dispose();
    sky2.geometry.dispose(); (sky2.material as THREE.Material).dispose();
    renderer.dispose();
    section.classList.remove("fly-ready");
  };
}
