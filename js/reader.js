/* 阅读页：按 ?book= 加载一本书，渲染篇目、进度、对照、钩子 */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var NS = "http://www.w3.org/2000/svg";

  var el = {
    brandName: $("brandName"), brandSub: $("brandSub"),
    sideCrumb: $("sideCrumb"), sideTitle: $("sideTitle"),
    sideAuthor: $("sideAuthor"), sideIntro: $("sideIntro"),
    toc: $("toc"), sidebar: $("sidebar"), scrim: $("scrim"), menuBtn: $("menuBtn"),
    backBtn: $("backBtn"), sideReturn: $("sideReturn"),
    source: $("chapterSource"), title: $("chapterTitle"),
    summary: $("chapterSummary"), tags: $("chapterTags"),
    status: $("chapterStatus"), chapterNote: $("chapterNote"),
    planned: $("planned"),
    segments: $("segments"), progressFill: $("progressFill"), progressText: $("progressText"),
    prevBtn: $("prevBtn"), nextBtn: $("nextBtn"),
    modeBtn: $("modeBtn"), themeBtn: $("themeBtn"),
    fontInc: $("fontInc"), fontDec: $("fontDec"),
    hooks: $("hooks"), hooksTitle: $("hooksTitle"), hooksNote: $("hooksNote"), hookGrid: $("hookGrid")
  };

  var found = null;
  var book = null;
  var state = { chapter: 0, showNote: true, theme: "light", font: 19, reached: {} };
  var observer = null;

  function setIcon(btn, id) {
    if (!btn) { return; }
    btn.innerHTML = "";
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "icon");
    var use = document.createElementNS(NS, "use");
    use.setAttribute("href", "#" + id);
    svg.appendChild(use);
    btn.appendChild(svg);
  }

  function fail(msg) {
    el.brandName.textContent = "打不开这本书";
    el.title.textContent = "出错了";
    el.segments.innerHTML = "";
    var p = document.createElement("p");
    p.className = "empty";
    p.textContent = msg;
    el.segments.appendChild(p);
  }

  /* ---------------- 外观 ---------------- */
  function applyTheme() {
    document.documentElement.setAttribute("data-theme", state.theme);
    setIcon(el.themeBtn, state.theme === "dark" ? "i-sun" : "i-moon");
    el.themeBtn.classList.toggle("on", state.theme === "dark");
    el.themeBtn.title = state.theme === "dark" ? "切换到浅色" : "切换到深色";
    window.STORE.patchSettings({ theme: state.theme });
  }

  function applyFont() {
    var size = window.innerWidth <= 880 ? Math.max(15, state.font - 1) : state.font;
    document.documentElement.style.setProperty("--fs", size + "px");
    window.STORE.patchSettings({ font: state.font });
  }

  function applyMode() {
    document.body.classList.toggle("hide-note", !state.showNote);
    el.modeBtn.classList.toggle("on", state.showNote);
    el.modeBtn.title = state.showNote ? "当前显示白话，点击隐藏" : "当前隐藏白话，点击显示";
    window.STORE.patchSettings({ showNote: state.showNote });
  }

  function renderBrand() {
    document.title = found.meta.title + " · " + (window.LIBRARY.siteTitle || "读书站");
    el.brandName.textContent = found.meta.title;
    el.brandSub.textContent = found.meta.author || "";
    el.sideCrumb.textContent = found.cat.name;
    el.sideTitle.textContent = found.meta.title;
    el.sideAuthor.textContent = found.meta.author || "";
    el.sideIntro.textContent = book.intro || "";
    el.sideIntro.hidden = !book.intro;
  }

  /* ---------------- 篇目状态 ---------------- */
  var STATUS_LABEL = { full: "全篇", partial: "节选", planned: "待收录" };

  /* ---------------- 目录 ---------------- */
  function renderToc() {
    el.toc.innerHTML = "";
    var prog = window.STORE.bookProgress(found.cat.id, found.meta.id);

    book.chapters.forEach(function (c, i) {
      var b = document.createElement("button");
      b.className = "toc-item" + (i === state.chapter ? " active" : "");
      b.type = "button";

      var label = document.createElement("span");
      label.textContent = c.title;

      if (c.status && c.status !== "full") {
        var badge = document.createElement("i");
        badge.className = "toc-badge " + c.status;
        badge.textContent = STATUS_LABEL[c.status] || c.status;
        label.appendChild(badge);
      }

      var small = document.createElement("small");
      var done = prog[c.id] || 0, total = c.segments.length;
      small.textContent = done >= total
        ? "已读完 · " + total + " 段"
        : (done > 0 ? "读到 " + done + "/" + total + " 段" : total + " 段");

      b.appendChild(label);
      b.appendChild(small);
      b.addEventListener("click", function () { go(i); closeSidebar(); });
      el.toc.appendChild(b);
    });

    /* 外篇杂篇整体作为目录末尾的一项，点进去看篇目清单 */
    if (book.planned) {
      var pb = document.createElement("button");
      pb.className = "toc-item" + (state.chapter === -1 ? " active" : "");
      pb.type = "button";

      var plabel = document.createElement("span");
      plabel.textContent = "外篇 · 杂篇";
      var pbadge = document.createElement("i");
      pbadge.className = "toc-badge planned";
      pbadge.textContent = "待收录";
      plabel.appendChild(pbadge);

      var psmall = document.createElement("small");
      var n = 0;
      (book.planned.groups || []).forEach(function (g) { n += g.items.length; });
      psmall.textContent = n + " 篇未录";

      pb.appendChild(plabel);
      pb.appendChild(psmall);
      pb.addEventListener("click", function () { go(-1); closeSidebar(); });
      el.toc.appendChild(pb);
    }
  }

  /* 外篇杂篇：列目录，但还没正文 */
  function renderPlanned() {
    var host = $("planned");
    var p = book.planned;
    if (!host) { return; }
    if (!p || !p.groups) { host.hidden = true; return; }

    host.hidden = false;
    $("plannedTitle").textContent = p.title || "待收录";
    $("plannedNote").textContent = p.note || "";
    var body = $("plannedBody");
    body.innerHTML = "";

    p.groups.forEach(function (g) {
      var row = document.createElement("div");
      row.className = "planned-row";

      var name = document.createElement("span");
      name.className = "planned-name";
      name.textContent = g.name;

      var items = document.createElement("span");
      items.className = "planned-items";
      items.textContent = g.items.join(" · ");

      row.appendChild(name);
      row.appendChild(items);
      body.appendChild(row);
    });
  }

  function refreshTocItem(chapterId, reached) {
    var ci = book.chapters.map(function (c) { return c.id; }).indexOf(chapterId);
    var items = el.toc.querySelectorAll(".toc-item small");
    if (ci < 0 || !items[ci]) { return; }
    var total = book.chapters[ci].segments.length;
    items[ci].textContent = reached >= total
      ? "已读完 · " + total + " 段"
      : (reached > 0 ? "读到 " + reached + "/" + total + " 段" : total + " 段");
  }

  /* ---------------- 正文 ---------------- */
  function renderChapter() {
    var c = book.chapters[state.chapter];
    if (!c) { return; }

    el.source.textContent = c.source || "";
    el.title.textContent = c.title;
    el.summary.textContent = c.summary || "";

    /* 篇目状态 + 提示：让读者一眼知道这篇是不是全的 */
    el.chapterNote.hidden = true;
    el.chapterNote.textContent = "";
    el.status.textContent = "";
    el.status.className = "chapter-status";
    if (c.status && c.status !== "full") {
      el.status.textContent = STATUS_LABEL[c.status] || c.status;
      el.status.classList.add(c.status);
    }
    if (c.note) {
      el.chapterNote.hidden = false;
      el.chapterNote.textContent = c.note;
    }

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

      /* 难词注释：只在你有疑问时看，不打断阅读节奏 */
      if (seg.gloss && seg.gloss.length) {
        var gl = document.createElement("dl");
        gl.className = "gloss";
        seg.gloss.forEach(function (g) {
          var dt = document.createElement("dt");
          dt.textContent = g.w;
          var dd = document.createElement("dd");
          dd.textContent = g.d;
          gl.appendChild(dt);
          gl.appendChild(dd);
        });
        wrap.appendChild(gl);
      }

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
    window.STORE.setLastChapter(found.cat.id, found.meta.id, c.id);

    var url = "reader.html?book=" + encodeURIComponent(found.meta.id) + "#" + c.id;
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, "", url);
    }
  }

  function markPlannedUrl() {
    var url = "reader.html?book=" + encodeURIComponent(found.meta.id) + "#planned";
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, "", url);
    }
  }

  function renderHooks() {
    var list = book.hooks || [];
    if (!list.length) { el.hooks.hidden = true; return; }
    el.hooks.hidden = false;
    el.hooksTitle.textContent = book.hooksTitle || "速查卡片";
    el.hooksNote.textContent = book.hooksNote || "";
    el.hookGrid.innerHTML = "";
    list.forEach(function (h) {
      var d = document.createElement("div");
      d.className = "hook";
      var t = document.createElement("h4");
      t.textContent = h.text;
      d.appendChild(t);

      var p = document.createElement("p");
      p.textContent = h.note;
      d.appendChild(p);

      /* 有对应篇目的，点一下就能跳过去看原文 */
      if (h.chapter) {
        var ci = book.chapters.map(function (c) { return c.id; }).indexOf(h.chapter);
        if (ci >= 0) {
          var a = document.createElement("button");
          a.type = "button";
          a.className = "hook-jump";
          a.textContent = "见《" + book.chapters[ci].title + "》→";
          a.addEventListener("click", function () { go(ci); });
          d.appendChild(a);
        }
      } else if (h.source) {
        var s = document.createElement("span");
        s.className = "hook-src";
        s.textContent = h.source;
        d.appendChild(s);
      }

      el.hookGrid.appendChild(d);
    });
  }

  function updatePager() {
    el.prevBtn.disabled = state.chapter <= 0;
    el.nextBtn.disabled = state.chapter >= book.chapters.length - 1;
  }

  function updateProgress(done, total) {
    var pct = total > 0 ? Math.round((done / total) * 100) : 0;
    el.progressFill.style.width = pct + "%";
    el.progressText.textContent = done + " / " + total + " 段";
  }

  /* 外篇杂篇清单：只列篇名，没有正文 */
  function renderPlanned() {
    var host = el.planned;
    var p = book.planned;
    if (!host) { return; }
    if (!p || !p.groups) { host.hidden = true; return; }

    host.hidden = false;
    $("plannedTitle").textContent = p.title || "待收录";
    $("plannedNote").textContent = p.note || "";
    var body = $("plannedBody");
    body.innerHTML = "";

    p.groups.forEach(function (g) {
      var row = document.createElement("div");
      row.className = "planned-row";

      var name = document.createElement("span");
      name.className = "planned-name";
      name.textContent = g.name;

      var items = document.createElement("span");
      items.className = "planned-items";
      items.textContent = g.items.join(" · ");

      row.appendChild(name);
      row.appendChild(items);
      body.appendChild(row);
    });
  }

  function go(i) {
    if (i < -1) { return; }
    if (i >= book.chapters.length) { return; }

    state.chapter = i;

    if (i === -1) {
      /* 外篇杂篇：只展示篇目清单 */
      $("chapterHead").hidden = true;
      $("progressWrap").hidden = true;
      el.segments.hidden = true;
      el.hooks.hidden = true;
      $("chapterPager").hidden = true;
      el.prevBtn.disabled = true;
      el.nextBtn.disabled = true;
      renderPlanned();
      renderToc();
      markPlannedUrl();
      window.scrollTo({ top: 0, behavior: "auto" });
      return;
    }

    $("chapterHead").hidden = false;
    $("progressWrap").hidden = false;
    el.segments.hidden = false;
    $("chapterPager").hidden = false;
    renderPlanned();
    renderToc();
    renderChapter();
    renderHooks();
    observeSegments();
  }

  /* ---------------- 进度观察：滚过整段才算读到 ---------------- */
  function observeSegments() {
    if (observer) { observer.disconnect(); }
    if (!("IntersectionObserver" in window)) { return; }

    var chapter = book.chapters[state.chapter];
    var total = chapter.segments.length;

    observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { state.reached[en.target.dataset.index] = true; }
      });
      var count = 0;
      for (var k in state.reached) { if (state.reached[k]) { count++; } }
      updateProgress(count, total);
      window.STORE.markChapter(found.cat.id, found.meta.id, chapter.id, count, total);
      refreshTocItem(chapter.id, count);
    }, { rootMargin: "0px 0px -45% 0px", threshold: 0.01 });

    Array.prototype.forEach.call(el.segments.children, function (node) {
      observer.observe(node);
    });
  }

  /* ---------------- 侧栏 ---------------- */
  function openSidebar() {
    el.sidebar.classList.add("open");
    el.scrim.classList.add("show");
  }
  function closeSidebar() {
    el.sidebar.classList.remove("open");
    el.scrim.classList.remove("show");
  }

  function bind() {
    el.menuBtn.addEventListener("click", function () {
      el.sidebar.classList.contains("open") ? closeSidebar() : openSidebar();
    });
    el.scrim.addEventListener("click", closeSidebar);
    el.sideReturn.addEventListener("click", function () { window.location.href = "index.html"; });

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
        if (window.innerWidth > 880) { closeSidebar(); }
      }
    });
  }

  /* ---------------- 启动 ---------------- */
  function startChapterIndex() {
    var hash = (window.location.hash || "").replace("#", "");
    if (hash === "planned") { return -1; }
    if (hash) {
      var i = book.chapters.map(function (c) { return c.id; }).indexOf(hash);
      if (i >= 0) { return i; }
    }
    var last = window.STORE.lastChapter(found.cat.id, found.meta.id);
    if (last === "planned") { return -1; }
    var j = book.chapters.map(function (c) { return c.id; }).indexOf(last);
    return j >= 0 ? j : 0;
  }

  function init() {
    // 先把图标和外观铺好，不等书加载完——否则慢网络下会先看到一排空白按钮
    setIcon(el.menuBtn, "i-menu");
    setIcon(el.modeBtn, "i-para");
    setIcon(el.fontDec, "i-minus");
    setIcon(el.fontInc, "i-plus");

    var s = window.STORE.settings();
    state.showNote = s.showNote;
    state.theme = s.theme || document.documentElement.getAttribute("data-theme") || "light";
    state.font = s.font;

    applyTheme();
    applyFont();
    applyMode();

    var bookId = window.readQuery("book");
    if (!bookId) { fail("没有指定书。请从书架进入。"); return; }

    found = window.findBook(bookId);
    if (!found) { fail("书架上找不到 id 为「" + bookId + "」的书，请检查 books/manifest.js。"); return; }

    window.loadScript(found.meta.file).then(function () {
      book = (window.BOOKS || {})[bookId];
      if (!book || !book.chapters || !book.chapters.length) {
        fail("「" + found.meta.title + "」的内容为空，请检查 " + found.meta.file + "。");
        return;
      }

      var totalSeg = 0;
      book.chapters.forEach(function (c) { totalSeg += c.segments.length; });
      window.STORE.setTotal(found.cat.id, found.meta.id, totalSeg, book.chapters.length);

      state.chapter = startChapterIndex();

      renderBrand();
      renderToc();
      renderChapter();
      renderHooks();
      observeSegments();
      bind();
    }).catch(function (err) {
      fail("这本书的数据文件加载失败：" + (err && err.message ? err.message : found.meta.file));
    });
  }

  init();
})();
