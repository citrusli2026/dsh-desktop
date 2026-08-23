# site/ — dsh-electron-shell 官网

纯静态站点(零构建、零依赖),介绍项目并提供多平台下载,部署于 Vercel。

## 结构

```
site/
  index.html          单页:Hero / 下载矩阵 / 特性 / 版本号 / FAQ
  assets/style.css    深色工程视觉 + 响应式布局
  assets/app.js       中英切换 / 下载数据 / 镜像回落 / 平台识别 / 交互(含下载信标)
  assets/favicon.svg
  api/downloads.js    Vercel 函数:实时下载计数(GitHub API + 官网引导合并)
  api/beacon.js       Vercel 函数:下载按钮点击信标(可选,见下)
  data/release.json   ★ 由 scripts/gen-site-data.mjs 生成,CI 自动同步
  vercel.json         安全头 + 缓存策略(data/ 5 分钟,assets/ 1 小时)
  robots.txt
```

## 数据自动化

`.github/workflows/site-refresh.yml`:

- `Release` 工作流成功 → 立即重新生成 `site/data/release.json` 并提交;
- 外部 `release` 发布/编辑事件同样支持;
- 每日两次兜底同步(cron `17 2,14 * * *`,北京 10:17 / 22:17);
- `workflow_dispatch` 支持手动触发;失败自动开 issue 告警。

提交推送 main 后,Vercel Git 集成自动完成部署。
页面运行时还会读 `data/release.json`;若读取失败则直连 GitHub API 兜底。
中文模式仅在逐资产 range GET 验证 GitCode 可用时使用国内镜像,否则回落
GitHub。CI 通过 `pnpm run site:check` 校验数据、资产、双语键和 tab 目标。

手动同步数据:

```sh
node scripts/gen-site-data.mjs
```

## 本地预览

```sh
cd site && python3 -m http.server 8080
# 或 npx serve site
```

`assets/` 的 css/js 带 `?v=N` 版本号,使用一年 immutable;图片类一小时
可重新验证;`data/` 使用五分钟缓存。改动 css/js/data-model 后必须同步
提升对应文件的 `?v=`(当前 style v=33、data-model v=32、app v=33、seo v=8),
否则 immutable 会让用户锁在旧内容。

## 域名

正式域名 <https://dsh-desktop.com>(www 308 跳转主域),阿里云 DNS:
A `@` → `216.198.79.1` / `64.29.17.1`,CNAME `www` → Vercel 专属解析值。
HTTPS 证书由 Vercel 自动签发续期;`dsh-electron-shell.vercel.app` 作为备用域名保留。

## 下载引导计数(可选,激活即可统计 GitCode)

GitCode v5 API 与网页均不提供任何下载计数(资产对象只有 name/type/url),
因此官网统计的是**下载按钮的点击引导量**,不是 CDN 侧真实下载;GitHub 侧
展示的仍是 API 实计。未配置时该功能完全静默(信标返回 204,不记数)。

激活步骤:

1. 在 <https://upstash.com> 创建免费 Redis(选全球区,任意选一个);
2. 控制台 Database → REST API → 复制 `UPSTASH_REDIS_REST_URL` 与
   `UPSTASH_REDIS_REST_TOKEN`;
3. Vercel 项目 Settings → Environment Variables 添加这两个变量(所有环境),
   redeploy。
之后 hero 的下载数 = GitHub 实计 + GitCode 官网引导点击。GitHub 不再
计引导(GitHub API 有真实下载计数),GitCode 侧该口径是唯一可得数据。

## Vercel 接入(一次性)

1. <https://vercel.com/new> → Import `citrusli2026/dsh-electron-shell`;
2. **Root Directory** 设为 `site`(其余留空,无需构建命令);
3. Deploy。之后每次 push 到 main 自动部署。

也可 CLI:`cd site && vercel --prod`。
