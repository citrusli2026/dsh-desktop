# HANDOFF — 官网与交付链路

> 更新于 2026-08-17。产品架构与后续迭代见 `docs/HANDOFF.md`;本文只记录
> 官网、发布、镜像和日常运维的当前事实。

## 一、当前状态

| 项 | 状态 |
|---|---|
| 官网 | ✅ <https://dsh-desktop.com>(备用 <https://dsh-electron-shell.vercel.app>) |
| 最新代码基线 / 已发布 | ✅ `0.1.0-rc.6.shell.14`（已发布 2026-08-17） |
| 本地门禁 | ✅ 63 项单测、类型检查、覆盖率门槛、官网门禁、构建通过 |
| 核心发布 | ✅ shell.14 Release 严格 6 文件门禁与双平台 packaged smoke 通过 |
| 官网数据 | ✅ 当前 `site/data/release.json` 指向 `v0.1.0-rc.6.shell.14`（提交 `ea4ea05`） |
| 国内镜像 | ℹ️ shell.14 的 GitCode 镜像尚未在 `release.json` 中标为可用；需按流程补齐后刷新 |

## 二、官网浅色体系与声明精简(2026-08-15 已提交部署,无新 tag)

1. 官网视觉已参考 DeepSeek 官网当前设计令牌调整为浅色体系:`#f9f8f8` 页面底色、
   `#1e232c` 正文、`#4d6bfe` 品牌蓝,正文使用 DM Sans,标题使用 Host Grotesk,
   卡片采用 16/24 px 圆角与轻玻璃层;静态缓存键升至 `v=13`。
2. 社区身份声明已按人工审核意见精简:顶栏标签与首屏提示只保留“社区出品 /
   非官方”与官方站点外链,“与 DeepSeek AI 无隶属、授权或合作关系”的正式
   法律句式仅保留在页脚一处;FAQ 第 3 条作为对直接提问的回答维持不变。
3. 下载区按人工审核意见收敛为 macOS / Windows 双平台:每个资产并列 GitCode
   镜像(可用时)与 GitHub 两个下载按钮,中文界面镜像在前;Linux 不再展示,
   引导至命令行;“全部文件”折叠表随更新元数据一并移除。
4. Apple Silicon 本地产物已生成:
   `dist/dsh-desktop-0.1.0-rc.6.shell.9-arm64-mac.{dmg,zip}`。本机 Apple
   Development 签名验证通过但未公证;DMG SHA-256 为
   `1ba98e73df9a30a3af50160a004ab565b81c7d927f1cbbb46971cdab16c0a77e`,ZIP 为
   `d1aa8957b61b207693d42c340429b9eb078811ac2fc9bbe3e69f8c624f695108`。
5. 当前仓库没有 iOS/Xcode 工程;Electron 安装包交付目标是 macOS 与 Windows。
   如需 iPhone/iPad 包,必须另立 SwiftUI 或跨平台客户端,不能从现有 Electron
   配置直接生成。

## 二点五、人工审查调整(2026-08-16,缓存键 v=20)

1. 顶栏 GitHub 链接不再显示星数,只保留图标与 GitHub 文字。
2. 首屏为纯文案居中 hero,不再放任何截图;截图目录 `site/assets/shots/`
   与拍摄脚本 `scripts/capture-site-shots.mjs` 已删除。hero 文案精简:
   去掉 kicker 行、副标题压成一句、社区提示语缩短,宽度与下方区块对齐
   (约 1080px),标题去掉手写 `<br>` 改由 `text-wrap: balance` 自动折行。
3. 下载区与特性文案不再展示 SHA-256 及其说明;`.sha256` 资产仍保留在
   release.json 数据里,只是不渲染。
4. 官网提供明暗两套皮肤:首次访问跟随系统,顶栏太阳/月亮按钮在浅色/深色
   两态间切换并记忆(localStorage `dsh-site-theme`);`<head>` 内联脚本在
   首帧前写入 `data-theme` 避免闪烁,无 JS 时由媒体查询兜底。
5. 桌面壳顶部拖动区域(preload 注入的 `data-dsh-window-drag-region`)
   高度从 12px 加高到 24px,随下一次构建/发布生效。

