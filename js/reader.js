/* 阅读页：按 ?book= 加载一本书，渲染篇目、进度、对照、钩子 */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };

  var el = {
    brandName: $("brandName"), brandSub: $("brandSub"),
    sideCrumb: $("sideCrumb"), sideTitle: $("sideTitle"), sideSub: $("sideSub"),
    toc: $("toc"), sidebar: $("sidebar"), scrim: $("scrim"), menuBtn: $("menuBtn"),
    backBtn: $("backBtn"), sideReturn: $("sideReturn"),
    source: $("chapterSource"), title: $("chapterTitle"),
    summary: $("chapterSummary"), tags: $("chapterTags"),
    segments: $("segments"), progressFill: $("progressFill"), progressText: $("progressText"),
    prevBtn: $("prevBtn"), nextBtn: $("nextBtn"),
    modeBtn: $("modeBtn"), themeBtn: $("themeBtn"),
    fontInc: $("fontInc"), fontDec: $("fontDec"),
    hooks: $("hooks"), hooksTitle: $("hooksTitle"), hooksNote: $("hooksNote"), hookGrid: $("hookGrid")
  };

  var found = null;      // { cat, meta }
  var book = null;       // 书的数据（含 chapters）
  var state = { chapter: 0, showNote: true, theme: "light", font: 19, reached: {} };
  var observer = null;

  /* ---------------- 出错提示 ---------------- */
  function fail(msg) {
    el.brandName.textContent = "打不开这本书";
    el.segments.innerHTML = "";
    var p = document.createElement("p");
    p.className = "empty";
    p.textContent = msg;
    el.segments.appendChild(p);
    el.title.textContent = "出错了";
  }

  /* ---------------- 渲染 ---------------- */
  function applyTheme() {
    document.documentElement.setAttribute("data-theme", state.theme);
    el.themeBtn.textContent = state.theme === "dark" ? "日" : "夜";
    el.themeBtn.classList.toggle("on", state.theme === "dark");
    window.STORE.patchSettings({ theme: state.theme });
  }

  function applyFont() {
    var size = window.innerWidth <= 860 ? Math.max(15, state.font - 1) : state.font;
    document.documentElement.style.setProperty("--fs", size + "px");
    window.STORE.patchSettings({ font: state.font });
  }

  function applyMode() {
    document.body.classList.toggle("hide-note", !state.showNote);
    el.modeBtn.textContent = state.showNote ? "对照：开" : "对照：关";
    el.modeBtn.classList.toggle("on", state.showNote);
    window.STORE.patchSettings({ showNote: state.showNote });
  }

  function renderBrand() {
    document.title = found.meta.title + " · " + (window.LIBRARY.siteTitle || "读书站");
    el.brandName.textContent = found.meta.title;
    el.brandSub.textContent = found.meta.author || "";
    el.sideCrumb.textContent = found.cat.name + " / " + found.meta.title;
    el.sideTitle.textContent = found.meta.title;
    el.sideSub.textContent = found.meta.author || "";
    if (book.intro) { el.sideSub.textContent = (found.meta.author || "") + " · " + book.intro; }
  }

  function renderToc() {
    el.toc.innerHTML = "";
    var prog = window.STORE.bookProgress(found.cat.id, found.meta.id);

    book.chapters.forEach(function (c, i) {
      var b = document.createElement("button");
      b.className = "toc-item" + (i === state.chapter ? " active" : "");
      b.type = "button";

      var label = document.createElement("span");
      label.textContent = c.title;

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
  }

  function renderChapter() {
    var c = book.chapters[state.chapter];
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

    window.STORE.setLastChapter(found.cat.id, found.meta.id, c.id);

    // 地址栏带上当前篇目，方便直接分享/刷新回到这一篇
    var url = "reader.html?book=" + encodeURIComponent(found.meta.id) + "#" + c.id;
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
      var p = document.createElement("p");
      p.textContent = h.note;
      d.appendChild(t);
      d.appendChild(p);
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

  function refreshTocItem(catId, bookId, chapterId, reached) {
    var ci = book.chapters.map(function (c) { return c.id; }).indexOf(chapterId);
    var items = el.toc.querySelectorAll(".toc-item small");
    if (ci < 0 || !items[ci]) { return; }
    var total = book.chapters[ci].segments.length;
    items[ci].textContent = reached >= total
      ? "已读完 · " + total + " 段"
      : (reached > 0 ? "读到 " + reached + "/" + total + " 段" : total + " 段");
  }

  function go(i) {
    if (i < 0 || i >= book.chapters.length) { return; }
    state.chapter = i;
    renderToc();
    renderChapter();
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
        if (en.isIntersecting) {
          state.reached[en.target.dataset.index] = true;
        }
      });
      var count = 0;
      for (var k in state.reached) { if (state.reached[k]) { count++; } }
      updateProgress(count, total);
      window.STORE.markChapter(found.cat.id, found.meta.id, chapter.id, count, total);
      refreshTocItem(found.cat.id, found.meta.id, chapter.id, count);
    }, { rootMargin: "0px 0px -45% 0px", threshold: 0.01 });

    Array.prototype.forEach.call(el.segments.children, function (node) {
      observer.observe(node);
    });
  }

  /* ---------------- 侧栏（移动端） ---------------- */
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
        if (window.innerWidth > 860) { closeSidebar(); }
      }
    });
  }

  /* ---------------- 启动 ---------------- */
  function startChapterIndex() {
    var hash = (window.location.hash || "").replace("#", "");
    if (hash) {
      var i = book.chapters.map(function (c) { return c.id; }).indexOf(hash);
      if (i >= 0) { return i; }
    }
    var last = window.STORE.lastChapter(found.cat.id, found.meta.id);
    var j = book.chapters.map(function (c) { return c.id; }).indexOf(last);
    return j >= 0 ? j : 0;
  }

  function init() {
    var bookId = window.readQuery("book");
    if (!bookId) { fail("没有指定书。请从书架进入。"); return; }

    found = window.findBook(bookId);
    if (!found) { fail("书架上找不到 id 为「" + bookId + "」的书，请检查 books/manifest.js。"); return; }

    var s = window.STORE.settings();
    state.showNote = s.showNote;
    state.theme = s.theme || document.documentElement.getAttribute("data-theme") || "light";
    state.font = s.font;

    // 书的数据文件按需加载，不预载全部书
    window.loadScript(found.meta.file).then(function () {
      book = (window.BOOKS || {})[bookId];
      if (!book || !book.chapters || !book.chapters.length) {
        fail("「" + found.meta.title + "」的内容为空，请检查 " + found.meta.file + "。");
        return;
      }

      // 记下总段数，书架页就不用加载整本书也能算进度
      var totalSeg = 0;
      book.chapters.forEach(function (c) { totalSeg += c.segments.length; });
      window.STORE.setTotal(found.cat.id, found.meta.id, totalSeg, book.chapters.length);

      state.chapter = startChapterIndex();

      renderBrand();
      applyTheme();
      applyFont();
      applyMode();
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
