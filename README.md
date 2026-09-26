# 我的读书站

一个纯本地的静态读书站。**书架 → 分类 → 书 → 篇目** 四层，想加书只丢一个数据文件，不用改代码。

## 怎么打开

三种都行：

1. **双击 `index.html`** —— 最省事。整个站刻意不用 ES module，所以 `file://` 下也能正常跑。
2. **起本地服务**（推荐，最稳）：
   ```
   cd D:\dsh休闲区\zhuangzi-site
   node server.js
   ```
   打开 http://127.0.0.1:8420
3. **线上版**：https://seven-rain-2568.github.io/zhuangzi/

## 页面结构

```
index.html    书架页 —— 按分类列出所有书，可搜索，显示进度
reader.html   阅读页 —— ?book=书id#篇目id，左侧篇目目录，右侧正文
```

## 目录

```
├── index.html              书架页
├── reader.html             阅读页
├── styles.css              两页共用样式（米色 / 深色）
├── server.js               可选的本地静态服务器
├── js/
│   ├── store.js            本地存储（进度、偏好）+ 动态加载书 + 查书
│   ├── shelf.js            书架页逻辑
│   └── reader.js           阅读页逻辑
└── books/
    ├── manifest.js         ★ 总目录：分类 + 书（加书从这里加）
    └── zhuangzi.js         ★ 一本书的全部内容
```

## 怎么加一本书

两步，**不用改任何代码**：

**第 1 步**：在 `books/` 下新建 `书名.js`，照 `books/zhuangzi.js` 的格式写：

```js
window.BOOKS = window.BOOKS || {};
window.BOOKS.wangwei = {
  id: "wangwei",
  title: "王维诗选",
  author: "王维（唐）",
  intro: "一段导读，显示在阅读页左侧。",
  chapters: [
    {
      id: "shanjuqiuMing",
      title: "山居秋暝",
      source: "《王右丞集》",
      summary: "一句话说明这篇讲什么。",
      tags: ["唐诗", "山水"],
      segments: [
        { text: "空山新雨后，天气晚来秋……", note: "白话解释。" }
      ]
    }
  ],
  // 可选：速查卡片，不出现在篇目目录里
  hooksTitle: "名句速查",
  hooksNote: "说明这段话怎么用。",
  hooks: [ { text: "行到水穷处", note: "解释。" } ]
};
```

**第 2 步**：打开 `books/manifest.js`，在该分类的 `books` 数组里加一项：

```js
{ id: "wangwei", title: "王维诗选", author: "王维（唐）", cover: "王",
  summary: "书架卡片上的一句话推荐。", tags: ["唐诗"],
  file: "books/wangwei.js" }
```

> `id` 三处必须一致（文件名随意，指向对就行）。`file` 路径相对于站点根目录。

刷新页面即可。**想加新分类**，就往 `manifest.js` 的 `categories` 里追加一组，格式照着现有的写。

## 阅读页功能

- 左侧篇目目录，显示每篇读到第几段
- **对照：开/关** —— 想只看原文时把白话收起来
- **A+ / A−** 调字号（15–30px，手机上自动收一号）
- **夜 / 日** 深色浅色，默认跟随系统
- 进度条：滚过一整段才算读到，只增不减；下次打开自动回到上次那篇
- 键盘 ← → 翻篇，Esc 关目录，`Ctrl+P` 打印会自动去掉按钮

## 数据都存在哪

全部在浏览器 `localStorage`，没有后端、没有账号：

| 键 | 存什么 |
| --- | --- |
| `lib.progress` | 每本书每篇读到第几段、最后读的篇目 |
| `lib.totals` | 每本书总段数（打开过一次才有，书架页靠它算百分比） |
| `lib.chapterCounts` | 每本书篇数 |
| `lib.settings` | 字号、主题、是否显示白话（两页共用） |

**换设备进度不会同步**，因为数据只在这台设备的浏览器里。想同步就得引入后端，那是另一件事。

## 已知限制

- `file://` 双击打开时，个别浏览器（尤其手机）会限制 `localStorage`，进度可能记不住。想稳就用 `node server.js` 或线上版。
- 线上版托管在 GitHub Pages，国内部分网络访问可能慢或不稳定。

原文为公有领域古籍；白话与导读为本地整理，仅供自己读着用。
