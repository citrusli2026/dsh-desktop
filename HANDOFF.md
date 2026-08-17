# HANDOFF — 运维核心

> 更新于 2026-08-17。产品架构见 `docs/ARCHITECTURE.md`；
> 决策记录见 `docs/decisions/`。本文是运维事实的唯一来源。

## 一、当前状态

| 项 | 状态 |
|---|---|
| 官网 | ✅ <https://dsh-desktop.com>（备用 <https://dsh-electron-shell.vercel.app>） |
| 最新代码基线 / 已发布 | ✅ `0.1.0-rc.6.shell.15`（已发布 2026-08-17） |
| 本地门禁 | ✅ 67 项单测、类型检查、覆盖率门槛（lines 84.61%）、官网门禁、构建通过 |
| 核心发布 | ✅ shell.15 Release 严格 6 文件门禁与双平台 packaged smoke 通过 |
| 官网数据 | ✅ 当前 `site/data/release.json` 指向 `v0.1.0-rc.6.shell.15`（提交 `1346abb`） |
| 国内镜像 | ✅ shell.15 GitCode 镜像已补齐（2026-08-17） |
| 实时下载统计 | ✅ 已完成 — `site/api/downloads.js` Vercel Serverless Function 部署成功，Edge 缓存 5min，前端异步刷新下载数 |

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
4. 当前仓库没有 iOS/Xcode 工程；Electron 安装包交付目标是 macOS 与 Windows。
   如需 iPhone/iPad 包，必须另立 SwiftUI 或跨平台客户端，不能从现有 Electron
   配置直接生成。

## 三、人工审查调整（2026-08-16，缓存键 v=20）

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

## 四、发布与官网数据流

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

## 五、运维速查

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
| **推送代码到两个远端** | `git push origin main && git push gitcode main`（保持 GitHub/GitCode 同步，避免分叉冲突） |
| **推送 tag 到两个远端** | `git push origin v<tag> && git push gitcode v<tag>`（GitCode Release 需要 tag 存在） |

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

## 六、已知事项

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

## 七、shell.14（已发布 2026-08-17）

本轮为代码审查后的针对性加固，不引入新功能：
LAN 代理 Windows 进程树清理、pairing URL host 校验、子进程输出 readline 化、
spawn 加 `windowsHide` 与显式 `cwd`、IPC senderFrame 校验命名化、
GitHub token 支持更新检查、`before-quit` 绝对超时兜底。

- CI run `31991608477`；Release run `31991741108`；
- tag `v0.1.0-rc.6.shell.14` → `7e26d6888bb8a214b5b2d0305145f8b38a1e37ed`；
- Site Data Refresh run `31992088063`，提交 `ea4ea05`。
- GitCode 镜像状态：shell.14 镜像已随 shell.15 一并补齐（2026-08-17）。

## 八、shell.15（已发布 2026-08-17）

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

## 九、2026-08-17 维护日汇总

本日围绕"文档可维护性 + GitCode 镜像补齐 + 实时下载统计 + 网站安全加固"推进：

**文档**：HANDOFF 整理（archive 折叠）、过期文档清理、状态修正、README 风险提示。
**GitCode**：shell.15 镜像补齐（手动 push 绕过同步延迟，4 文件上传，Range GET 4×206）。
**实时统计**：Vercel Serverless Function `/api/downloads` 部署（CommonJS 修复 + package.json 补充）。
**安全**：downloads.js SSRF 防护（移除 repo 参数）+ 错误泄露修复（移除 body）+ sitemap + apple-touch-icon。
**文档清理**：修复硬编码路径、去重、加注、统一节编号、更新过期状态。

---
_更新于 2026-08-17_