## 三、shell.9 官网与交付变化

1. 官网首屏从“有一个桌面窗口”转为“可靠桌面工作台”,新增四项可信基线、
   三步运行链路和“桌面壳新增 / Harness 保持原样”边界对照。
2. 六项能力改为直接扫读的卡片矩阵;补齐键盘跳转与焦点、窄屏布局、降动效、
   canonical/结构化数据,静态资源缓存键升至 `v=10`。
3. 发布前新增独立 `verify` job,再次执行 typecheck、测试、官网校验、构建并
   校验 tag 与 `package.json` 版本一致。
4. 三平台产物汇总后,`scripts/check-release-assets.mjs` 要求 11 个预期文件
   全部存在,并验证三份 `latest*.yml` 指向本次版本对应的安装包,通过后才发布。
5. `Site Data Refresh` 已验证 Release 完成后可自动生成、提交 shell.9 数据,
   该提交会继续触发 Vercel 部署。

## 四、发布与官网数据流

```text
main push → CI + Vercel
tag push  → Release verify
             → macOS / Windows 并行打包并启动自身 Harness
             → 2 安装包 + 2 哈希 + 2 Windows updater 小文件门禁
             → GitHub Release
                ├─ Site Data Refresh → main/release.json → Vercel
                ├─ Release Mirrors → R2(可失败、不中断主发布)
                └─ GitCode 镜像 = 维护者授权:复用已登录浏览器会话
                   上传 dmg / exe / hashes,再手动触发一次 Site Data Refresh
```

GitCode 自动推送已在 shell.8/9 连续失败(跨境 ~150 KB/s,预签名 URL 过期
502);拉取式流水线方案评估后放弃,决策与过程见 docs/decisions/0008 第二
修订。当前用 `.agents/skills/gitcode-release-publisher/` 复用已登录 GitCode
浏览器会话完成附件预留、签名存储上传和 Release 创建;只上传两个面向用户的
安装包与校验文件。blockmap / latest*.yml 不镜像,auto-updater 始终直连 GitHub。
官网数据生成器逐资产用 range GET 探测 GitCode;中文页面在镜像 URL 真实
可下载时并列展示镜像与 GitHub 两个下载源,否则只展示 GitHub。不要把带
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
| 回补历史版本 | 同上(需维护者已登录 GitCode);GitHub 侧 GitCode Mirror Backfill 仅小文件实际可用 |
| 下次壳发版 | `node scripts/version.mjs bump shell` → CI 绿 → 推 tag |
| 线上部署 | push `main`;Vercel 项目 root=`site/` 自动部署 |

## 六、已知事项

- GitCode 资产镜像为维护者授权渠道:发版后用 `$gitcode-release-publisher` 复用
  已登录浏览器会话上传 dmg/exe 与哈希,再触发 Site Data Refresh 让官网识别
  (根因与方案评估见 0008 第二修订:跨境
  推送 ~150 KB/s 且预签名 URL 过期 502;拉取式流水线复杂度不成比例,放弃)。
  自部署 gh-proxy(`GH_PROXY_PREFIX` 思路)仅作备选;公共代理实例实测
  不可靠(mirror.ghproxy.com / ghfast.top 已失联),不进入任何链路。
- GitCode `main` 已同步 shell.11 主线;镜像流程曾把 shell.9 tag 建在旧提交
  `c94e70b`,已精确修正为发布提交 `23c4c23`。shell.11 tag 已核对为发布提交
  `cca1a827`;后续仍要在发版后核对 tag peeled
  commit,不能只检查“同名 tag 已存在”。
- macOS 仍未签名/公证;首次运行需右键打开,应用只检查更新并引导下载。
- `*.vercel.app` 在国内可能受 DNS 影响;正式域名使用 `dsh-desktop.com`。

## 六点五、shell.13 工程维护（当前代码基线）

