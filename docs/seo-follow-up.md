# dsh-desktop SEO 后续路线

本文档记录首次 SEO 改造之后仍需持续执行的工作。前 3 周的站内改造已经进入代码提交；这里的任务主要是 Search Console 操作、外部权威、内容增长和数据复盘，不与产品功能代码混在一起。

## 当前已完成

- 首页 title、description、Open Graph 和 Twitter 元数据已重写。
- 首页已加入 `WebSite`、`Organization`、`SoftwareApplication` 结构化数据。
- 首页已加入 Google Search Console 验证元标记：

  ```html
  <meta name="google-site-verification" content="0NO32QsuJviivUirAXGOcVgj2knN_m5NCus7GpE-ZXg" />
  ```

- 已增加 `/download`、`/docs/install`、`/docs/faq` 和对应英文页面。
- 中英文页面已通过 canonical、`hreflang` 和 sitemap 互相声明。
- `robots.txt` 已声明 sitemap。
- 下载、安装、FAQ 页面有静态 HTML 内容和可抓取链接，不依赖首页滚动或 JavaScript 才能发现。
- `pnpm run site:check` 已检查全部 8 个 crawlable HTML 页面、canonical、语言链接、本地资源和验证标记。

## Search Console 验证与收录

### 1. 验证网站所有权

在 Google Search Console 添加网站属性。建议优先添加 Domain property；如果暂时使用 URL-prefix property，使用：

```text
https://dsh-desktop.com/
```

选择 HTML 标记验证方式，确认首页 `<head>` 中存在以下标记：

```html
<meta name="google-site-verification" content="0NO32QsuJviivUirAXGOcVgj2knN_m5NCus7GpE-ZXg" />
```

然后点击 Search Console 页面中的“验证”。验证成功后也不要删除该标记；它必须持续存在，避免后续重新验证失败。

如果验证失败：

1. 打开 `https://dsh-desktop.com/` 的“查看网页源代码”，确认标记在 `<head>` 中，而不是只出现在 JS 运行之后。
2. 确认 Vercel 已部署包含该标记的最新 commit。
3. 确认访问的是主域名 `dsh-desktop.com`，不是 GitHub、Vercel 备用域名或 `www` 跳转页。
4. 等待 CDN 更新后再次点击验证。

### 2. 提交 sitemap

在 Search Console 的 Sitemaps 页面提交：

```text
https://dsh-desktop.com/sitemap.xml
```

当前 sitemap 应包含以下 8 个 canonical URL：

```text
https://dsh-desktop.com/
https://dsh-desktop.com/en
https://dsh-desktop.com/download
https://dsh-desktop.com/en/download
https://dsh-desktop.com/docs/install
https://dsh-desktop.com/en/docs/install
https://dsh-desktop.com/docs/faq
https://dsh-desktop.com/en/docs/faq
```

### 3. 请求首次收录

在 URL Inspection 中依次检查并请求收录：

1. 首页 `/`
2. 中文下载页 `/download`
3. 中文安装页 `/docs/install`
4. 中文 FAQ `/docs/faq`
5. 英文首页 `/en`
6. 英文下载页 `/en/download`
7. 英文安装页 `/en/docs/install`
8. 英文 FAQ `/en/docs/faq`

检查重点：

- Google-selected canonical 是否与页面 canonical 一致；
- 页面是否可抓取、没有 `noindex`；
- Google 渲染后的正文是否包含标题、下载说明和 FAQ；
- `hreflang` 是否返回对应语言页面。

不要把手动搜索结果当作唯一指标。搜索结果会受地区、语言、账号和缓存影响；以 Search Console 的 Page indexing、Performance 和 URL Inspection 为准。

## 第 4 周以后：持续增长任务

### A. 外部权威和品牌信号

目标是让搜索引擎在多个可信来源看到一致的 “DSH Desktop / dsh-desktop.com / DeepSeek Harness desktop” 实体关系。

