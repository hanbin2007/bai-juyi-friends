/* Identifying Bai Juyi's Friends — page logic. Data comes from assets/data.js (built by build.py). */
(function () {
  "use strict";

  var D = window.SITE_DATA || { rows: [], counts: {}, meta: {}, method: {} };
  var ROWS = D.rows || [];
  var TOTAL = ROWS.length;

  var STATUS = {
    correct: { en: "Correct", zh: "正確", tip: "The AI named the person 箋校 identifies." },
    partly: { en: "Partly correct", zh: "部分正確", tip: "The answer is partly right (see notes)." },
    wrong: { en: "Wrong", zh: "錯誤", tip: "The AI named someone else." },
    declined: { en: "Declined", zh: "未作答", tip: "The AI gave no name, but 箋校 identifies the person." },
    unknown: { en: "Name unknown in 箋校", zh: "名未詳", tip: "The AI gave no name, and 箋校 does not identify the person either." },
    untested: { en: "Not yet tested", zh: "未測試", tip: "No result recorded yet." },
    other: { en: "Other", zh: "其他", tip: "A verdict the site does not recognise." }
  };
  var ORDER = ["correct", "partly", "wrong", "declined", "unknown", "untested"];
  var CONF = { high: "High 高", medium: "Medium 中", low: "Low 低" };
  var ICON = {
    correct: '<svg viewBox="0 0 16 16" width="9" height="9" aria-hidden="true"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    wrong: '<svg viewBox="0 0 16 16" width="8" height="8" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
    partly: '<svg viewBox="0 0 16 16" width="9" height="9" aria-hidden="true"><path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor"/><circle cx="8" cy="8" r="5.2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    declined: '<svg viewBox="0 0 16 16" width="8" height="8" aria-hidden="true"><path d="M3.5 8h9" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
    unknown: '<span aria-hidden="true" style="font-size:10px">?</span>',
    untested: "",
    other: '<span aria-hidden="true">·</span>'
  };

  // Simplified -> traditional for characters that occur in the data, so 刘十九 finds 劉十九.
  var S2T = { "刘": "劉", "杨": "楊", "张": "張", "吴": "吳", "严": "嚴", "独": "獨", "窦": "竇", "韦": "韋", "郑": "鄭",
    "沈": "沈", "孙": "孫", "诗": "詩", "题": "題", "赠": "贈", "问": "問", "梦": "夢", "东": "東", "韵": "韻",
    "员": "員", "书": "書", "给": "給", "访": "訪", "见": "見", "怀": "懷", "对": "對", "庐": "廬", "页": "頁",
    "卷": "卷", "侍": "侍", "镇": "鎮", "浙": "浙", "宾": "賓", "郎": "郎", "历": "歷", "庾": "庾", "皇": "皇",
    "补": "補", "阙": "闕", "遗": "遺", "拾": "拾", "校": "校", "军": "軍", "录": "錄", "録": "錄", "荅": "答",
    "笺": "箋", "积": "積", "稹": "稹", "绅": "紳", "禹": "禹", "锡": "錫", "虞": "虞", "颍": "潁", "钟": "鍾",
    "园": "園", "觉": "覺", "师": "師", "传": "傳", "亚": "亞", "钦": "欽", "简": "簡", "宽": "寬", "缜": "縝",
    "绩": "績", "处": "處", "厚": "厚", "归": "歸", "敬": "敬", "苏": "蘇", "顾": "顧", "陆": "陸", "萧": "蕭" };

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function norm(s) {
    return String(s || "").toLowerCase().replace(/\s+/g, "").replace(/[一-鿿]/g, function (c) { return S2T[c] || c; });
  }
  function markName(title, name) {
    var i = name ? title.indexOf(name) : -1;
    if (i < 0) return esc(title);
    return esc(title.slice(0, i)) + '<span class="pn">' + esc(name) + "</span>" + esc(title.slice(i + name.length));
  }
  function badge(s, extraTip) {
    var m = STATUS[s] || STATUS.other;
    return '<span class="badge" data-s="' + s + '" data-tip="' + esc(m.tip + (extraTip ? " " + extraTip : "")) + '">' +
      '<span class="ic">' + (ICON[s] || "") + "</span>" + esc(m.en) + ' <span class="zh" lang="zh-Hant">' + m.zh + "</span></span>";
  }
  function pct(n, d) { return d ? Math.round((n / d) * 100) : 0; }
  function tested(rnd) { return ROWS.filter(function (r) { return r[rnd].verdict !== "untested"; }).length; }
  function countBy(rnd) {
    var c = {};
    ORDER.concat("other").forEach(function (k) { c[k] = 0; });
    ROWS.forEach(function (r) { c[r[rnd].verdict] = (c[r[rnd].verdict] || 0) + 1; });
    return c;
  }

  /* ------------------------------------------------------------ theme & nav */

  function initChrome() {
    var root = document.documentElement;
    var btn = $(".theme-btn");
    if (btn) {
      btn.addEventListener("click", function () {
        var dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
        var next = dark ? "light" : "dark";
        root.dataset.theme = next;
        try { localStorage.setItem("theme", next); } catch (e) { /* storage blocked: theme lasts for this page only */ }
        btn.setAttribute("aria-label", next === "dark" ? "Switch to light theme" : "Switch to dark theme");
      });
    }
    var menu = $(".menu-btn"), nav = $(".nav");
    if (menu && nav) {
      menu.addEventListener("click", function () {
        var open = nav.classList.toggle("open");
        menu.setAttribute("aria-expanded", open ? "true" : "false");
      });
      nav.addEventListener("click", function (e) { if (e.target.closest("a")) { nav.classList.remove("open"); menu.setAttribute("aria-expanded", "false"); } });
    }
    $$("[data-built]").forEach(function (el) { el.textContent = D.meta.built || "—"; });
    $$("[data-sha]").forEach(function (el) { el.textContent = (D.meta.sha256 || "").slice(0, 12); });
    $$("[data-total]").forEach(function (el) { el.textContent = TOTAL; });
    $$("[data-tested-a]").forEach(function (el) { el.textContent = tested("a"); });
    $$("[data-tested-b]").forEach(function (el) { el.textContent = tested("b"); });
    $$("[data-poems]").forEach(function (el) {
      el.textContent = Object.keys(ROWS.reduce(function (o, r) { o[r.title] = 1; return o; }, {})).length;
    });
    $$(".copy[data-copy]").forEach(function (b) {
      b.addEventListener("click", function () {
        var src = document.getElementById(b.dataset.copy);
        var text = src ? src.innerText.trim() : "";
        var done = function () { var t = b.textContent; b.textContent = "Copied"; setTimeout(function () { b.textContent = t; }, 1400); };
        if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () {});
      });
    });
    initTooltip();
    initToc();
  }

  function initTooltip() {
    var tip = document.createElement("div");
    tip.className = "tooltip";
    tip.setAttribute("role", "tooltip");
    document.body.appendChild(tip);
    var current = null;
    function show(el, x, y) {
      current = el;
      tip.innerHTML = el.dataset.tipHtml || esc(el.dataset.tip);
      tip.classList.add("show");
      place(el, x, y);
    }
    function place(el, x, y) {
      var r = el.getBoundingClientRect();
      var tw = tip.offsetWidth, th = tip.offsetHeight;
      var left = x != null ? x + 14 : r.left + r.width / 2 - tw / 2;
      var top = y != null ? y + 16 : r.top - th - 10;
      if (top < 8) top = r.bottom + 10;
      left = Math.max(8, Math.min(left, innerWidth - tw - 8));
      if (top + th > innerHeight - 8) top = (y != null ? y : r.top) - th - 12;
      tip.style.left = left + "px";
      tip.style.top = top + "px";
    }
    function hide() { current = null; tip.classList.remove("show"); }
    document.addEventListener("mouseover", function (e) {
      var el = e.target.closest("[data-tip],[data-tip-html]");
      if (el && el !== current) show(el, e.clientX, e.clientY);
      else if (!el && current) hide();
    });
    document.addEventListener("mousemove", function (e) { if (current && current.contains(e.target)) place(current, e.clientX, e.clientY); });
    document.addEventListener("focusin", function (e) { var el = e.target.closest("[data-tip],[data-tip-html]"); if (el) show(el); });
    document.addEventListener("focusout", hide);
    addEventListener("scroll", hide, { passive: true });
  }

  function initToc() {
    var links = $$(".toc a");
    if (!links.length || !("IntersectionObserver" in window)) return;
    var map = {};
    links.forEach(function (a) { map[a.getAttribute("href").slice(1)] = a; });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          links.forEach(function (a) { a.classList.remove("active"); });
          if (map[en.target.id]) map[en.target.id].classList.add("active");
        }
      });
    }, { rootMargin: "-20% 0px -70% 0px" });
    Object.keys(map).forEach(function (id) { var s = document.getElementById(id); if (s) io.observe(s); });
  }

  /* ------------------------------------------------------------ home: letter card */

  function initLetter() {
    var cols = $(".letter-cols"), cap = $(".letter-caption"), card = $(".letter");
    if (!cols || !TOTAL) return;
    var i = 0, timer = null, PER = 14, NCOLS = 8;

    function columns(row) {
      // Split the title into columns of at most PER characters without breaking the name.
      var t = row.title, a = row.address, at = a ? t.indexOf(a) : -1, out = [], cur = "", k = 0;
      while (k < t.length) {
        if (k === at) {
          if (cur.length + a.length > PER) { out.push(cur); cur = ""; }
          cur += "\u0000" + a + "\u0001"; k += a.length;
        } else { cur += t[k]; k++; }
        if (cur.replace(/[\u0000\u0001]/g, "").length >= PER) { out.push(cur); cur = ""; }
      }
      if (cur) out.push(cur);
      return out.map(function (c) {
        return esc(c).replace("\u0000", '<span class="pn">').replace("\u0001", "</span>");
      });
    }
    function render(row) {
      var titleCols = columns(row);
      var html = titleCols.map(function (c) { return '<div class="letter-col">' + c + "</div>"; });
      while (html.length < NCOLS - 1) html.push('<div class="letter-col"></div>');
      html = html.slice(0, NCOLS - 1);
      html.push('<div class="letter-col meta">白居易　箋校' + esc(row.locate) + "</div>");
      cols.innerHTML = html.join("");
      cap.innerHTML = "No. " + esc(row.n) + " of " + TOTAL + ' · <span lang="zh-Hant">' + esc(row.address) +
        '</span> · <a href="#r' + esc(row.n) + '" data-open="' + esc(row.n) + '">See this entry</a>';
    }
    function next() {
      card.classList.add("fading");
      setTimeout(function () { i = (i + 1) % TOTAL; render(ROWS[i]); card.classList.remove("fading"); }, 450);
    }
    var still = matchMedia("(prefers-reduced-motion: reduce)").matches, held = false;
    function start() { if (!timer && !still && !held) timer = setInterval(next, 5200); }
    function stop() { clearInterval(timer); timer = null; }
    render(ROWS[0]);
    start();
    card.addEventListener("mouseenter", stop);
    card.addEventListener("mouseleave", start);
    document.addEventListener("visibilitychange", function () { if (document.hidden) stop(); else start(); });
    letterApi = {
      // Show a given row (from a tile hover) and hold it until release().
      show: function (idx) { held = true; stop(); if (i !== idx) { i = idx; render(ROWS[i]); } },
      release: function () { held = false; start(); }
    };
  }
  var letterApi = null;

  /* ------------------------------------------------------------ home: mosaic, filters, table */

  var state = { q: "", s: "all", r: "either" };

  function rowMatchesStatus(row) {
    if (state.s === "all") return true;
    if (state.r === "a") return row.a.verdict === state.s;
    if (state.r === "b") return row.b.verdict === state.s;
    return row.a.verdict === state.s || row.b.verdict === state.s;
  }
  function rowMatchesQuery(row) {
    if (!state.q) return true;
    if (!row._hay) {
      row._hay = norm([row.n, row.title, row.address, row.a.answer, row.b.answer, row.b.sources, row.jianjiao, row.notes, row.locate].join("|"));
    }
    return row._hay.indexOf(norm(state.q)) >= 0;
  }

  function roundCell(r, label) {
    var html = "";
    if (r.answer) html += '<div class="ans" lang="zh-Hant">' + esc(r.answer) + "</div>";
    else if (r.verdict !== "untested") html += '<div class="ans empty">No name given</div>';
    var meta = [];
    if (r.confidence) meta.push('<span class="conf" data-tip="Confidence the AI stated">' + esc(CONF[r.confidence] || r.confidence) + "</span>");
    meta.push(badge(r.verdict, r.verdict === "other" ? "Recorded as: " + r.verdictRaw : ""));
    return '<td class="c-round" data-label="' + label + '">' + html + '<div class="meta-line">' + meta.join("") + "</div></td>";
  }

  function detailHtml(row) {
    function kv(k, v, zh) {
      return "<dt>" + k + (zh ? ' <span lang="zh-Hant">' + zh + "</span>" : "") + "</dt>" +
        (v ? '<dd lang="zh-Hant">' + esc(v) + "</dd>" : '<dd class="empty">Not recorded yet</dd>');
    }
    var poem = row.poem
      ? '<figure class="poem" lang="zh-Hant"><span class="ptitle">' + markName(row.title, row.address) + "</span>" +
        row.poem.map(esc).join("<br>") + "</figure>" +
        '<p class="poem-note">Text from the open <a href="https://github.com/chinese-poetry/chinese-poetry" rel="noopener">chinese-poetry</a> edition of 全唐詩, for reading only. It leaves out Bai Juyi\'s own notes (自注) and may differ from 箋校.</p>'
      : '<p class="poem-note">Poem text not available.</p>';
    return '<div class="detail-inner">' +
      "<div><h4>Round A <span>僅詩題</span> · title only</h4><dl class=\"kv\">" +
      kv("Answer", row.a.answer) + kv("Confidence", CONF[row.a.confidence] || row.a.confidence) +
      "<dt>Verdict</dt><dd>" + badge(row.a.verdict) + "</dd></dl>" +
      "<h4 style=\"margin-top:20px\">Round B <span>詩題＋史料</span> · title + sources</h4><dl class=\"kv\">" +
      kv("Answer", row.b.answer) + kv("Confidence", CONF[row.b.confidence] || row.b.confidence) +
      kv("Sources the AI cited", row.b.sources) +
      "<dt>Verdict</dt><dd>" + badge(row.b.verdict) + "</dd></dl>" +
      "<h4 style=\"margin-top:20px\">Checked against <span>白居易集箋校</span></h4><dl class=\"kv\">" +
      kv("Identification", row.jianjiao) + kv("Where", row.locate, "卷·頁") + kv("Notes", row.notes) + "</dl>" +
      '<p class="row-link" style="margin-top:16px">Link to this entry: <a href="#r' + esc(row.n) + '">#r' + esc(row.n) + "</a></p></div>" +
      "<div><h4>The poem <span>原詩</span></h4>" + poem + "</div></div>";
  }

  function initRecord() {
    var tbody = $("#record-body");
    if (!tbody) return;
    var mosaic = $("#mosaic");

    // mosaic
    mosaic.innerHTML = ROWS.map(function (row) {
      var tipHtml = "<strong>" + esc(row.n) + ". " + esc(row.address) + '</strong><br><span class="zh">' + esc(row.title) + "</span><br>" +
        "Round A: " + esc(STATUS[row.a.verdict].en) + "<br>Round B: " + esc(STATUS[row.b.verdict].en);
      return '<a class="tile" href="#r' + esc(row.n) + '" data-open="' + esc(row.n) + '" data-tip-html="' + esc(tipHtml) + '" ' +
        'aria-label="' + esc(row.n + ". " + row.address + ": Round A " + STATUS[row.a.verdict].en + ", Round B " + STATUS[row.b.verdict].en) + '">' +
        '<span class="num">' + esc(row.n) + "</span>" +
        '<span class="name' + (row.address.length >= 4 ? " long" : "") + '" lang="zh-Hant">' + esc(row.address) + "</span>" +
        '<span class="bars"><span class="bar">A<i data-s="' + row.a.verdict + '"></i></span><span class="bar">B<i data-s="' + row.b.verdict + '"></i></span></span></a>';
    }).join("");

    // table
    tbody.innerHTML = ROWS.map(function (row) {
      return '<tr class="row" id="r' + esc(row.n) + '" data-n="' + esc(row.n) + '" tabindex="0" aria-expanded="false">' +
        '<td class="c-n">' + esc(row.n) + "</td>" +
        '<td class="c-addr" data-label="Form of address 稱謂"><span class="addr" lang="zh-Hant" data-n="No. ' + esc(row.n) + '">' + esc(row.address) + "</span></td>" +
        '<td class="c-title" data-label="Poem title 詩題"><span class="title" lang="zh-Hant">' + markName(row.title, row.address) + "</span></td>" +
        roundCell(row.a, "Round A · title only") + roundCell(row.b, "Round B · with sources") +
        '<td class="c-jj" data-label="箋校 identification">' +
        (row.jianjiao ? '<div class="jj" lang="zh-Hant">' + esc(row.jianjiao) + "</div>" : '<div class="jj empty">To be checked <span lang="zh-Hant">待核</span></div>') +
        '<span class="loc">' + esc(row.locate) + "</span></td>" +
        '<td class="c-x"><span class="toggle-ic" aria-hidden="true"><svg viewBox="0 0 16 16" width="14" height="14"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span class="sr-only">Show details</span></td>' +
        "</tr>" +
        '<tr class="detail" data-for="' + esc(row.n) + '" hidden><td colspan="7"></td></tr>';
    }).join("");

    function toggle(n, force) {
      var tr = document.getElementById("r" + n);
      if (!tr) return;
      var det = tr.nextElementSibling;
      var open = force != null ? force : det.hidden;
      if (open && !det.firstChild.innerHTML) {
        var row = ROWS.filter(function (r) { return String(r.n) === String(n); })[0];
        det.firstChild.innerHTML = detailHtml(row);
      }
      det.hidden = !open;
      tr.classList.toggle("open", open);
      tr.setAttribute("aria-expanded", open ? "true" : "false");
    }
    function reveal(n) {
      var tr = document.getElementById("r" + n);
      if (!tr) return;
      if (tr.hidden) { state = { q: "", s: "all", r: state.r }; syncControls(); apply(); }
      toggle(n, true);
      // Land below the sticky header and filter bar.
      var ctrl = $(".controls"), head = $(".site-header");
      var offset = (head ? head.offsetHeight : 0) + 8 +
        (ctrl && getComputedStyle(ctrl).position === "sticky" ? ctrl.offsetHeight : 0);
      var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
      scrollTo({ top: tr.getBoundingClientRect().top + pageYOffset - offset, behavior: reduce ? "auto" : "smooth" });
      tr.classList.remove("flash"); void tr.offsetWidth; tr.classList.add("flash");
    }

    tbody.addEventListener("click", function (e) {
      if (e.target.closest("a, button")) return;
      var tr = e.target.closest("tr.row");
      if (tr) toggle(tr.dataset.n);
    });
    tbody.addEventListener("keydown", function (e) {
      var tr = e.target.closest("tr.row");
      if (tr && e.target === tr && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toggle(tr.dataset.n); }
    });
    document.addEventListener("click", function (e) {
      var a = e.target.closest("[data-open]");
      if (!a) return;
      e.preventDefault();
      history.replaceState(null, "", "#r" + a.dataset.open);
      reveal(a.dataset.open);
    });
    document.addEventListener("open-entry", function (e) {
      history.replaceState(null, "", "#r" + e.detail);
      reveal(e.detail);
    });

    // Pointing at a tile writes its title on the letter paper.
    $$(".tile", mosaic).forEach(function (tile, idx) {
      function on() {
        if (!letterApi) return;
        $$(".tile.active", mosaic).forEach(function (t) { t.classList.remove("active"); });
        tile.classList.add("active");
        letterApi.show(idx);
      }
      function off() { tile.classList.remove("active"); if (letterApi) letterApi.release(); }
      tile.addEventListener("mouseenter", on);
      tile.addEventListener("focus", on);
      tile.addEventListener("mouseleave", off);
      tile.addEventListener("blur", off);
    });

    // controls
    var input = $("#search"), clear = $("#search-clear"), chips = $("#chips"), seg = $("#round-seg");
    function chipCounts() {
      var c = {};
      ORDER.forEach(function (s) {
        c[s] = ROWS.filter(function (row) {
          if (state.r === "a") return row.a.verdict === s;
          if (state.r === "b") return row.b.verdict === s;
          return row.a.verdict === s || row.b.verdict === s;
        }).length;
      });
      return c;
    }
    function renderChips() {
      var c = chipCounts();
      chips.innerHTML = '<button class="chip" type="button" data-s="all" aria-pressed="' + (state.s === "all") + '">All <b>' + TOTAL + "</b></button>" +
        ORDER.map(function (s) {
          return '<button class="chip" type="button" data-s="' + s + '" aria-pressed="' + (state.s === s) + '"' + (c[s] || state.s === s ? "" : " disabled") + ">" +
            "<i" + (s === "untested" ? ' class="hatch"' : "") + "></i>" + STATUS[s].en + ' <span lang="zh-Hant">' + STATUS[s].zh + "</span> <b>" + c[s] + "</b></button>";
        }).join("");
    }
    function syncControls() {
      input.value = state.q;
      clear.hidden = !state.q;
      $$("button", seg).forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.r === state.r ? "true" : "false"); });
      renderChips();
    }
    function apply() {
      var shown = 0;
      ROWS.forEach(function (row, idx) {
        var ok = rowMatchesStatus(row) && rowMatchesQuery(row);
        var tr = document.getElementById("r" + row.n);
        tr.hidden = !ok;
        if (!ok) { tr.nextElementSibling.hidden = true; tr.classList.remove("open"); }
        mosaic.children[idx].classList.toggle("dim", !ok);
        if (ok) shown++;
      });
      $("#result-count").textContent = shown === TOTAL ? "Showing all " + TOTAL + " forms of address" : "Showing " + shown + " of " + TOTAL;
      $("#empty").hidden = shown > 0;
      $("#record-table").hidden = shown === 0;
      var params = new URLSearchParams();
      if (state.q) params.set("q", state.q);
      if (state.s !== "all") params.set("status", state.s);
      if (state.r !== "either") params.set("round", state.r);
      var qs = params.toString();
      history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
    }

    input.addEventListener("input", function () { state.q = input.value.trim(); clear.hidden = !state.q; apply(); });
    clear.addEventListener("click", function () { state.q = ""; syncControls(); apply(); input.focus(); });
    chips.addEventListener("click", function (e) {
      var b = e.target.closest(".chip");
      if (!b || b.disabled) return;
      state.s = b.dataset.s === state.s ? "all" : b.dataset.s;
      renderChips(); apply();
    });
    seg.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      state.r = b.dataset.r;
      syncControls(); apply();
    });
    $("#reset").addEventListener("click", function () { state = { q: "", s: "all", r: "either" }; syncControls(); apply(); });

    var params = new URLSearchParams(location.search);
    state.q = params.get("q") || "";
    state.s = STATUS[params.get("status")] ? params.get("status") : "all";
    state.r = ["a", "b"].indexOf(params.get("round")) >= 0 ? params.get("round") : "either";
    syncControls(); apply();

    function fromHash() {
      var m = /^#r(\d+)$/.exec(location.hash);
      if (m) reveal(m[1]);
    }
    setTimeout(fromHash, 60);
    addEventListener("hashchange", fromHash);
  }

  /* ------------------------------------------------------------ summary page */

  function initSummary() {
    var chart = $("#stack-chart");
    if (!chart) return;

    var check = D.meta.summaryCheck || {};
    var note = $("#check");
    var msg = {
      match: ["ok", "These numbers match the Summary tab of the record sheet."],
      uncached: ["wait", "Counted from the Record tab. The sheet's Summary tab had no saved results to compare with; open the sheet in Excel, save it, and rebuild."],
      mismatch: ["bad", "These numbers do not match the sheet's Summary tab: " + (check.detail || "") + ". Check the verdict spellings and rebuild."],
      missing: ["bad", "The record sheet has no Summary tab to compare with."]
    }[check.status] || ["wait", "No comparison with the Summary tab was made."];
    note.className = "notice " + msg[0];
    note.innerHTML = '<span class="dot" aria-hidden="true"></span><span>' + esc(msg[1]) + " <span class=\"muted\">Data built " + esc(D.meta.built || "") + ".</span></span>";

    // legend
    $("#stack-legend").innerHTML = ORDER.map(function (s) {
      return '<span><i data-s="' + s + '"' + (s === "untested" ? ' class="hatch"' : "") + "></i>" + STATUS[s].en + ' <span lang="zh-Hant">' + STATUS[s].zh + "</span></span>";
    }).join("");

    // stacked bars
    var rounds = [["a", "Round A", "僅詩題 · title only"], ["b", "Round B", "詩題＋史料 · with sources"]];
    chart.innerHTML = rounds.map(function (rd) {
      var c = countBy(rd[0]);
      var segs = ORDER.concat("other").filter(function (s) { return c[s] > 0; }).map(function (s) {
        var tip = "<strong>" + rd[1] + " · " + esc(STATUS[s].en) + '</strong> <span class="zh">' + STATUS[s].zh + "</span><br>" +
          c[s] + " of " + TOTAL + " (" + pct(c[s], TOTAL) + "%)";
        return '<span class="seg" data-s="' + s + '" style="flex:' + c[s] + ' 1 0" tabindex="0" data-tip-html="' + esc(tip) + '" ' +
          'aria-label="' + esc(rd[1] + ", " + STATUS[s].en + ": " + c[s] + " of " + TOTAL) + '"><b>' + c[s] + "</b></span>";
      }).join("");
      return '<div class="stack-row"><div class="stack-label">' + rd[1] + '<span lang="zh-Hant">' + rd[2] + "</span></div>" +
        '<div class="stack" role="group" aria-label="' + rd[1] + ' verdicts">' + segs + "</div>" +
        '<div class="stack-total">' + tested(rd[0]) + "/" + TOTAL + " tested</div></div>";
    }).join("") +
      '<div class="axis" aria-hidden="true"><span></span><div class="axis-ticks">' +
      [0, 10, 20, 30].filter(function (t) { return t <= TOTAL; }).map(function (t) { return '<span style="left:' + (t / TOTAL * 100) + '%">' + t + "</span>"; }).join("") +
      '<span style="left:100%">' + TOTAL + "</span></div><span></span></div>";

    function fitLabels() {
      $$(".seg", chart).forEach(function (seg) {
        var b = seg.firstChild;
        b.style.visibility = seg.clientWidth >= b.scrollWidth + 12 && seg.clientWidth >= 20 ? "visible" : "hidden";
      });
    }
    fitLabels();
    addEventListener("resize", fitLabels);

    // the Summary tab, reproduced
    var ca = D.counts.a || {}, cb = D.counts.b || {};
    var rowsSpec = [["correct", "correct"], ["wrong", "wrong"], ["declined", "declined (answer exists)"], ["unknown", "declined (no answer exists)"], ["partly", "partly"]];
    $("#summary-table tbody").innerHTML = rowsSpec.map(function (r) {
      return '<tr><th scope="row"><span class="key"><i data-s="' + r[0] + '"></i>' + r[1] + "</span></th><td>" + (ca[r[0]] || 0) + "</td><td>" + (cb[r[0]] || 0) + "</td></tr>";
    }).join("");
    $("#summary-table tfoot").innerHTML = '<tr><th scope="row">total checked</th><td>' + (ca.total || 0) + "</td><td>" + (cb.total || 0) + "</td></tr>";

    // A -> B transitions
    var keys = ORDER;
    var max = 0, grid = {};
    keys.forEach(function (a) { grid[a] = {}; keys.forEach(function (b) { grid[a][b] = 0; }); });
    ROWS.forEach(function (r) {
      if (grid[r.a.verdict] && grid[r.a.verdict][r.b.verdict] != null) { grid[r.a.verdict][r.b.verdict]++; max = Math.max(max, grid[r.a.verdict][r.b.verdict]); }
    });
    var short = { correct: "Correct", partly: "Partly", wrong: "Wrong", declined: "Declined", unknown: "Name unknown", untested: "Not tested" };
    $("#matrix thead").innerHTML = '<tr><th class="corner">A ↓ · B →</th>' + keys.map(function (k) { return '<th scope="col">' + short[k] + "</th>"; }).join("") + "</tr>";
    $("#matrix tbody").innerHTML = keys.map(function (a) {
      return '<tr><th scope="row"><span class="key"><i data-s="' + a + '"' + (a === "untested" ? ' class="hatch"' : "") + "></i>" + short[a] + "</span></th>" +
        keys.map(function (b) {
          var v = grid[a][b];
          var share = max ? Math.round((v / max) * 38) : 0;
          var style = v ? ' style="background:color-mix(in oklab, var(--accent) ' + share + '%, var(--surface))"' : "";
          return '<td class="cell' + (a === b ? " diag" : "") + '" data-v="' + v + '"' + style + ' data-tip="' + esc("Round A " + STATUS[a].en + " → Round B " + STATUS[b].en + ": " + v) + '">' + v + "</td>";
        }).join("") + "</tr>";
    }).join("");

    // by stated confidence
    ["a", "b"].forEach(function (rnd) {
      var levels = ["high", "medium", "low", ""];
      var cols = ["correct", "partly", "wrong", "declined", "unknown"];
      var body = levels.map(function (lv) {
        var rs = ROWS.filter(function (r) { return r[rnd].verdict !== "untested" && (r[rnd].confidence || "") === lv; });
        if (!lv && !rs.length) return "";
        return '<tr><th scope="row">' + (lv ? CONF[lv] : "Not stated") + "</th>" +
          cols.map(function (s) { return "<td>" + rs.filter(function (r) { return r[rnd].verdict === s; }).length + "</td>"; }).join("") +
          "<td>" + rs.length + "</td></tr>";
      }).join("");
      $("#conf-" + rnd + " thead").innerHTML = "<tr><th>Confidence</th>" + cols.map(function (s) { return "<th>" + short[s] + "</th>"; }).join("") + "<th>Tested</th></tr>";
      $("#conf-" + rnd + " tbody").innerHTML = body;
    });
  }

  /* ------------------------------------------------------------ method page */

  function initMethod() {
    var run = (D.method || {}).run || {};
    $$("[data-run]").forEach(function (el) {
      var v = run[el.dataset.run];
      if (v) { el.textContent = v; el.classList.remove("placeholder"); }
    });
    [["promptA", "prompt-a"], ["promptB", "prompt-b"]].forEach(function (p) {
      var el = document.getElementById(p[1]);
      if (!el) return;
      var text = (D.method || {})[p[0]];
      if (text) { el.textContent = text; el.classList.remove("placeholder"); }
    });
    var runNote = $("#run-note");
    if (runNote && run.note) { runNote.textContent = run.note; runNote.hidden = false; }
  }

  document.addEventListener("DOMContentLoaded", function () {
    initChrome();
    initLetter();
    initRecord();
    initSummary();
    initMethod();
  });
})();