- CI/Release 固定消费 `dsh-mobile-shell` 的 `v1.0.0` Web 产物；构建脚本不再依赖维护者本机绝对路径。
- pnpm 固定为 `11.8.0`，安装使用 frozen lockfile；依赖审计显式走官方 npm registry，避免国内镜像缺少 audit endpoint 导致门禁失效。
- LAN 代理与 Harness 启停均为单飞操作，停止期间的新启动会排队，菜单会禁用重复操作；新增竞态和失败恢复测试。
- 发布校验器现在解析 `latest.yml`，同时核验版本、EXE 路径、文件列表与 sha512，而不只是字符串包含关系。
- `verify` 统一执行类型检查、63 项测试、80% 行/75% 分支/70% 函数覆盖率、官网门禁与构建。

## 七、shell.10 发布内容与官网第二轮

- Electron Shell 已完成无可见标题栏的全高内容窗口（保留平台原生窗口按钮与
  透明拖拽区）、中英原生菜单、系统语言首次选择、Harness 语言/主题实时同步、
  About 可信链接、close-to-tray、可确认重启和渲染进程恢复。
- 官网在既有 DeepSeek 风格浅色蓝白体系上同步新增能力，仍显著标注“社区版 ·
  非官方”；`site:check` 当前验证 75 项双语键，1440 px 与 390 px 实机检查通过。
- CI/Release 候选门禁新增真实 Electron E2E 与三平台 packaged smoke。本机
  Apple Silicon 签名基线包通过严格 codesign；包含最终菜单的 `dist-review`
  审核包显式跳过重复签名，但已隔离启动自身 Harness 并保持运行供人工审核。
  未公证导致 `spctl` 拒绝是已知且预期的分发限制。
- shell.10 已按“主分支 CI → tag → 三平台 Release → Site Data Refresh”顺序
  发布，正式域名已验证返回本版本和 11 个资产。完整顺序与后续边界见
  `docs/plans/electron-shell-capabilities.md`。

## 八、shell.11 已发布

- Release 从 11 个资产收敛为严格 6 个文件:只有 Apple Silicon DMG 与 Windows
  x64 EXE 两个大文件,各附一个 `.sha256`;另保留 Windows 已安装客户端所需的
  `latest.yml` 与 `.exe.blockmap`。官网与 GitCode 只面向用户展示/镜像前四项。
- 官网下载区只渲染两端安装包;SHA-256 不再在官网展示(见二点五节人工审查调整),
  哈希继续随 Release 发布并保留在 release.json 数据中。
- macOS 侧栏增加 12 px 顶部安全间距,使交通灯与 DeepSeek 品牌区分离；帮助菜单
  删除与 About 重复的社区官网和 Harness 官方页,保留项目源码、反馈与 DeepSeek
  官网。
- GitHub 主分支 CI run `31893979444`、Release run `31894394693`、首次官网同步
  run `31894723515` 均成功;tag `v0.1.0-rc.6.shell.11` 精确指向
  `cca1a8277e962709b8ddabe80e9941f7135b00a5`。
- GitCode 国内发行版已发布,同一 tag / commit 下通过已登录浏览器会话只上传
  DMG、EXE 与两份 `.sha256`;四个稳定下载 URL 均以匿名
  `Range: bytes=0-0` 返回 HTTP 206。
- 国内镜像完成后再次执行 Site Data Refresh run `31898225900`,生成提交
  `74fc28e`;正式域名已验证只渲染两个安装包、两个哈希,并为两端同时展示
  GitCode / GitHub 下载源。Windows updater 所需 `latest.yml` 与 `.exe.blockmap`
  继续只保留在 GitHub Release,不进入官网公开资产卡和 GitCode 人工镜像。

## 九、shell.12 已发布

- 新增“扩展 → 通过局域网连接手机 / 平板”：启动独立 mobile-shell Web 代理并显示
  一次性配对二维码；代理只转发到 loopback，主令牌不写入桌面设置。
- 构建与文档补齐 LAN Web 连接流程，固定消费 `dsh-mobile-shell/dist/web` 产物；
  同时加入 GitCode 发布技能与人工镜像工作流。
- macOS 增加 quarantine 解除说明、顶部拖拽区加高到 24px；官网完成浅色体系、
  明暗主题、纯文案 hero 与双平台下载收敛。
- `site/data/release.json` 已指向 `v0.1.0-rc.6.shell.12`；GitCode 镜像
  （`gitcode_ok`）尚未全部可用，需按流程补齐后刷新。