- GitHub 仓库设置 Homepage 为 `https://dsh-desktop.com/`。
- GitHub README、Release notes、Issues 模板和项目描述统一使用 `DSH Desktop` 与官网链接。
- 增加 GitHub topics：`deepseek-harness`、`desktop-app`、`electron`、`ai-agent`、`windows`、`macos`、`linux`。
- 向上游 Harness、插件市场和相关生态提交真实、有上下文的项目链接或文档 PR；不要批量投递广告链接。
- 发布一篇技术背景文章，解释为什么使用桌面壳、如何管理本地进程、数据目录如何隔离。
- 在 V2EX、掘金、知乎、Reddit、Hacker News 等相关社区发布真实安装体验或开发日志，链接到对应安装页而不是所有文章都只链接首页。

验收：至少有 5 个可公开访问、内容相关且不是自己重复发布的外部页面提到项目；GitHub README、Release 和官网描述一致。

### B. 内容扩展

优先制作能回答真实搜索问题的页面，不批量生成同义词文章。

建议页面：

- `/docs/windows-install`：Windows SmartScreen、安装位置、卸载和首次启动；
- `/docs/macos-install`：Apple Silicon、Gatekeeper、签名/公证现状；
- `/docs/linux-install`：Debian/Ubuntu/UOS/Deepin/麒麟安装和依赖；
- `/docs/api-key`：DeepSeek API Key 获取、计费提醒和密钥安全；
- `/docs/cli-vs-desktop`：`npx @deepseek-ai/dsh web` 与 DSH Desktop 的差异；
- `/changelog`：每个版本的内核版本、壳修订、兼容性和已知问题；
- `/blog/`：真实开发日志、性能取舍、安全边界和发布验证过程。

每个页面应有：唯一 title、唯一 description、一个 H1、清晰的下一步链接、对应中英文页面和 sitemap 条目。

### C. 下载与转化数据

在 Search Console 和站点统计中分别观察：

- 品牌词：`dsh desktop`、`dsh-desktop`；
- 产品词：`DeepSeek Harness desktop`、`DeepSeek Harness 桌面版`；
- 平台词：`DeepSeek Harness Windows`、`DeepSeek Harness macOS`、`DeepSeek Harness Linux`；
- 教程词：`DeepSeek Harness install`、`dsh web no Node.js`、`DSH Desktop API key`。

每月记录：展示次数、点击次数、平均排名、CTR、下载页进入量、GitHub Release 点击量、按平台的下载量。不要只追求平均排名；如果展示增加但 CTR 不变，应优先改 title 和 description。

### D. 技术维护

- 每次 Release 后检查 8 个页面和 sitemap 是否仍可访问。
- 如果发布平台发生变化，统一更新首页、下载页、安装指南、FAQ、README、Release notes 和结构化数据。
- 保持下载页的链接可用；如果以后需要展示具体安装包直链，应让 `site-refresh` 同步生成，而不是手工维护旧版本 URL。
- 关注 Core Web Vitals，尤其是首屏截图尺寸、移动端布局和 JavaScript 失败时的可用性。
- 用 Search Console URL Inspection 检查新页面，而不是频繁重复提交同一个 URL。

## 30 / 60 / 90 天验收

### 30 天

- Search Console 验证成功；sitemap 已读取；8 个页面至少被发现并开始抓取。
- 品牌查询能看到官网或 GitHub 结果。
- 至少发布 2 篇真实安装/技术文章。

### 60 天

- `/download`、安装页和 FAQ 出现非品牌长尾曝光。
- 至少 5 个外部相关页面有有效引用。
- 对 Windows、macOS、Linux 三个平台分别有可测量的下载入口点击。

### 90 天

- 根据 Search Console 查询数据扩展排名靠前但 CTR 偏低的页面。
- 根据下载数据优化平台排序、镜像提示和首次启动说明。
- 对重复内容、未收录页面、canonical 冲突和失效外链做一次清理。

SEO 不承诺固定名次。目标是让搜索引擎能稳定理解产品、让用户在安装前获得足够信任，并让每次发布都产生可持续的内容和外部信号。
