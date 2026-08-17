# HANDOFF — 官网与交付链路

> 更新于 2026-08-17。产品架构与后续迭代见 `docs/plans/`；
> 历史版本记录见 `docs/HANDOFF-archive.md`。本文只记录最近两版、
> 官网、发布、镜像和日常运维的当前事实。

## 一、当前状态

| 项 | 状态 |
|---|---|
| 官网 | ✅ <https://dsh-desktop.com>（备用 <https://dsh-electron-shell.vercel.app>） |
| 最新代码基线 / 已发布 | ✅ `0.1.0-rc.6.shell.15`（已发布 2026-08-17） |
| 本地门禁 | ✅ 67 项单测、类型检查、覆盖率门槛（lines 84.61%）、官网门禁、构建通过 |
| 核心发布 | ✅ shell.15 Release 严格 6 文件门禁与双平台 packaged smoke 通过 |
| 官网数据 | ✅ 当前 `site/data/release.json` 指向 `v0.1.0-rc.6.shell.15`（提交 `1346abb`） |
| 国内镜像 | ✅ shell.15 GitCode 镜像已补齐（2026-08-17） |
| 实时下载统计 | ⏳ 开发中 — `site/api/downloads.js` Vercel Function 已创建，CommonJS 修复待验证（推送冲突未解决） |

## 二、官网浅色体系与声明精简（2026-08-15 已提交部署，无新 tag）

1. 官网视觉已参考 DeepSeek 官网当前设计令牌调整为浅色体系：`#f9f8f8` 页面底色、
   `#1e232c` 正文、`#4d6bfe` 品牌蓝，正文使用 DM Sans，标题使用 Host Grotesk，
   卡片采用 16/24 px 圆角与轻玻璃层；静态缓存键升至 `v=13`。
2. 社区身份声明已按人工审核意见精简：顶栏标签与首屏提示只保留"社区出品 /
   非官方"与官方站点外链，"与 DeepSeek AI 无隶属、授权或合作关系"的正式
   法律句式仅保留在页脚一处；FAQ 第 3 条作为对直接提问的回答维持不变。
3. 下载区按人工审核意见收敛为 macOS / Windows 双平台：每个资产并列 GitCode
   镜像（可用时）与 GitHub 两个下载按钮，中文界面镜像在前；Linux 不再展示，
   引导至命令行；"全部文件"折叠表随更新元数据一并移除。
4. Apple Silicon 本地产物已生成：
   `dist/dsh-desktop-0.1.0-rc.6.shell.9-arm64-mac.{dmg,zip}`。本机 Apple
   Development 签名验证通过但未公证；DMG SHA-256 为
   `1ba98e73df9a30a3af50160a004ab565b81c7d927f1cbbb46971cdab16c0a77e`，ZIP 为
   `d1aa8957b61b207693d42c340429b9eb078811ac2fc9bbe3e69f8c624f695108`。
5. 当前仓库没有 iOS/Xcode 工程；Electron 安装包交付目标是 macOS 与 Windows。
   如需 iPhone/iPad 包，必须另立 SwiftUI 或跨平台客户端，不能从现有 Electron
   配置直接生成。

## 二点五、人工审查调整（2026-08-16，缓存键 v=20）

1. 顶栏 GitHub 链接不再显示星数，只保留图标与 GitHub 文字。
2. 首屏为纯文案居中 hero，不再放任何截图；截图目录 `site/assets/shots/`
   与拍摄脚本 `scripts/capture-site-shots.mjs` 已删除。hero 文案精简：
   去掉 kicker 行、副标题压成一句、社区提示语缩短，宽度与下方区块对齐
   （约 1080px），标题去掉手写 `<br>` 改由 `text-wrap: balance` 自动折行。
3. 下载区与特性文案不再展示 SHA-256 及其说明；`.sha256` 资产仍保留在
   release.json 数据里，只是不渲染。
4. 官网提供明暗两套皮肤：首次访问跟随系统，顶栏太阳/月亮按钮在浅色/深色
   两态间切换并记忆（localStorage `dsh-site-theme`）；`<head>` 内联脚本在
   首帧前写入 `data-theme` 避免闪烁，无 JS 时由媒体查询兜底。
5. 桌面壳顶部拖动区域（preload 注入的 `data-dsh-window-drag-region`）
   高度从 12px 加高到 24px，随下一次构建/发布生效。

## 三、发布与官网数据流

```text
main push → CI + Vercel
tag push  → Release verify
             → macOS / Windows 并行打包并启动自身 Harness
             → 2 安装包 + 2 哈希 + 2 Windows updater 小文件门禁
             → GitHub Release
                ├─ Site Data Refresh → main/release.json → Vercel
                ├─ Release Mirrors → R2（可失败、不中断主发布）
                └─ GitCode 镜像 = 维护者授权：复用已登录浏览器会话
                   上传 dmg / exe / hashes，再手动触发一次 Site Data Refresh
```

