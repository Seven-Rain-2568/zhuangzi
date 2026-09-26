/* 公共小工具：本地存储 + 动态加载书文件 + 查书
   刻意不用 ES module，这样双击 index.html（file://）也能正常跑。 */
(function () {
  "use strict";

  function lsGet(key, fallback) {
    try {
      var v = localStorage.getItem(key);
      return v === null ? fallback : v;
    } catch (e) { return fallback; }
  }
  function lsSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* 隐私模式下静默失败 */ }
  }
  function lsGetJSON(key, fallback) {
    try {
      var v = JSON.parse(localStorage.getItem(key));
      return v && typeof v === "object" ? v : fallback;
    } catch (e) { return fallback; }
  }

  window.STORE = {
    lsGet: lsGet,
    lsSet: lsSet,
    lsGetJSON: lsGetJSON,

    /* 阅读进度：{ "分类id/书id": { chapterId: 已读段数, _last: 最后读的篇目 } } */
    PROG_KEY: "lib.progress",
    allProgress: function () { return lsGetJSON(this.PROG_KEY, {}); },
    bookProgress: function (catId, bookId) {
      var all = this.allProgress();
      return all[catId + "/" + bookId] || {};
    },
    saveBookProgress: function (catId, bookId, data) {
      var all = this.allProgress();
      all[catId + "/" + bookId] = data;
      lsSet(this.PROG_KEY, JSON.stringify(all));
    },
    lastChapter: function (catId, bookId) {
      return this.bookProgress(catId, bookId)._last || "";
    },
    setLastChapter: function (catId, bookId, chapterId) {
      var d = this.bookProgress(catId, bookId);
      d._last = chapterId;
      this.saveBookProgress(catId, bookId, d);
    },
    markChapter: function (catId, bookId, chapterId, reached, total) {
      var d = this.bookProgress(catId, bookId);
      if (reached > (d[chapterId] || 0)) {
        d[chapterId] = reached;
        this.saveBookProgress(catId, bookId, d);
      }
    },
    /* 书架页不能为了算进度去加载每本书，所以在打开书时把总段数记下来 */
    TOTALS_KEY: "lib.totals",
    allTotals: function () { return lsGetJSON(this.TOTALS_KEY, {}); },
    getTotal: function (catId, bookId) {
      var v = this.allTotals()[catId + "/" + bookId];
      return typeof v === "number" ? v : 0;
    },
    setTotal: function (catId, bookId, totalSegments, totalChapters) {
      var all = this.allTotals();
      all[catId + "/" + bookId] = totalSegments;
      lsSet(this.TOTALS_KEY, JSON.stringify(all));
      var c = lsGetJSON("lib.chapterCounts", {});
      c[catId + "/" + bookId] = totalChapters;
      lsSet("lib.chapterCounts", JSON.stringify(c));
    },
    getChapterCount: function (catId, bookId) {
      var v = lsGetJSON("lib.chapterCounts", {})[catId + "/" + bookId];
      return typeof v === "number" ? v : 0;
    },

    /* 阅读偏好（全局共用） */
    SETTINGS_KEY: "lib.settings",
    settings: function () {
      var d = lsGetJSON(this.SETTINGS_KEY, {});
      if (typeof d.showNote !== "boolean") { d.showNote = true; }
      if (d.theme !== "dark" && d.theme !== "light") { d.theme = ""; }
      if (typeof d.font !== "number" || d.font < 15 || d.font > 30) { d.font = 19; }
      return d;
    },
    saveSettings: function (d) { lsSet(this.SETTINGS_KEY, JSON.stringify(d)); },
    patchSettings: function (patch) {
      var d = this.settings();
      for (var k in patch) { if (Object.prototype.hasOwnProperty.call(patch, k)) { d[k] = patch[k]; } }
      this.saveSettings(d);
      return d;
    }
  };

  /* 动态加载一本书的数据文件（只加载当前这本，不预载全部） */
  window.loadScript = function (src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.onload = function () { resolve(src); };
      s.onerror = function () { reject(new Error("加载失败：" + src)); };
      document.head.appendChild(s);
    });
  };

  /* 在清单里找书 / 找分类 */
  window.findBook = function (bookId) {
    var lib = window.LIBRARY || { categories: [] };
    for (var i = 0; i < lib.categories.length; i++) {
      var cat = lib.categories[i];
      for (var j = 0; j < cat.books.length; j++) {
        if (cat.books[j].id === bookId) { return { cat: cat, meta: cat.books[j] }; }
      }
    }
    return null;
  };

  window.readQuery = function (name) {
    var m = new RegExp("[?&]" + name + "=([^&#]*)").exec(window.location.search);
    return m ? decodeURIComponent(m[1].replace(/\+/g, " ")) : "";
  };
})();
