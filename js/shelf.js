/* 书架页：渲染 分类 → 书 的卡片墙 */
(function () {
  "use strict";

  var LIB = window.LIBRARY || { categories: [] };
  var state = { filter: "", theme: "light", font: 19 };

  var $ = function (id) { return document.getElementById(id); };
  var NS = "http://www.w3.org/2000/svg";

  /* 用 SVG 图标替代字符按钮，跨设备渲染一致 */
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

  function flatBooks() {
    var out = [];
    LIB.categories.forEach(function (cat) {
      cat.books.forEach(function (b) { out.push({ cat: cat, book: b }); });
    });
    return out;
  }

  function matches(entry, q) {
    if (!q) { return true; }
    var b = entry.book;
    var hay = [b.title, b.author, b.summary, (b.tags || []).join(" "), entry.cat.name]
      .join(" ").toLowerCase();
    return hay.indexOf(q.toLowerCase()) >= 0;
  }

  function applyChrome() {
    document.title = LIB.siteTitle || "我的读书站";
    $("siteTitle").textContent = LIB.siteTitle || "我的读书站";
    $("siteSubtitle").textContent = LIB.siteSubtitle || "";
    $("heroTitle").textContent = LIB.siteTitle || "我的读书站";
    $("heroIntro").textContent = LIB.siteIntro || "";
    $("footNote").textContent = "共 " + flatBooks().length + " 本书 · " +
      LIB.categories.length + " 个分类 · 进度保存在这台设备上";
    setIcon($("themeBtn"), state.theme === "dark" ? "i-sun" : "i-moon");
    $("themeBtn").classList.toggle("on", state.theme === "dark");
    $("themeBtn").title = state.theme === "dark" ? "切换到浅色" : "切换到深色";
  }

  function bookCard(entry) {
    var b = entry.book;
    var card = document.createElement("a");
    card.className = "book-card";
    card.href = "reader.html?book=" + encodeURIComponent(b.id);

    // 书脊：竖排书名首字
    var spine = document.createElement("div");
    spine.className = "spine";
    var spineText = document.createElement("span");
    spineText.textContent = b.cover || (b.title || "书").slice(0, 1);
    spine.appendChild(spineText);

    var body = document.createElement("div");
    body.className = "book-body";

    var h = document.createElement("h3");
    h.textContent = b.title;
    body.appendChild(h);

    var by = document.createElement("p");
    by.className = "book-author";
    by.textContent = b.author || "";
    body.appendChild(by);

    var sum = document.createElement("p");
    sum.className = "book-summary";
    sum.textContent = b.summary || "";
    body.appendChild(sum);

    if (b.tags && b.tags.length) {
      var tags = document.createElement("div");
      tags.className = "book-tags";
      b.tags.forEach(function (t) {
        var s = document.createElement("span");
        s.textContent = t;
        tags.appendChild(s);
      });
      body.appendChild(tags);
    }

    // 进度：读过的书才显示进度条
    var prog = window.STORE.bookProgress(entry.cat.id, b.id);
    var hasProgress = false, doneSeg = 0;
    Object.keys(prog).forEach(function (k) {
      if (k !== "_last") { hasProgress = true; doneSeg += prog[k]; }
    });

    var totalSeg = window.STORE.getTotal(entry.cat.id, b.id);
    var chapterCount = window.STORE.getChapterCount(entry.cat.id, b.id);

    var foot = document.createElement("div");
    foot.className = "book-foot";

    if (hasProgress && totalSeg > 0) {
      var pct = Math.min(100, Math.round((doneSeg / totalSeg) * 100));
      var bar = document.createElement("div");
      bar.className = "mini-bar";
      var fill = document.createElement("div");
      fill.className = "mini-fill";
      fill.style.width = pct + "%";
      bar.appendChild(fill);
      foot.appendChild(bar);

      var t = document.createElement("span");
      t.className = "mini-text";
      t.textContent = pct >= 100 ? "已读完" : "读 " + pct + "%";
      foot.appendChild(t);
    } else if (hasProgress) {
      var t3 = document.createElement("span");
      t3.className = "mini-text";
      t3.textContent = "已读 " + doneSeg + " 段";
      foot.appendChild(t3);
    } else {
      var t2 = document.createElement("span");
      t2.className = "mini-text muted";
      t2.textContent = chapterCount ? "共 " + chapterCount + " 篇 · 还没开始" : "还没开始";
      foot.appendChild(t2);
    }

    body.appendChild(foot);
    card.appendChild(spine);
    card.appendChild(body);
    return card;
  }

  function render() {
    var host = $("categories");
    host.innerHTML = "";
    var q = state.filter.trim();
    var shown = 0;

    LIB.categories.forEach(function (cat) {
      var books = cat.books.filter(function (b) { return matches({ cat: cat, book: b }, q); });
      if (!books.length) { return; }
      shown += books.length;

      var sec = document.createElement("section");
      sec.className = "category";

      var head = document.createElement("div");
      head.className = "category-head";

      var h2 = document.createElement("h2");
      h2.className = "category-name";
      h2.textContent = cat.name;
      head.appendChild(h2);

      var count = document.createElement("span");
      count.className = "category-count";
      count.textContent = books.length + " 本";
      head.appendChild(count);
      sec.appendChild(head);

      if (cat.note) {
        var note = document.createElement("p");
        note.className = "category-note";
        note.textContent = cat.note;
        sec.appendChild(note);
      }

      var grid = document.createElement("div");
      grid.className = "book-grid";
      books.forEach(function (b) { grid.appendChild(bookCard({ cat: cat, book: b })); });
      sec.appendChild(grid);

      host.appendChild(sec);
    });

    if (!shown) {
      var empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = q ? "没找到匹配的书。" : "书架还是空的，去 books/manifest.js 里加一本吧。";
      host.appendChild(empty);
    }

    $("shelfStat").textContent = q ? "找到 " + shown + " 本" : "共 " + flatBooks().length + " 本";
  }

  function bind() {
    $("themeBtn").addEventListener("click", function () {
      state.theme = state.theme === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", state.theme);
      window.STORE.patchSettings({ theme: state.theme });
      applyChrome();
    });

    var timer = null;
    $("filter").addEventListener("input", function (e) {
      var v = e.target.value;
      clearTimeout(timer);
      timer = setTimeout(function () { state.filter = v; render(); }, 120);
    });
  }

  function init() {
    var s = window.STORE.settings();
    state.theme = s.theme || document.documentElement.getAttribute("data-theme") || "light";
    state.font = s.font;
    applyChrome();
    render();
    bind();
  }

  init();
})();