GitCode 自动推送已在 shell.8/9 连续失败（跨境 ~150 KB/s，预签名 URL 过期
502）；拉取式流水线方案评估后放弃，决策与过程见 docs/decisions/0008 第二
修订。当前用 `.agents/skills/gitcode-release-publisher/` 复用已登录 GitCode
浏览器会话完成附件预留、签名存储上传和 Release 创建；只上传两个面向用户的
安装包与校验文件。blockmap / latest*.yml 不镜像，auto-updater 始终直连 GitHub。
官网数据生成器逐资产用 range GET 探测 GitCode；中文页面在镜像 URL 真实
可下载时并列展示镜像与 GitHub 两个下载源，否则只展示 GitHub。不要把带
时效签名的 CDN URL 写入站点。

## 四、运维速查

| 操作 | 命令 / 入口 |
|---|---|
| 本地验证官网 | `pnpm run site:check` |
| 本地静态预览 | `python3 -m http.server 4173 --directory site` |
| 重新生成下载数据 | `node scripts/gen-site-data.mjs` |
| 校验汇总制品 | `node scripts/check-release-assets.mjs <目录> <v-tag>` |
| 手动刷新官网数据 | Actions → Site Data Refresh → Run workflow |
| 补齐 GitCode 镜像 | 使用 `$gitcode-release-publisher` 上传 dmg/exe 与 `.sha256` → 再触发一次 Site Data Refresh |
| 回补历史版本 | 同上（需维护者已登录 GitCode）；GitHub 侧 GitCode Mirror Backfill 仅小文件实际可用 |
| 下次壳发版 | `node scripts/version.mjs bump shell` → CI 绿 → 推 tag |
| 线上部署 | push `main`；Vercel 项目 root=`site/` 自动部署 |

### 发布后 checklist（每次打 tag 后逐项确认）

1. **GitHub Release**：`gh release view v<tag>` 确认严格 6 文件（DMG + DMG.sha256 +
   EXE + EXE.sha256 + EXE.blockmap + latest.yml），`isDraft=false`。
2. **Site Data Refresh**：Release 完成会自动触发；确认 run 成功且 `site/data/release.json`
   指向新 tag。若未触发，Actions → Site Data Refresh → Run workflow 手动跑。
3. **GitCode 镜像**（国内下载源）：用 `$gitcode-release-publisher` 上传 DMG、EXE
   与两份 `.sha256`（不镜像 blockmap/latest.yml），再用 range GET 校验四个稳定 URL
   返回 206，然后再次触发 Site Data Refresh 让官网把 `gitcode_ok` 标为 `true`。
   **此项最易遗漏**：shell.13/14 均因未及时补齐导致国内镜像滞后。
4. **官网验证**：访问 <https://dsh-desktop.com>，确认下载区显示新版本双源按钮。
5. **HANDOFF 回填**：把 CI/Release/Refresh run id、tag peeled commit、镜像状态
   写入 HANDOFF 对应小节，把"当前代码基线"改为"已发布"。

## 五、已知事项

- GitCode 资产镜像为维护者授权渠道：发版后用 `$gitcode-release-publisher` 复用
  已登录浏览器会话上传 dmg/exe 与哈希，再触发 Site Data Refresh 让官网识别
  （根因与方案评估见 0008 第二修订：跨境
  推送 ~150 KB/s 且预签名 URL 过期 502；拉取式流水线复杂度不成比例，放弃）。
  自部署 gh-proxy（`GH_PROXY_PREFIX` 思路）仅作备选；公共代理实例实测
  不可靠（mirror.ghproxy.com / ghfast.top 已失联），不进入任何链路。
- GitCode `main` 已同步 shell.11 主线；镜像流程曾把 shell.9 tag 建在旧提交
  `c94e70b`，已精确修正为发布提交 `23c4c23`。shell.11 tag 已核对为发布提交
  `cca1a827`；后续仍要在发版后核对 tag peeled
  commit，不能只检查"同名 tag 已存在"。
- macOS 仍未签名/公证；首次运行需右键打开，应用只检查更新并引导下载。
- `*.vercel.app` 在国内可能受 DNS 影响；正式域名使用 `dsh-desktop.com`。

## 六、shell.14（已发布 2026-08-17）

> 完整记录见 `docs/HANDOFF-archive.md`。此处保留摘要供速查。

本轮为代码审查后的针对性加固，不引入新功能：
LAN 代理 Windows 进程树清理、pairing URL host 校验、子进程输出 readline 化、
spawn 加 `windowsHide` 与显式 `cwd`、IPC senderFrame 校验命名化、
GitHub token 支持更新检查、`before-quit` 绝对超时兜底。

- CI run `31991608477`；Release run `31991741108`；
- tag `v0.1.0-rc.6.shell.14` → `7e26d6888bb8a214b5b2d0305145f8b38a1e37ed`；
- Site Data Refresh run `31992088063`，提交 `ea4ea05`。
- GitCode 镜像待补齐。

