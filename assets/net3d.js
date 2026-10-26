/* 3D network: Bai Juyi at the centre, his poems on an inner sphere, the names in them outside.
   Plain canvas 2D with a hand-rolled perspective projection; no libraries. */
(function () {
  "use strict";

  var host = document.getElementById("net3d");
  var D = window.SITE_DATA;
  if (!host || !D || !D.rows || !D.rows.length) return;
  var canvas = document.createElement("canvas");
  var ctx = canvas.getContext && canvas.getContext("2d");
  if (!ctx) return;
  canvas.setAttribute("aria-hidden", "true");
  host.appendChild(canvas);
  host.classList.add("ready");

  var tip = document.createElement("div");
  tip.className = "net-tip";
  host.appendChild(tip);

  var reduce = matchMedia("(prefers-reduced-motion: reduce)");
  var STATUS_EN = { correct: "Correct", partly: "Partly correct", wrong: "Wrong", declined: "Declined",
    unknown: "Name unknown in 箋校", untested: "Not yet tested", other: "Other" };

  /* ---------------------------------------------------------------- graph */

  function norm3(v) { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }

  var poems = [], byTitle = {};
  D.rows.forEach(function (r) {
    if (!byTitle[r.title]) { byTitle[r.title] = { kind: "poem", title: r.title, rows: [] }; poems.push(byTitle[r.title]); }
    byTitle[r.title].rows.push(r);
  });
  var golden = Math.PI * (3 - Math.sqrt(5));
  poems.forEach(function (p, i) {
    var y = 1 - ((i + 0.5) / poems.length) * 2, rad = Math.sqrt(1 - y * y), th = i * golden;
    p.home = [Math.cos(th) * rad, y * 0.92, Math.sin(th) * rad];
  });

  var names = [];
  poems.forEach(function (p) {
    var n = p.rows.length, up = Math.abs(p.home[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    var t1 = norm3(cross(p.home, up)), t2 = norm3(cross(p.home, t1));
    p.rows.forEach(function (r, j) {
      var a = (j / n) * Math.PI * 2 + 0.6, spread = n > 1 ? 0.2 + n * 0.035 : 0;
      var base = [p.home[0] * 1.72, p.home[1] * 1.72, p.home[2] * 1.72];
      names.push({
        kind: "name", row: r, poem: p,
        home: [base[0] + (t1[0] * Math.cos(a) + t2[0] * Math.sin(a)) * spread,
               base[1] + (t1[1] * Math.cos(a) + t2[1] * Math.sin(a)) * spread,
               base[2] + (t1[2] * Math.cos(a) + t2[2] * Math.sin(a)) * spread]
      });
    });
  });
  var centre = { kind: "centre", home: [0, 0, 0] };
  var nodes = [centre].concat(poems, names);

  // Faint characters drifting in the background, taken from the poems themselves.
  var chars = [];
  (function () {
    var pool = D.rows.map(function (r) { return (r.poem || []).join(""); }).join("").replace(/[，。、？！；：「」『』（）\s]/g, "");
    if (!pool) pool = D.rows.map(function (r) { return r.title; }).join("");
    var seed = 11;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    for (var i = 0; i < 90; i++) {
      var u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, rr = 2.3 + rnd() * 1.6, s = Math.sqrt(1 - u * u);
      chars.push({ ch: pool[Math.floor(rnd() * pool.length)], home: [Math.cos(th) * s * rr, u * rr * 0.8, Math.sin(th) * s * rr] });
    }
  })();

  /* ---------------------------------------------------------------- colours */

  var C = {};
  function readColours() {
    var cs = getComputedStyle(document.documentElement);
    ["ink", "ink-2", "muted", "accent", "surface", "bg", "rule-strong", "s-correct", "s-partly", "s-wrong", "s-declined", "s-unknown", "s-untested", "s-other"]
      .forEach(function (k) { C[k] = cs.getPropertyValue("--" + k).trim() || "#888"; });
    var bg = C.bg.replace("#", "");
    C.dark = bg.length === 6 && (parseInt(bg.slice(0, 2), 16) + parseInt(bg.slice(2, 4), 16) + parseInt(bg.slice(4, 6), 16)) < 200;
  }
  function sc(s) { return C["s-" + s] || C["s-other"]; }
  readColours();
  new MutationObserver(readColours).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", readColours);

  /* ---------------------------------------------------------------- view */

  var W = 0, H = 0, DPR = 1, R = 100, CAM = 4.2;
  var yaw = 0.6, pitch = -0.22, vYaw = 0, vPitch = 0, dragging = false, lastX = 0, lastY = 0, moved = 0;
  var hover = null, born = performance.now(), running = false, visible = true;

  function resize() {
    var r = host.getBoundingClientRect();
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    R = Math.min(W, H) * (W < 520 ? 0.21 : 0.235);
    K = Math.max(0.62, Math.min(1, R / 130)); // shrink marks and labels on small canvases
  }
  var K = 1;

  function project(p, grow) {
    var cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    var x = p[0] * grow, y = p[1] * grow, z = p[2] * grow;
    var x1 = x * cy - z * sy, z1 = x * sy + z * cy;
    var y1 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
    var s = (R * CAM) / (CAM - z2);
    return { x: W / 2 + x1 * s, y: H / 2 - y1 * s, z: z2, s: s / R };
  }

  /* ---------------------------------------------------------------- letters in transit */

  var pulses = [], lastSpawn = 0;
  function spawn(now) {
    if (now - lastSpawn < 320 || pulses.length > 16) return;
    lastSpawn = now;
    var n = names[Math.floor(Math.random() * names.length)];
    pulses.push({ name: n, t: 0, v: 0.006 + Math.random() * 0.004, out: Math.random() < 0.6 });
  }
  function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function pulsePos(p) {
    var t = p.out ? p.t : 2 - p.t; // outward from Bai Juyi, or a reply coming back
    return t < 1 ? lerp(centre.home, p.name.poem.home, t) : lerp(p.name.poem.home, p.name.home, t - 1);
  }

  /* ---------------------------------------------------------------- draw */

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function depthAlpha(z) { return Math.max(0.16, Math.min(1, 0.58 + z * 0.24)); }

  function frame(now) {
    if (!running) return;
    var motion = !reduce.matches;
    var age = (now - born) / 1000;
    var grow = motion ? 1 - Math.pow(1 - Math.min(1, age / 1.8), 3) : 1;

    if (!dragging) {
      yaw += vYaw; pitch += vPitch;
      vYaw *= 0.94; vPitch *= 0.9;
      if (motion && !hover) yaw += 0.0016;
      pitch += (-0.22 - pitch) * 0.02;
    }

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // background characters
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    chars.forEach(function (c) {
      var p = project(c.home, 0.6 + grow * 0.4);
      if (p.z > CAM - 0.5) return;
      ctx.globalAlpha = Math.max(0, (C.dark ? 0.09 : 0.07) + p.z * 0.03);
      ctx.fillStyle = C.ink;
      ctx.font = "500 " + Math.round(Math.min(28, 19 * K * p.s)) + 'px "Noto Serif TC", "Songti TC", serif';
      ctx.fillText(c.ch, p.x, p.y);
    });

    nodes.forEach(function (n) { n.p = project(n.home, grow); });
    var focus = hover ? (hover.kind === "name" ? [hover, hover.poem] : hover.kind === "poem" ? [hover].concat(names.filter(function (m) { return m.poem === hover; })) : null) : null;
    function inFocus(n) { return !focus || focus.indexOf(n) >= 0; }

    // edges
    ctx.lineCap = "round";
    poems.forEach(function (p) {
      var on = focus && inFocus(p);
      ctx.globalAlpha = (on ? 0.7 : focus ? 0.06 : 0.16) * depthAlpha((p.p.z) / 2);
      ctx.strokeStyle = on ? C.accent : C.muted;
      ctx.lineWidth = on ? 1.6 : 1;
      ctx.beginPath(); ctx.moveTo(centre.p.x, centre.p.y); ctx.lineTo(p.p.x, p.p.y); ctx.stroke();
    });
    names.forEach(function (n) {
      var on = focus && inFocus(n) && inFocus(n.poem);
      ctx.globalAlpha = (on ? 0.9 : focus ? 0.08 : 0.4) * depthAlpha(n.p.z);
      ctx.strokeStyle = on ? C.accent : sc(n.row.a.verdict === "untested" ? "untested" : n.row.a.verdict);
      ctx.lineWidth = on ? 1.8 : 1.1;
      ctx.beginPath(); ctx.moveTo(n.poem.p.x, n.poem.p.y); ctx.lineTo(n.p.x, n.p.y); ctx.stroke();
    });

    // pulses
    if (motion && grow >= 1) spawn(now);
    pulses = pulses.filter(function (pl) { pl.t += motion ? pl.v * 1.6 : 0; return pl.t < 2; });
    pulses.forEach(function (pl) {
      var p = project(pulsePos(pl), grow), a = depthAlpha(p.z) * Math.sin(Math.PI * pl.t / 2);
      ctx.globalAlpha = a; ctx.fillStyle = C.accent;
      ctx.beginPath(); ctx.arc(p.x, p.y, 2.4 * K * p.s, 0, Math.PI * 2); ctx.fill();
    });

    // nodes, far to near
    var order = nodes.slice().sort(function (a, b) { return a.p.z - b.p.z; });
    order.forEach(function (n) {
      var p = n.p, a = depthAlpha(p.z) * (focus && !inFocus(n) && n !== centre ? 0.3 : 1);
      ctx.globalAlpha = a;
      if (n.kind === "centre") {
        var s = 46 * K * Math.max(0.8, p.s);
        ctx.fillStyle = C.accent;
        roundRect(p.x - s / 2, p.y - s / 2, s, s, 4); ctx.fill();
        ctx.strokeStyle = C.surface; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.5;
        roundRect(p.x - s / 2 + 4, p.y - s / 2 + 4, s - 8, s - 8, 4); ctx.stroke();
        ctx.globalAlpha = 1; ctx.fillStyle = C.dark ? "#1a0f0b" : "#fffaf3";
        ctx.font = "900 " + Math.round(s * 0.36) + 'px "Noto Serif TC", "Songti TC", serif';
        ctx.fillText("樂", p.x, p.y - s * 0.19); ctx.fillText("天", p.x, p.y + s * 0.2);
        ctx.fillStyle = C.ink; ctx.font = "600 13px Inter, system-ui, sans-serif";
        ctx.fillText("Bai Juyi 白居易", p.x, p.y + s / 2 + 14);
      } else if (n.kind === "poem") {
        var r0 = 3.2 * p.s * (n === hover ? 1.7 : 1);
        ctx.fillStyle = C.ink;
        ctx.beginPath(); ctx.arc(p.x, p.y, r0, 0, Math.PI * 2); ctx.fill();
      } else {
        var r = 6 * K * p.s * (n === hover ? 1.4 : 1), va = n.row.a.verdict, vb = n.row.b.verdict;
        ctx.fillStyle = va === "untested" ? C.surface : sc(va);
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = 2.2 * K * p.s;
        ctx.setLineDash(vb === "untested" ? [2.5, 2.5] : []);
        ctx.strokeStyle = vb === "untested" ? C["rule-strong"] : sc(vb);
        ctx.beginPath(); ctx.arc(p.x, p.y, r + 2.6 * K * p.s, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        // label
        var fs = Math.round(Math.max(10, 14.5 * K * p.s) * (n === hover ? 1.15 : 1));
        ctx.font = "600 " + fs + 'px "Noto Serif TC", "Songti TC", serif';
        var label = n.row.address, tw = ctx.measureText(label).width;
        var lx = p.x, ly = p.y - r - 6 - fs / 2;
        ctx.globalAlpha = a * 0.82; ctx.fillStyle = C.surface;
        roundRect(lx - tw / 2 - 5, ly - fs / 2 - 3, tw + 10, fs + 6, 5); ctx.fill();
        ctx.globalAlpha = a; ctx.fillStyle = n === hover ? C.accent : C.ink;
        ctx.fillText(label, lx, ly + 0.5);
      }
    });
    ctx.globalAlpha = 1;
    requestAnimationFrame(frame);
  }

  /* ---------------------------------------------------------------- interaction */

  function pick(x, y) {
    var best = null, bd = 18;
    names.concat(poems).forEach(function (n) {
      if (!n.p) return;
      var d = Math.hypot(n.p.x - x, n.p.y - y) - (n.kind === "name" ? 4 : 0);
      if (d < bd && n.p.z > -1.6) { bd = d; best = n; }
    });
    return best;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function showTip(n) {
    if (!n) { tip.classList.remove("show"); return; }
    var html;
    if (n.kind === "name") {
      html = '<strong lang="zh-Hant">' + esc(n.row.address) + "</strong> <span>No. " + esc(n.row.n) + '</span><br><span lang="zh-Hant">' + esc(n.row.title) + "</span>" +
        "<br>Round A: " + STATUS_EN[n.row.a.verdict] + " · Round B: " + STATUS_EN[n.row.b.verdict] + "<br><em>Select to open the entry</em>";
    } else {
      html = '<span lang="zh-Hant">' + esc(n.title) + "</span><br>" + n.rows.length + (n.rows.length > 1 ? " names" : " name") + " in this title";
    }
    tip.innerHTML = html;
    tip.classList.add("show");
    var x = Math.min(W - tip.offsetWidth - 8, Math.max(8, n.p.x + 14)), y = Math.max(8, n.p.y - tip.offsetHeight - 14);
    tip.style.transform = "translate(" + x + "px," + y + "px)";
  }
  function local(e) { var r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }

  canvas.addEventListener("pointerdown", function (e) {
    dragging = true; moved = 0; lastX = e.clientX; lastY = e.clientY;
    if (e.pointerType === "mouse") canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", function (e) {
    if (dragging) {
      var dx = e.clientX - lastX, dy = e.clientY - lastY;
      moved += Math.abs(dx) + Math.abs(dy);
      vYaw = dx * 0.006; vPitch = e.pointerType === "mouse" ? dy * 0.004 : 0;
      yaw += vYaw; pitch = Math.max(-1.1, Math.min(1.1, pitch + vPitch));
      lastX = e.clientX; lastY = e.clientY;
      if (moved > 6) { hover = null; showTip(null); }
      return;
    }
    var q = local(e), n = pick(q[0], q[1]);
    if (n !== hover) { hover = n; canvas.style.cursor = n && n.kind === "name" ? "pointer" : "grab"; }
    showTip(hover);
  });
  function end(e) {
    if (!dragging) return;
    dragging = false;
    if (moved < 6) {
      var q = local(e), n = pick(q[0], q[1]);
      if (n && n.kind === "name") {
        document.dispatchEvent(new CustomEvent("open-entry", { detail: String(n.row.n) }));
      } else { hover = n; showTip(n); }
    }
  }
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", function () { dragging = false; });
  canvas.addEventListener("pointerleave", function (e) { if (e.pointerType === "mouse") { hover = null; showTip(null); } });

  /* ---------------------------------------------------------------- lifecycle */

  function start() { if (!running && visible && !document.hidden) { running = true; requestAnimationFrame(frame); } }
  function stop() { running = false; }
  resize();
  addEventListener("resize", resize);
  if ("ResizeObserver" in window) new ResizeObserver(resize).observe(host);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (en) { visible = en[0].isIntersecting; if (visible) start(); else stop(); }).observe(host);
  }
  document.addEventListener("visibilitychange", function () { if (document.hidden) stop(); else start(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { born = Math.min(born, performance.now()); });
  start();
})();
