/* 《庄子》选读 — 交互逻辑
   功能：目录切换、原文/白话对照、字号、深色模式、阅读进度记录。
   纯本地，无依赖，进度存在浏览器 localStorage 里。 */
(function () {
  "use strict";

  var META = window.BOOK_META || { title: "庄子选读", subtitle: "", intro: "" };
  var CHAPTERS = window.CHAPTERS || [];

  var LSK = {
    chapter: "zz.chapter",
    mode: "zz.mode",      // show / hide 白话
    theme: "zz.theme",
    font: "zz.font",
    visited: "zz.visited", // { chapterId: 已读段数 }
    lastDate: "zz.lastDate"
  };

  var state = {
    chapter: 0,
    showNote: true,
    theme: "light",
    font: 19,
    visited: {},
    reached: {}   // 本次会话内当前篇已滚到的段数
  };

  /* ---------- 存储小工具（localStorage 不可用时静默降级） ---------- */
  function load(key, fallback) {
    try {
      var v = localStorage.getItem(key);
      return v === null ? fallback : v;
    } catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* ignore */ }
  }
  function loadJSON(key, fallback) {
    try {
      var v = JSON.parse(localStorage.getItem(key));
      return v && typeof v === "object" ? v : fallback;
    } catch (e) { return fallback; }
  }

  /* ---------- DOM ---------- */
  var $ = function (id) { return document.getElementById(id); };
  var el = {
    brandName: $("brandName"), brandSub: $("brandSub"),
    sideTitle: $("sideTitle"), sideSub: $("sideSub"), sideIntro: $("sideIntro"),
    toc: $("toc"), sidebar: $("sidebar"), scrim: $("scrim"), menuBtn: $("menuBtn"),
    source: $("chapterSource"), title: $("chapterTitle"),
    summary: $("chapterSummary"), tags: $("chapterTags"),
    segments: $("segments"), progressFill: $("progressFill"), progressText: $("progressText"),
    prevBtn: $("prevBtn"), nextBtn: $("nextBtn"),
    modeBtn: $("modeBtn"), themeBtn: $("themeBtn"),
    fontInc: $("fontInc"), fontDec: $("fontDec")
  };

  /* ---------- 恢复上次状态 ---------- */
  function restore() {
    var ch = parseInt(load(LSK.chapter, "0"), 10);
    state.chapter = (isNaN(ch) || ch < 0 || ch >= CHAPTERS.length) ? 0 : ch;

    state.showNote = load(LSK.mode, "show") !== "hide";

    var t = load(LSK.theme, "");
    if (t !== "light" && t !== "dark") {
      t = (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
    }
    state.theme = t;

    var f = parseInt(load(LSK.font, "19"), 10);
    state.font = (isNaN(f) || f < 15 || f > 30) ? 19 : f;

    state.visited = loadJSON(LSK.visited, {});
  }

  /* ---------- 渲染 ---------- */
  function applyTheme() {
    document.documentElement.setAttribute("data-theme", state.theme);
    el.themeBtn.textContent = state.theme === "dark" ? "日" : "夜";
    el.themeBtn.classList.toggle("on", state.theme === "dark");
    save(LSK.theme, state.theme);
  }

  function applyFont() {
    // 小屏自动下调，避免手机上字太大每行放不下几个字
    var size = window.innerWidth <= 860 ? Math.max(15, state.font - 1) : state.font;
    document.documentElement.style.setProperty("--fs", size + "px");
    save(LSK.font, String(state.font));
  }

  function applyMode() {
    document.body.classList.toggle("hide-note", !state.showNote);
    el.modeBtn.textContent = state.showNote ? "对照：开" : "对照：关";
    el.modeBtn.classList.toggle("on", state.showNote);
    save(LSK.mode, state.showNote ? "show" : "hide");
  }

  function renderBrand() {
    el.brandName.textContent = META.title;
    el.brandSub.textContent = META.subtitle || "";
    el.sideTitle.textContent = META.title;
    el.sideSub.textContent = META.subtitle || "";
    el.sideIntro.textContent = META.intro || "";
    document.title = META.title;
  }

  function renderToc() {
    el.toc.innerHTML = "";
    CHAPTERS.forEach(function (c, i) {
      var b = document.createElement("button");
      b.className = "toc-item" + (i === state.chapter ? " active" : "");
      b.type = "button";

      var label = document.createElement("span");
      label.textContent = c.title;

      var small = document.createElement("small");
      var done = state.visited[c.id] || 0;
      var total = c.segments.length;
      small.textContent = done >= total
        ? "已读完 · " + total + " 段"
        : (done > 0 ? "读到 " + done + "/" + total + " 段" : total + " 段");

      b.appendChild(label);
      b.appendChild(small);
      b.addEventListener("click", function () {
        go(i);
        closeSidebar();
      });
      el.toc.appendChild(b);
    });
  }

  function renderChapter() {
    var c = CHAPTERS[state.chapter];
    if (!c) { return; }

    el.source.textContent = c.source || "";
    el.title.textContent = c.title;
    el.summary.textContent = c.summary || "";

    el.tags.innerHTML = "";
    (c.tags || []).forEach(function (t) {
      var s = document.createElement("span");
      s.textContent = t;
      el.tags.appendChild(s);
    });

    el.segments.innerHTML = "";
    c.segments.forEach(function (seg, i) {
      var wrap = document.createElement("section");
      wrap.className = "seg";
      wrap.dataset.index = String(i);

      var idx = document.createElement("div");
      idx.className = "seg-idx";
      idx.textContent = String(i + 1);

      var p = document.createElement("p");
      p.className = "seg-original";
      p.textContent = seg.text;

      wrap.appendChild(idx);
      wrap.appendChild(p);

      if (seg.note) {
        var n = document.createElement("p");
        n.className = "seg-note";
        n.textContent = seg.note;
        wrap.appendChild(n);
      }
      el.segments.appendChild(wrap);
    });

    state.reached = {};
    updatePager();
    updateProgress(0, c.segments.length);
    window.scrollTo({ top: 0, behavior: "auto" });
    markVisited(c.id, 0);

    if (state.showNote) { /* 无需额外处理 */ }
  }

  function updatePager() {
    el.prevBtn.disabled = state.chapter <= 0;
    el.nextBtn.disabled = state.chapter >= CHAPTERS.length - 1;
  }

  function updateProgress(done, total) {
    var pct = total > 0 ? Math.round((done / total) * 100) : 0;
    el.progressFill.style.width = pct + "%";
    el.progressText.textContent = done + " / " + total + " 段";
  }

  function markVisited(id, n) {
    var prev = state.visited[id] || 0;
    if (n > prev) {
      state.visited[id] = n;
      save(LSK.visited, JSON.stringify(state.visited));
      // 只更新侧栏对应小字，避免整表重绘
      var items = el.toc.querySelectorAll(".toc-item small");
      // 保持与 CHAPTERS 顺序一致
      var ci = CHAPTERS.map(function (c) { return c.id; }).indexOf(id);
      if (ci >= 0 && items[ci]) {
        var total = CHAPTERS[ci].segments.length;
        items[ci].textContent = n >= total
          ? "已读完 · " + total + " 段"
          : "读到 " + n + "/" + total + " 段";
      }
    }
  }

  function go(i) {
    if (i < 0 || i >= CHAPTERS.length) { return; }
    state.chapter = i;
    save(LSK.chapter, String(i));
    renderToc();
    renderChapter();
    observeSegments();
  }

  /* ---------- 进度观察：滚过整段才算读到 ---------- */
  var observer = null;
  function observeSegments() {
    if (observer) { observer.disconnect(); }
    if (!("IntersectionObserver" in window)) { return; }

    var total = CHAPTERS[state.chapter].segments.length;
    observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          var i = parseInt(en.target.dataset.index, 10);
          state.reached[i] = true;
        }
      });
      var count = 0;
      for (var k in state.reached) {
        if (state.reached[k]) { count++; }
      }
      updateProgress(count, total);
      markVisited(CHAPTERS[state.chapter].id, count);
    }, { rootMargin: "0px 0px -45% 0px", threshold: 0.01 });

    Array.prototype.forEach.call(el.segments.children, function (node) {
      observer.observe(node);
    });
  }

  /* ---------- 侧栏（移动端） ---------- */
  function openSidebar() {
    el.sidebar.classList.add("open");
    el.scrim.classList.add("show");
  }
  function closeSidebar() {
    el.sidebar.classList.remove("open");
    el.scrim.classList.remove("show");
  }

  /* ---------- 事件绑定 ---------- */
  function bind() {
    el.menuBtn.addEventListener("click", function () {
      el.sidebar.classList.contains("open") ? closeSidebar() : openSidebar();
    });
    el.scrim.addEventListener("click", closeSidebar);

    el.prevBtn.addEventListener("click", function () { go(state.chapter - 1); });
    el.nextBtn.addEventListener("click", function () { go(state.chapter + 1); });

    el.modeBtn.addEventListener("click", function () {
      state.showNote = !state.showNote;
      applyMode();
    });

    el.themeBtn.addEventListener("click", function () {
      state.theme = state.theme === "dark" ? "light" : "dark";
      applyTheme();
    });

    el.fontInc.addEventListener("click", function () {
      state.font = Math.min(30, state.font + 1);
      applyFont();
    });
    el.fontDec.addEventListener("click", function () {
      state.font = Math.max(15, state.font - 1);
      applyFont();
    });

    document.addEventListener("keydown", function (e) {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) { return; }
      if (e.key === "ArrowLeft") { go(state.chapter - 1); }
      else if (e.key === "ArrowRight") { go(state.chapter + 1); }
      else if (e.key === "Escape") { closeSidebar(); }
    });

    var lastW = window.innerWidth;
    window.addEventListener("resize", function () {
      if (window.innerWidth !== lastW) {
        lastW = window.innerWidth;
        applyFont();
        if (window.innerWidth > 860) { closeSidebar(); }
      }
    });
  }

  /* ---------- 启动 ---------- */
  function init() {
    if (!CHAPTERS.length) {
      el.segments.innerHTML = "<p>没有内容：请检查 data.js 是否正常加载。</p>";
      return;
    }
    restore();
    renderBrand();
    applyTheme();
    applyFont();
    applyMode();
    renderToc();
    renderChapter();
    observeSegments();
    bind();

    // 记录打开日期，方便看自己有没有坚持
    save(LSK.lastDate, new Date().toISOString().slice(0, 10));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