## 十、shell.13 工程维护基线（已发布 2026-08-16）

- mobile-shell Web 产物固定来自上游 `v1.0.0` tag；CI 与 Release 均使用 frozen lockfile，
  不再从 `main` 或维护者本机路径取依赖。
- pnpm 固定为 `11.8.0`；`verify` 统一执行 typecheck、63 项测试、覆盖率门槛、
  `site:check` 与构建；CI 增加官方 npm registry 的依赖安全审计。
- LAN 代理和 Harness Supervisor 对重复启动、停止中启动、失败清理做单飞保护，菜单在
  操作进行中禁用重复入口；当前本地测试为 63 项。
- 发布资产校验器除严格六文件、SHA-256 和 blockmap 外，还解析 `latest.yml` 的版本、
  Windows 路径、hashed files entry 与顶层 sha512；并修复 Release 校验依赖安装。
- 构建与运行时依赖加固：移除不再使用的 `extract-zip`，将 `yaml` 改为生产依赖，
  更新 Electron/Node 安装脚本。

## 十一、shell.14 当前代码基线（已发布 2026-08-17）

本轮为代码审查后的针对性加固，不引入新功能，全部向后兼容：

1. **LAN 代理 Windows 进程树清理**（`src/main/lan.ts`）：`stopInternal` 在 Windows
   上额外 `taskkill /T /F`，与 Harness Supervisor 一致，避免 mobile-shell 启动的
   launcher 孙进程在 app 退出后残留并占用端口。
2. **LAN pairing URL host 校验**（`src/main/lan.ts`）：mobile-shell 返回的
   `pairingUrls` 视为不可信，只接受 origin 与代理监听地址一致的条目，防止被攻陷
   或异常的代理把 QR 码指向其他主机。
3. **LAN 子进程输出按行拆分**（`src/main/lan.ts`）：用 `readline.createInterface`
   替代 `data` 事件直接 trim，与 Supervisor 一致，保留日志行结构。
4. **LAN/supervisor spawn 加 `windowsHide`**：避免 Windows 上启动子进程时控制台
   窗口闪现。
5. **supervisor spawn 显式 `cwd`**：默认为 `harnessRoot()`，让 dsh 自身的
   cwd-relative 查找落在 bundled closure 内；测试环境无 Electron app 时回退到
   继承父进程 cwd，保持 fixture 行为不变。
6. **IPC senderFrame 校验抽出 `isShellOwnedFrame`**（`src/main/index.ts`）：原本
   `url.startsWith('data:') !== true` 的隐式约束现在有命名与注释，说明只允许壳自有
   data: URL 页面调用 retry/diagnostics/close-lan-pairing。
7. **macOS 更新检查支持可选 GitHub token**（`src/main/update-prompt.ts`）：通过
   `DSH_DESKTOP_GH_TOKEN` 环境变量注入 fine-grained PAT，缓解共享 NAT 下 60/小时
   rate limit；不写入设置，不外发。
8. **`before-quit` 绝对超时兜底**（`src/main/index.ts`）：在 `supervisor.stop()` 与
   `lanService.stop()` 之外加 8s `setTimeout` 强制 `app.quit()`，防止极端情况下
   promise 不 resolve 导致 app 卡死。
9. **`page-title-updated` 加注释**（`src/main/window.ts`）：说明为何屏蔽 harness 的
   标题更新（保留壳标题的 "Community" 后缀）。

本地门禁全绿：typecheck、63 项单测、覆盖率（lines 80.17% / branches 79.00% /
functions 74.68%）、`site:check`、`build`。无新 ADR：本轮为既有决策的工程加固，
不改变任何边界。

发布元数据：
- CI run `31991608477`（成功）；Release run `31991741108`（成功）；
- tag `v0.1.0-rc.6.shell.14` 精确指向 `7e26d6888bb8a214b5b2d0305145f8b38a1e37ed`；
- Site Data Refresh run `31992088063`（成功），官网数据提交 `ea4ea05`，正式域名
  已指向 shell.14 的两个安装包与哈希。
- GitCode 国内镜像待维护者从国内网络手动上传 dmg/exe 与 `.sha256`，再触发一次
  Site Data Refresh 让官网识别镜像源。