## 七、shell.15（已发布 2026-08-17）

近期迭代三项：

1. **redactDiagnosticsLog 边界测试加固**（`test/diagnostics.test.ts`）：审查时
   疑似 Bearer 正则不匹配 base64 padding `==`，实测字符类已含 `=`，原判断有误。
   但仍补 2 项边界测试（base64 padding、JWT 形状、OpenAI key 尾部 `-`/` _`）锁定
   行为，防止未来回归。
2. **LAN 端到端测试**（`test/lan.test.ts`）：`LanService` 此前只有 4 项纯函数/单飞
   测试，`start/restart/stop` 真实子进程路径无覆盖。新增 2 项 E2E：
   - 起 stub mobile-shell proxy + 假 harness target，验证 start→pairing→restart→stop
     全流程，pairing code 格式、运行状态、currentPairing 清理均断言。
   - stub 返回外域 origin 的 pairing URL，验证 shell.14 加的 host 校验拒绝它。
   为支持测试注入，`LanServiceOptions` 加 `lanAddress?: () => string`，注入地址
   跳过 private-LAN 发现与校验；生产路径不变。
3. **GitCode 镜像发布 checklist**（`HANDOFF.md`）：在"四、运维速查"后加显式
   发布后 checklist（5 步），把 GitCode 上传作为第 3 步并标注"最易遗漏"，
   引用 shell.13/14 的滞后教训。

本地门禁全绿：typecheck、67 项单测、覆盖率（lines 84.61% / branches 79.45% /
functions 78.74%）、`site:check`、`build`。无新 ADR：测试加固与可注入选项不改变
生产边界。

发布元数据：
- CI run `31992896301`（成功，1m28s）；Release run `31994766855`（成功，6m59s）；
- tag `v0.1.0-rc.6.shell.15` 精确指向 `e7792dace377d57f8624e301b2fdcb9bde385d39`；
- Site Data Refresh run `31995175898`（成功，16s），官网数据提交 `1346abb`，正式域名
  已指向 shell.15 的两个安装包与哈希。
- GitCode 国内镜像已补齐（维护者手动上传 dmg/exe 与 `.sha256`），Site Data Refresh
  已重新触发，`gitcode_ok` 已标为 `true`。

## 八、2026-08-17 维护日汇总

本日围绕"文档可维护性 + GitCode 镜像补齐 + 实时下载统计"三条线推进：

### 8.1 文档可维护性提升

- **HANDOFF 整理**：创建 `docs/HANDOFF-archive.md` 收纳 shell.10–14 完整记录；
  根 `HANDOFF.md` 精简为最近两版 + 运维速查 + 发布后 checklist。
- **过期文档清理**：删除 `.zcode/plans/*.md`（IDE 临时文件）、
  `docs/plans/next-iteration-refactor-tests.md`（shell.9 已完成）。
- **状态修正**：`docs/HANDOFF.md` 和 `electron-shell-capabilities.md` 中 shell.15
  从"待发布"修正为"已发布"；`post-shell15-backlog.md` 标记 #1.1、#1.2、#D 已完成。
- **README 风险提示**：社区代理（ghproxy.net 等）加"部分已失联"可用性警告。

### 8.2 GitCode 镜像补齐（shell.15）

- 问题：shell.15 发布后 GitCode 代码同步延迟（最新 commit 停留在 shell.13）。
- 解决：手动 `git push gitcode main` + `git push gitcode v0.1.0-rc.6.shell.15`
  绕过同步延迟，直接推送代码和 tag。
- 结果：4 个文件上传 → release 创建 → Range GET 4×206 → Site Data Refresh
  run `32009084065` 成功 → 官网 `gitcode_ok` 全部 `true`。

### 8.3 实时下载统计（方案 C，开发中）

- 目标：让官网显示接近实时的 GitHub Release 下载数。
- 实现：
  - `site/api/downloads.js` — Vercel Serverless Function，代理 GitHub API，
    Edge 缓存 5min（`s-maxage=300`）。
  - `site/assets/app.js` — 页面加载后异步 fetch `/api/downloads`，
    成功后刷新下载数字和同步时间文案。
  - `site/vercel.json` — 添加 `/api/*` 路由缓存头。
- 阻塞：首次部署使用 ES Module (`export default`) 导致 `FUNCTION_INVOCATION_FAILED`；
  已改为 CommonJS (`module.exports`)，但推送时与 GitCode remote 冲突，
  尚未验证修复是否生效。
- 遗留：验证 Vercel Function 部署 → 确认下载数实时刷新 → 更新此 HANDOFF。

### 8.4 校验器 CLI 独立化（#D 已完成）

- 新建 `bin/dsh-validate-release.mjs`，`package.json` 注册 `bin` 字段。
- 官网 FAQ 新增"如何校验下载完整性"条目（中英双语），`site:check` 通过。

---
_更新于 2026-08-17_
