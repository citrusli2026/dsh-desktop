# HANDOFF — 运维核心

> 更新于 2026-08-26。产品架构见 `docs/ARCHITECTURE.md`；
> 决策记录见 `docs/decisions/`。本文是运维事实的唯一来源。

## 一、当前状态

| 项 | 状态 |
|---|---|
| 官网 | ✅ <https://dsh-desktop.com>（备用 <https://dsh-electron-shell.vercel.app>） |
| 最新代码基线 | ✅ `0.1.1-rc.2.shell.5`（2026-08-26 已发布；内核 0.1.1-rc.2 未变，壳修订 +5） |
| 已发布 | ✅ `0.1.1-rc.2.shell.5`（2026-08-26，三端 dmg/exe/deb；AppImage 已整体移除） |
| 本地门禁 | ✅ 123 项单测、类型检查、官网门禁、构建通过；覆盖率 lines 90.72 / branches 82.67 / functions 84.43 |
| 核心发布 | ✅ 0.1.1-rc.2.shell.5 Release 严格 8 文件门禁、attestation 核验、三平台 packaged smoke 与安装态验证通过 |
| 官网数据 | ✅ 当前 `site/data/release.json` 指向 `v0.1.1-rc.2.shell.5`（Linux 只 deb：dmg/exe/deb + 3×sha256 共 6 个用户资产 `gitcode_ok=true`） |
| 国内镜像 | ✅ 0.1.1-rc.2.shell.5 GitCode 镜像：dmg/exe/deb + 3×sha256（6/6 资产已上传并在线验证） |
| 实时下载统计 | ✅ `/api/downloads` 线上验证 200；当前累计安装包下载 184（mac 63 / win 105 / linux 16） |

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
修订。当前主方案为 **`scripts/mirror-gitcode.mjs`（本机直连，2026-08-22
落地）**：一条命令完成 探测→下载(经 GH_PROXY_PREFIX)→上传(v5 API)→校验，
本机到 GitCode 实测 2.2 MB/s（runner 跨境 160 KB/s 的 13 倍）；幂等可重跑、
`--check-only` 免 token 探测。上传链路待 `GITCODE_TOKEN` 本机配置后实测
（探测链路已验 6/6 present）。fallback 依次为 gitcode-backfill workflow 与
`.agents/skills/gitcode-release-publisher/` 浏览器会话（复用已登录 GitCode
浏览器会话完成附件预留、签名存储上传和 Release 创建）；只上传两个面向用户的
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

## 十、shell.16（2026-08-18）

Extensions → Vision (ModLens) 功能完整落地并发布：

1. **插件挂载**：supervisor 在默认 harness 启动参数上通过 `dsh --patch` 挂载预置
   的 `@liustack/modlens` 插件（overlay + profile 模块软链）；挂载不可行时降级为
   裸 harness，`$DSH_HOME` 不可写也不会拖垮启动。
2. **设置窗口**（Extensions → Vision (ModLens) → Settings…）：引擎表单（API 密钥/
   接口地址/模型）、Auto 复用模式、打开配置文件、真实识别测试（失败按配额/
   agy 未装/密钥缺失/pi 登录/claude 登录分类给中文提示）、诊断按钮（本地
   modlens doctor，不耗配额）、Escape 关闭。
3. **首次运行向导**（三步：复用本机引擎 → 添加免费 Gemini Key → 测试识别），
   配置加载失败显示"重试"而非误导性的"未探测到引擎"。
4. **粘贴引导卡**：harness 页面粘贴图片且向导未完成时左下角浮出配置卡；
   preload 隔离世界看不到 contextBridge 暴露面，必须直接用 ipcRenderer
   （e2e 发现并锁定）。
5. **识别测试预算**：per-provider 超时 × 链长 + 余量，多引擎 failover 不再被
   总预算中途 SIGKILL（此前 per-provider 60s 即总预算 60s）。
6. **IPC 安全**：settings/vision 通道只应答设置窗口（data: URL）；LAN 关闭校验
   精确窗口；官网 downloads API 固定 SITE_ORIGIN 防 Host 头 SSRF，并加入门禁。
7. **测试**：78 项单测（含 runModlensTest 成功/失败/预算、失败提示分类）、
   6 条 e2e（向导、表单、粘贴卡、加载失败重试、IPC 门禁、close-to-tray）、
   真实 harness 手动验证脚本 `e2e/manual-vision-check.mjs`。
8. **发版修正**：release.yml 的 e2e 门禁此前不跑 bootstrap，视觉诊断 spawn
   `resources/harness/node` ENOENT 导致首次 tag 发布失败；已补 bootstrap 并
   重打 tag（见"发布元数据"）。

发布元数据：
- CI run `32086348289`（成功）；Release run `32086357298`（成功，bootstrap 修复后重跑）；
- tag `v0.1.0-rc.6.shell.16` → `612e08dc76ea7f6479a307c134de0e6d7f9435c4`
  （首次打在 `e54c545` 未产生 Release，已 force 移动）；
- Site Data Refresh run `32086769499`（Release 自动触发，成功）指向 shell.16，
  镜像后手动刷新 run `32086957912`（成功）把四个资产 `gitcode_ok` 标为 `true`；
- GitCode 国内镜像：shell.16 已补齐（浏览器会话上传 dmg/exe 与两份 `.sha256`，
  Release id `41723`，匿名 Range GET 4×206）；Release Mirrors 工作流按设计跳过
  （无 R2 配置，不中断主发布）。

## 十一、shell.17（2026-08-18）

本轮为文档与官网发布：把 ModLens 视觉扩展正式写进面向用户的材料，无代码行为变更。

1. **官网**（缓存键 v=22）：新增「扩展功能 · 视觉」卡片（粘贴图片即识别、三步向导、
   引擎列表、本地诊断）、特性卡 `ft.p7`、FAQ「图片识别需要什么引擎」，双语字典
   82 → 90 键，`site:check` 校验通过。
2. **README（中英）**：新增「Vision (ModLens) / 视觉识别(ModLens)」专节——
   自动挂载、首次运行向导、引擎清单、`~/.modlens/config.json` 凭据边界与设置入口。
3. **ARCHITECTURE.md**：补 vision/settings/guide 模块图、验证契约更新为 78 单测
   与视觉 e2e；HANDOFF 状态表与官网数据行校正。

发布元数据：
- CI run `32087753485`（成功）；Release run `32087869972`（成功，~7m）；
- tag `v0.1.0-rc.6.shell.17` → `7af7f96ae6d958e9a677888dd785941e47273517`；
- Site Data Refresh 自动 run `32088272673`（提交 `4922b64`）指向 shell.17，
  镜像后手动刷新 run `32088536716`（提交 `bac8cd9`）把四个资产 `gitcode_ok`
  标为 `true`；
- GitCode 国内镜像：shell.17 已补齐（`gitcode-release-publisher` 浏览器会话上传
  dmg/exe 与两份 `.sha256`，匿名 Range GET 4×206，发布 commit 与 tag 一致）；
- 线上验证：`/data/release.json` 指向 shell.17、`/api/downloads` 200（实时计数），
  首页含新视觉卡片（日志断言，未依赖截图）。

---

## 十二、shell.18（2026-08-19）

本轮为修复与信任建设发布：vision Linux 挂载修复 + 安装包构建来源证明 + 官网首次打开引导。

1. **vision 修复**（`src/main/vision.ts`）：`rmSync` → `unlinkSync` 重定向 symlink。
   Linux 上 `rmSync` 对指向目录的 symlink 抛 `ERR_FS_EISDIR`（除非 `recursive`），
   会吞掉重定向逻辑、静默禁用 vision 挂载。
2. **构建来源证明**（`.github/workflows/release.yml`）：新增 `id-token`/`attestations`
   权限，`actions/attest@v4` 为 DMG/EXE 签发 GitHub 签名来源证明，publish 前
   `gh attestation verify` 逐包核验，release notes 模板加入下载与验证指引
   （`gh attestation verify … -R citrusli2026/dsh-electron-shell` + `shasum -c`）。
3. **官网首次打开引导**（`site/`）：新增 `#first-run` 引导卡，按访问者平台
   （mac/win）显示首次打开步骤；下载按钮带 `data-platform`，平台匹配时点击
   滚动并高亮引导卡；FAQ 补充来源证明验证命令；中英双语。
4. **GitCode API 认证修复**：GitCode v5 API 认证从 `access_token` 查询参数改为
   `PRIVATE-TOKEN` 请求头，`gitcode-backfill.yml` 与 `scripts/gitcode-upload.mjs`
   旧调用返回 HTTP 400 导致镜像失败；已修复并实测通过。上传改为小文件优先
   （排序按字节），job 超时上限提到 120 分钟适配跨境带宽。

发布元数据：
- CI run `32273210978`（成功，1m34s）；Release run `32273216024`（成功，~8m）；
- tag `v0.1.0-rc.6.shell.18` → `63b3aa200a3a3b3a242bcabcb74bd8a02f028586`；
- Site Data Refresh 自动 run `32274021914`（提交 `135712d`）指向 shell.18；
  镜像完成后手动刷新 run `32316013475`（提交 `770de2b`）把四个资产 `gitcode_ok`
  标为 `true`；
- GitCode 国内镜像：shell.18 自动化 backfill 补齐（6/6 资产 206：dmg/exe/
  blockmap/latest.yml 与两份 `.sha256`；dmg 一次成功、exe 首次 3×20min 超时后
  重跑补传成功），匿名 Range GET 4×206（用户下载四资产）；
- 线上验证：`/data/release.json` 指向 shell.18、四个资产 `gitcode_ok=true`，
  首页含首次打开引导卡（数据断言）。

---

## 十三、shell.19（2026-08-20）

内核升级 `@deepseek-ai/dsh` 0.1.0-rc.6 → 0.1.0-rc.8（壳修订归零，版本
`0.1.0-rc.8.shell.0`）；同时移除视觉扩展（ModLens），不与官方 dsh 原生
多模态（rc.8 起支持模型级 `inputModalities` 图片输入）重叠：

1. **源码移除**：删除 `src/main/vision.ts`、`guide-page.ts`、`settings-window.ts`、
   `settings-style.ts`；清理 `index.ts` 的 6 个 vision/settings IPC 与
   `shell:close-settings`、`menu.ts`/`menu-template.ts` 的 Vision 子菜单与
   `showSettings` action、`supervisor.ts` 的 `--patch` 挂载、`shell-preferences.ts`
   的 `visionGuideCompleted`、`locale.ts` 中 8 个 vision 键、`preload/index.ts`
   的粘贴引导卡与 6 个 bridge 方法。
2. **依赖与测试**：`manifest/harness/package.json` 移除 `@liustack/modlens`；
   删除 `test/vision.test.ts`（11 项）与 `e2e/manual-vision-check.mjs`；清理
   e2e 中 4 条 vision 测试与 `/modlens/config` stub；单测 78 → 67 项。
3. **文档与官网**：ARCHITECTURE.md 模块图与验证契约、README（中英）Vision
   专节、官网视觉卡片/FAQ 同步移除。
4. **CI**：移除 verify job 中为 vision e2e 准备的 `pnpm run bootstrap`
   （e2e 门禁现为 dev-web stub 模式，不 spawn 闭包；build job 打包前仍会
   bootstrap 自己的闭包）。

---

## 十四、shell.19 发布（2026-08-20）

发布 `v0.1.0-rc.8.shell.0`（内核 rc.8 首个发布，壳修订从 0 起）：

发布元数据：
- Release run `32381262841`（成功）：verify → build（macos-14 / windows-2022）→
  publish 全绿；6 文件门禁（dmg/exe + 两份 `.sha256` + blockmap + latest.yml）
  与 attestation 逐包核验通过；
- tag `v0.1.0-rc.8.shell.0` → `8e38ce0769a3`（基线同步后的 rebase 提交）；
- Site Data Refresh 自动 run `32383103151`（提交 `b155835`）指向 rc.8.shell.0，
  `gitcode_ok` 初始 `false`；镜像补齐后本机重跑 `gen-site-data.mjs` 提交刷新为
  `true`；
- GitCode 国内镜像：backfill 三跑补齐（run `32382045877` 取消：dmg 超时；
  run `32393765882`：dmg 一次成功 173M、exe 3×20min 超时失败；run
  `32401213335` 补传 exe 成功）。匿名 Range GET 4×206（用户下载四资产）；
- 线上验证：`/data/release.json` 与 `/api/downloads` 指向 rc.8.shell.0、
  四个资产 `gitcode_ok=true`。

---

## 十五、shell.20 发布（2026-08-21）

内核升级发布 `v0.1.1-rc.1.shell.0`（上游 `0.1.1-rc.1`，壳修订从 0 起）：

1. **内核升级**：`version.mjs bump dsh 0.1.1-rc.1`；`pnpm-workspace.yaml` 全部
   192 处 dsh-* release-age pins 同步替换；lockfile 重新生成（pnpm 自动将新包
   `dsh-authorization@0.1.1-rc.1` 加入 supply-chain 白名单）。
2. **peer 缺口修复**：bootstrap 的 `audit-harness-peers` 门禁报缺
   `@deepseek-ai/dsh-authorization`（新内核 `dsh-llm-pi-ai` 的非可选 peer），
   已补入 manifest 依赖后通过。
3. **流程沉淀**：发布全流程整理为 skill
   `.agents/skills/release-dsh-desktop/SKILL.md`（bump → peers → 门禁 →
   文档基线 → tag → CI → 镜像 → 官网数据 → HANDOFF，含现场故障表）。

发布元数据：
- Release run `32482248816`（成功）：verify → build（macos-14 /
  windows-2022）→ publish 全绿，6 文件门禁与 attestation 核验通过；
- tag `v0.1.1-rc.1.shell.0` → `f05ab7c`（rebase 后提交）；
- Site Data Refresh 自动 run（提交 `c364f6c`）指向 rc.8.shell.0；
- GitCode 国内镜像：**自动化 backfill 失败后改用浏览器会话补齐**——
  runner→OBS 跨境带宽极差（2026-08-21 晚间连续 4 run、11 次 20min 超时，
  run `32482864902` 取消、`32488149003` 超时、`32497268546` 保底），
  小文件（sha256/blockmap/latest.yml）由 backfill 传齐；两个安装包经
  Edge 已登录会话用 `gitcode-release-publisher` skill 上传（本机上海直连
  GitCode，数分钟完成），随后用 `PUT /api/v2/.../releases/{tag}` 将
  attachment 绑定到镜像 release（id 42854，`action:"keep"` 保留已有
  4 资产 + `action:"create"` 新增 dmg/exe，6 links 全部生效）；
- 线上验证：GitHub Release 6 资产齐全、`/api/downloads` 实时计数可用；
  稳定 URL 匿名 Range GET 4×206、dmg 头 1MB 哈希与本地一致；
  `gitcode_ok` 已刷新为 `true`（GitHub API 网络超时期间手动置位，
  下次 site-refresh 会重新探测确认）。

---

## 十六、shell.21 发布（2026-08-22）

内核升级发布 `v0.1.1-rc.2.shell.0`（上游 `0.1.1-rc.2`，壳修订从 0 起），
并修复 dsh-watch 连续失败（8-18/8-19/8-20/8-22）：

1. **dsh-watch 失败根因与修复**：上游发布 rc 全家桶当天，pnpm 的 24h
   `minimumReleaseAge` 供应链策略会拦住新包，因为
   `manifest/harness/pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude`
   仍停留在上一内核版本。新增 `scripts/sync-release-age-excludes.mjs`
   并在 workflow 的 lockfile 重生成步骤之后调用（顺序关键：lockfile-only
   校验旧 lockfile 条目，须先换 lockfile 再同步豁免），同时去重 pnpm
   自动追加的重复条目。提交 `36c2c82`。
2. **内核升级**：`version.mjs bump dsh 0.1.1-rc.2`；`dsh-authorization`
   pin 升到 `^0.1.1-rc.2`；lockfile 全新解析（`pnpm clean --lockfile`
   后重解析，0 处 rc.1、2123 处 rc.2 引用）；release-age 豁免 193 条
   同步到 rc.2。提交 `76f21f4`（文档基线 ARCHITECTURE/README/version.mjs
   同步更新）。
3. **三端发布**：tag `v0.1.1-rc.2.shell.0` → `76f21f4`，release.yml
   verify + build（macos-14 / windows-2022 / ubuntu-24.04）+ publish 全绿；
   GitHub Release 10 文件契约齐全（dmg/exe/deb/AppImage + 4×sha256 +
   blockmap + latest.yml），attestation 与三平台 packaged smoke 通过。
4. **GitCode 镜像（新策略）**：按用户要求只镜像 dmg/exe/deb + 3×sha256，
   **AppImage 不镜像**。backfill 被取消（已创建 release 骨架 id 42923
   并绑定 6 个小文件）；改用浏览器会话上传（本机代理下载 GitHub 资产，
   直连 GitHub 仅 ~9KB/s，代理 419KB/s）→ 6 个 attachment 全部上传
   （每文件 10-12 秒）→ PUT 绑定（`action:"keep"` 保留 3 个 sha256 +
   `action:"create"` 新增 3 个安装包，payload 需含
   ref/name/description/release_status/assets 全字段，缺字段报
   400「审核异常」）。匿名 Range GET 6×206；`gitcode_ok` 已刷新。
5. **网站数据**：本地 `gen-site-data` 重新生成（stats 108 次：
   mac 46 / win 56 / linux 6），提交 `b89680d`；site-refresh 自动同步
   提交 `2432d34`。

发布元数据：
- Release run `32548351782`（成功）；
- Site Data Refresh run `32548638115`（自动，成功）；
- 线上验证：`/data/release.json` 指向 rc.2.shell.0、6 资产
  `gitcode_ok=true`、`/api/downloads` 实时计数可用。

---

## 十七、mattpocock/skills 技能包（2026-08-22，进行中）

用户要求安装 [mattpocock/skills](https://github.com/mattpocock/skills)
（36 个工程技能）供本项目迭代使用，随后改为「装到 ZCode 用户目录
（通用技能不占项目仓库），项目只留 AGENTS.md 提示」。

**已完成：**
1. 项目级安装过 36 个技能到 `.agents/skills/`（`npx skills add ... --all --copy`），
   已清理 CLI 为约 50 个 agent 生成的冗余目录，只留 `.agents/skills/` +
   根目录 `skills-lock.json`。
2. 修复 `release-dsh-desktop` 的 frontmatter YAML 解析错误（description
   未加引号，`Companion:` 冒号被误解析为嵌套映射）——已加引号，`npx skills list`
   告警消失。
3. 技能↔项目映射分析已完成：高价值为 setup-matt-pocock-skills / tdd /
   code-review / diagnosing-bugs / research / handoff / to-spec+to-tickets+
   implement / grill-with-docs / ask-matt；中价值为 improve-codebase-architecture /
   wizard / prototype / domain-modeling / triage / setup-pre-commit；
   git-guardrails-claude-code（Claude Code 专用）与 writing-*（英文写作）
   不适用。
4. **迁移到用户目录（2026-08-22 完成）**：网络恢复后
   `npx skills add mattpocock/skills --skill '*' -a zcode -g -y --copy`
   成功。落盘位置为 **`~/.zcode/skills/`**（CLI 对 zcode agent 的规范位置，
   非 HANDOFF 原先预估的 `~/.agents/skills/`；ZCode 两者都读，本会话技能列表
   即含 `~/.zcode/skills/frontend-design`，功能等效）。CLI 同时写了项目级
   `.zcode/skills/` 副本，已删除；全局锁 `~/.agents/.skill-lock.json` 已登记
   36 个技能（共 38 项），`npx skills update` 可正常更新。项目 `.agents/skills/`
   只保留 `release-dsh-desktop` / `gitcode-release-publisher`，
   `skills-lock.json` 已删除。
5. **setup-matt-pocock-skills 完成（2026-08-22）**：按用户决策执行——
   GitHub Issues tracker（`gh` 已认证）；创建 **AGENTS.md**（含 Agent skills
   块 + 工程技能用户级安装提示，`/ask-matt` 路由）；写
   `docs/agents/{issue-tracker,triage-labels,domain}.md`（domain.md 定制为
   指向既有 `docs/decisions/`，不新建 `docs/adr/`；单上下文，pnpm-workspace.yaml
   仅为 allowBuilds 配置非 monorepo）；GitHub 已创建 4 个缺失 triage 标签
   `needs-triage`/`needs-info`/`ready-for-agent`/`ready-for-human`
   （`wontfix` 原本就有），5 个规范标签齐备。

**待办（无阻塞）：** 新文件 AGENTS.md、docs/agents/* 与 HANDOFF.md 更新、
`release-dsh-desktop` frontmatter 修复尚未提交（git 工作区仅这 4 处改动）。

---

## 十八、发布自动化迭代（2026-08-22）

1. **GitCode 镜像主方案自动化（mirror-gitcode.mjs）**：一条命令完成
   探测→下载(经 GH_PROXY_PREFIX)→上传(v5 API)→sha256 校验→复核；
   本机直连 GitCode 实测 **2.2 MB/s**（runner 跨境 160 KB/s 的 13 倍），
   上传链路已用临时 release 实测通过（创建/上传/验证/汇总全通）。
   `--check-only` 免 token 探测；幂等可重跑。backfill workflow 与
   `gitcode-release-publisher` 浏览器会话降级为 fallback。
2. **凭据落位（本机）**：`~/.gitcode-token`（600，从 GitHub Actions
   secret 经临时 workflow 导出后已清理）与 `~/.gitcode-mirror.env`
   （600，供定时任务读取）。均不入仓库。
3. **launchd 半自动镜像**：`com.dsh-desktop.gitcode-mirror` 每日
   10:05/22:05 运行 `scripts/gitcode-mirror-daemon.sh`（git ls-remote
   解析最新 tag → mirror-gitcode，幂等，失败仅记
   `~/Library/Logs/dsh-gitcode-mirror.log`）；已手动实测通过。
4. **release.yml tag→commit 门禁**：publish job 解引用 tag（含 annotated
   两段解引用）与 `github.sha` 比对，不一致即 fail——杜绝 shell.9 式
   「tag 建在旧提交」事故复发。
5. **site-refresh GitCode 重试**：Release 触发后 gitcode_ok=false 时
   每 5 分钟重新探测（最多 6 次）再提交，消除镜像时序误报；
   job 超时 10→45 分钟。
6. **runbook HANDOFF 模板**：release-dsh-desktop 技能第 8 步加入章节
   模板与取数命令（run id / peeled commit / check-only 探测）。

**待清理**：GitCode 测试 release `v0.0.0-mirror-test`（v5 API 无删除
端点、v2 被 CloudWAF 拦）——下次打开 GitCode 网页在 releases 页删除。

## 十九、v0.1.1-rc.2.shell.1 发布（2026-08-22）

1. **内核升级**：无。上游 npm latest 仍为 `0.1.1-rc.2`
   （`version.mjs check` 退出 0，registry.npmjs.org dist-tags 复核一致）；
   本次为壳修订号 bump：`version.mjs bump shell` → `0.1.1-rc.2.shell.1`
   （含 2aaac55/c46ebe5 的架构重构与测试收敛，17 文件 +705/-325）。
2. **发布**：tag `v0.1.1-rc.2.shell.1` → `f6a24ae`（peeled 核对）；
   release.yml verify + build（macos-14/ubuntu-24.04/windows-2022）+ publish
   全绿（run 32577667429）；8 文件契约齐全（dmg/exe/deb + 3×sha256 +
   blockmap + latest.yml）。
3. **GitCode 镜像**：第一轮 `mirror-gitcode.mjs` 经 ghproxy.net 完成
   deb + 3×sha256 4/6，dmg/exe 经公开代理下载失败（大文件连接中断）；
   改走本机 SOCKS5 代理（127.0.0.1:7890，用户验证过最快的线路）直连
   GitHub 下载 dmg(173M)/exe(150M)（峰值 ~1 MB/s，各约 4 分钟），
   sha256 与官方逐字节一致后经 `mirror-gitcode.mjs <本地文件>` 直传
   GitCode；匿名 Range GET 6×302；`gitcode_ok=true` 已刷新；backfill 后备
   run 32581545486 已取消。
4. **网站数据**：gen-site-data 重新生成（stats 134 次：mac 54 / win 72 /
   linux 8）。过程中发现并修复 bot 同步故障：site-refresh（run
   32577974276）因 `gen-site-data.mjs` 重复声明 `classifyPublicAsset`
   （c46ebe5 引入，SyntaxError）失败，提交 8670060 修复；bot 重跑
   32579332171 成功（92fa567）；本地复核镜像后提交 d9960b7。线上
   `/data/release.json` 指向新 tag 且 `gitcode_ok=true`，`/api/downloads`
   实时计数可用（total 134）。

## 二十、v0.1.1-rc.2.shell.2 发布（2026-08-23）

1. **版本**：壳修订 bump → `0.1.1-rc.2.shell.2`（333578e）；内核仍为
   上游 `0.1.1-rc.2`（`version.mjs check` 与 dist-tags 复核一致），无内核升级。
   本次发布携带 S1/S2/S2.5/A 组测试硬化首次全量上线。
2. **耗时记录**（全部记于 `/tmp/shell2-times.txt`，epoch 秒/UTC）：
   - 本地准备 46s：bump 11s → typecheck+107 单测+site check 12s →
     commit+tag+push 23s。
   - CI 共 10 次尝试，全绿 run 32613297135（ecb9923，02:36:50→02:48:03Z）
     **11m13s**；publish 自动完成（8 文件契约+attestation 校验通过），
     release `v0.1.1-rc.2.shell.2` published_at **02:47:51Z**。
   - GitCode 镜像 **393s**：SOCKS5（127.0.0.1:7890）六资产下载→上传→
     6/6 线上校验，全程 attempt 1/3 零重试（对照 shell.1 走公开代理时的
     大文件中断与手动补传）。
   - 站点数据 ~1min：gen-site-data → check-site / check-api-downloads
     全过 → 推送 e1ce202；线上 `dsh-desktop.com/data/release.json` 验证：
     tag ✓ / published_at ✓ / 资产同时含 GitHub 与 gitcode_url ✓ /
     stats 累计 138（mac 55 / win 75 / linux 8）✓。
3. **10 次尝试历程**（每失败一次即修一个只在此刻暴露的问题）：

   | 尝试 | commit | 耗时 | 死因 |
   |---|---|---|---|
   | A1 | 333578e | 7m36s | verify E2E 偶发失败 |
   | A2–A5 | 4b0a3c7→459eb41 | 各 ~2m | **同根因**：Playwright/Electron worker teardown 挂起 ×4 |
   | A6 | efbb571 | 10m37s | verify 首次过；构建暴露 win node 布局 + deb 缺依赖 |
   | A7 | 9d99690 | 7m03s | 又暴露 win 菜单 locale watcher 失效 + dpkg -L maxBuffer |
   | A8 | c5ef75a | 10m11s | 又暴露 dpkg 候选选到目录（EACCES）+ NSIS 重装挂死 |
   | A9 | c27cc50 | 13m49s | 仅剩 NSIS 重装（300s 超时确认确定性挂死） |
   | A10 | ecb9923 | 11m13s | **全绿**（去掉 NSIS 覆盖重装后） |

4. **瓶颈分析（按用户要求以时间切入）**：
   - **问题层叠是主因**：6 个构建问题呈"解锁一层暴露一层"结构——
     ① Windows node.exe 布局错误使 **自 shell.1 起 Windows 包从未能启动**；
     ② 它被 smoke 退出码在 Windows 上失效掩盖（`app.quit()` 丢弃
     `process.exitCode`，boot failed 后仍以 0 退出，4 个 smoke 步骤假绿）；
     ③ deb 依赖缺 libnotify4/libsecret-1-0；④ `dpkg -L` 超 1MB 缓冲区；
     ⑤ dpkg `-L` 目录候选先于二进制；⑥ NSIS 同版本覆盖安装挂死。
     ①②③在 A6 同时暴露，④⑤在 A7/A8 逐个暴露，⑥在 A8/A9 确认。
   - **共性教训**：这些全部是**只在远端 CI 可复现**的问题（win/nsis/deb
     路径本机 mac 无法触达），且前一层不修复根本看不到后一层——于是
     每次失败只能修一个点，共迭代 6 轮、约 60 分钟墙钟。若有"破局型"
     远端口（如 Windows 自托管 runner 或至少 win-unpacked 本地验证），
     可在单轮内同时列全。其次：**smoke 脚本不得仅依赖进程退出码判断
     成败**，应把断言输出纳入门禁（本仓库已补负向路径验证）。
   - **verify 阶段**：A2–A5 四个周期烧在 dev E2E teardown hang（Playwright
     1.62.1+Electron 已知交互问题），guarded runner 按 "N passed" 摘要
     判定理后已兜底；根因未除，每次 verify 仍会报 45s teardown 超时
     （不影响结论），保留为已知边界。
   - **总账**：本地 46s + 10 次 CI 约 84 分钟 + 6 轮编辑/门禁/推送各 ~3–6 分钟
     + 镜像 6m33s + 站点 1m ≈ **2 小时**；其中真正来自"测试硬化"的
     gate 增加只有一次 A10 的 +7 分钟（对照 shell.1 的 6m12s 成功 run）。
     其余时间 90% 以上是历史积弊（Windows 从未可用）在新门禁下的集中偿还。
5. **本次修复提交**：31a43d9（win node 布局）/ 8372f04（smoke 退出码）/
   9d99690（deb 依赖 apt 安装）/ 6173790（设置轮询兜底，修 win 菜单）/
   c5ef75a（dpkg -L 缓冲区）/ ecb9923（NSIS 去覆盖重装+边界文档）。
6. **已知边界（新增记录）**：NSIS 同版本覆盖安装在 CI runner 上确定性
   挂死（两次超时验证、零输出、首次安装仅 4s），覆盖安装逻辑由 deb
   重装冒烟代表；macOS dmg 安装路径（挂载→拖入 Applications）无自动化
   冒烟；跨版本升级安装需真实旧版本（沿用十九记录）。

---

## 二十一、官网 SEO 与 Search Console 收录准备（2026-08-23）

本轮为站内 SEO 改造，不改变桌面应用行为，也不产生新 Release/tag。所有改动已在
main 提交并准备推送：

1. **Search Console 验证**：`site/index.html` 的 `<head>` 保留以下元标记；成功验证后
   也不得删除：

   ```html
   <meta name="google-site-verification" content="0NO32QsuJviivUirAXGOcVgj2knN_m5NCus7GpE-ZXg" />
   ```

2. **首页实体与摘要**：更新 title、description、Open Graph、Twitter 元数据，加入
   `WebSite`、`Organization`、`SoftwareApplication` JSON-LD，并补充中英文
   `hreflang`。首页保留可抓取的 `/download` 静态入口。
3. **可索引页面**：新增 8 个 canonical 页面：
   `/`、`/en`、`/download`、`/en/download`、`/docs/install`、
   `/en/docs/install`、`/docs/faq`、`/en/docs/faq`。下载/安装/FAQ 内容不再只存在
   首页 hash 区块或 JS 语言切换中。
4. **抓取入口与门禁**：`robots.txt` 声明 sitemap；`sitemap.xml` 收录 8 个 URL；
   `scripts/check-site.mjs` 现在检查全部 HTML 页面、canonical、title、description、
   hreflang、本地资源、Search Console 标记和首页 `WebSite` 数据。
5. **后续 runbook**：Search Console 验证、提交 sitemap、URL Inspection 请求收录、
   外部权威、内容扩展和 30/60/90 天指标写入 `docs/seo-follow-up.md`。

本地验证：

- `pnpm run typecheck` ✅
- `pnpm test` ✅（108 项）
- `pnpm run site:check` ✅（8 个页面、120 个双语键）
- `pnpm run build` ✅
- 本地静态服务器检查 8 个页面、`robots.txt`、`sitemap.xml` 均可访问 ✅

**部署后人工动作**：在 Google Search Console 点击“验证”，提交
`https://dsh-desktop.com/sitemap.xml`，再对 8 个 URL 逐个执行 URL Inspection。账号内的
验证按钮和收录请求尚未由自动化执行，完成情况需回填到本节。

本轮提交序列：`500df7f`、`d4de9a7`、`5f728d7`、`4edaa8d`、`29c2cbc`、
`127ec34`、`245dd29`，随后追加本 HANDOFF 更新提交。

---

## 二十二、v0.1.1-rc.2.shell.3 发布（2026-08-23）

1. **版本与本地门禁**：上游检查确认 `@deepseek-ai/dsh 0.1.1-rc.2` 仍为
   最新版本，本次执行 `version.mjs bump shell` 升至
   `0.1.1-rc.2.shell.3`；重新部署 Harness 闭包并通过 peer 审计，暂存
   Node v22.23.2。`pnpm run verify` 全绿：108 项单测、覆盖率、类型检查、
   官网/API 门禁与构建均通过。
2. **发布**：tag `v0.1.1-rc.2.shell.3` → `78c504c`（peeled commit 已核对）；
   Release run `32645869254` 成功，verify、macOS/Windows/Linux build、
   packaged smoke、安装态测试、8 文件契约与三平台 attestation 全部通过；
   GitHub Release 于 `2026-08-23T14:49:44Z` 发布。
3. **GitCode 镜像**：`mirror-gitcode.mjs` 经本机 SOCKS5 下载并直传
   dmg/exe/deb + 3×sha256，三个大文件和三个校验文件均在 attempt 1/3
   上传成功；全程约 24 分钟，最终 `--check-only` 与匿名 Range GET 均为
   6/6 present。
4. **网站数据**：Site Data Refresh run `32646635012` 成功；机器人先吸收
   定时任务的 shell.2 计数提交 `5a62f64`，镜像稳定后提交 `c2c4fa1`
   刷新为 shell.3。静态 stats 为 152（mac 59 / win 82 / linux 11）；
   线上 `/api/downloads` 实时计数为 161（mac 60 / win 87 / linux 14）。

发布元数据：

- Release run `32645869254`（成功）；Site Data Refresh run `32646635012`
  （成功）。
- GitHub Release：<https://github.com/citrusli2026/dsh-electron-shell/releases/tag/v0.1.1-rc.2.shell.3>。
- 线上验证：`/data/release.json` 指向 `v0.1.1-rc.2.shell.3`，6 个资产
  `gitcode_ok=true`，`/api/downloads` 返回 200 且实时计数可用。

---

_更新于 2026-08-23_

---

## 二十三、Windows 菜单栏不可达 → 原生入口 + 应用内插件化入口（2026-08-24，随 shell.4 发布）

**场景与根因**：真机验证发现 Windows 版本没有可见菜单栏（macOS 有系统菜单栏）。
根因是窗口使用隐藏标题栏（`window-chrome.ts` 的 `titleBarStyle: 'hidden'` +
`titleBarOverlay`）：macOS 应用菜单挂在系统菜单栏不受影响，Windows/Linux 的
菜单栏是窗口一部分，被隐藏后 `Menu.setApplicationMenu` 注册的菜单用户不可达
（Alt 也唤不出）。影响：**"扩展"菜单（LAN 手机配对）在 Windows 上完全无入口**，
功能实现存在但不可用；同理失联的还有"关于、切换全屏、社区链接"。

**已落地改动（已提交并随 shell.4 发布）**：

1. `menu-template.ts`：LAN 菜单项提取为共享纯函数 `buildLanMenuItems`
   （停/忙/连三态：连接移动设备 / 显示二维码 + 停止共享），社区链接提取为
   `buildCommunityMenuItems`（社区官网/项目源代码/反馈问题），供应用菜单、
   托盘、右键三处复用，行为与原来一致。
2. 托盘菜单（`tray-template.ts`/`tray.ts`/`index.ts`）：重启与打开日志之间
   加 LAN 组；日志/诊断之后加「社区」子菜单与「关于 dsh-desktop」。
3. 窗口右键菜单（`window.ts` + `WindowContext` 新增可选 `lan`/`onShowAbout`）：
   任意位置右键都会弹出（LAN 组保证非空），底部追加「切换全屏」与
   「关于 dsh-desktop」；LAN 状态每次弹出时实时读取。
4. 文案复用/新增：`menu.community`、`menu.communityWebsite`（中英）。

验证：typecheck ✅；单测 108 → 113（新增托盘 LAN 四态、社区/关于、菜单项形状）；
覆盖率 lines 91.08 / branches 82.87 / functions 83.76（阈值 80/75/70）✅；build ✅。
5. 插件化补充：新增本地 `plugins/dsh-desktop-controls`，通过 Harness 的
   `shell.overlay` 注入一个右上角 `⋮` 更多操作入口；仅暴露固定的 LAN 配对、全屏、关于三项
   `dshDesktop` 桥接动作。Supervisor 只对默认生产启动挂载 `--patch`，并在 profile
   查找路径建立 shell-owned 包链接；挂载失败时降级为原生托盘/右键入口，不阻断 Harness
   启动。插件未依赖 `dsh-mobile-shell` 当前的 QR/代理 Web 产物，也不依赖历史上不可用的
   `dsh-mobile-ui` 源码。

新增桥接的来源校验：只接受当前主窗口、当前 Supervisor 批准的 loopback origin；
data/error/loading 页面和其他 WebContents 均拒绝。当前完整验证：118 个单测、typecheck、
build、coverage 全绿（lines 90.55 / branches 82.43 / functions 84.23；阈值
80/75/70）。

**验证结果**：真实 Electron 渲染验证确认 `⋮` 入口、桥接函数和展开面板均可用；本地
网站中英文页面及线上正式域名均确认出现 Windows 入口介绍；Release CI 的 Windows
packaged smoke、安装态测试和三平台构建全部通过。Windows 真机托盘点击仍建议在有
Windows 设备时补做一次人工确认；不影响本次发布。

**Codex 调研（2026-08-24）**：`docs/codex-windows-reference.md`（19 KB，一手
来源 + 标注不可核实项）。结论：Codex 在 Windows 有桌面 GUI（Microsoft Store
MSIX 分发、闭源，窗口 chrome 无一手资料）；公开可验证的做法在 CLI/TUI 侧——
footer 常驻 "`?` for shortcuts"、`?` 打开快捷键浮层、约 50 条斜杠命令把菜单
平移到命令层、快捷键全不依赖 OS 菜单栏（Ctrl+T/Ctrl+O/Esc/Alt+A 等）。CLI→GUI
桥为 `codex://threads/new?path=` deep link + `/app` 命令。

本产品没有照搬问号入口，而是采用更符合桌面产品习惯的 `⋮`（更多操作）符号，
避免把“快捷键帮助”和“桌面操作入口”混在一起。

**后续优化（下一步候选，未立项）**：

1. 将当前三项入口扩展为完整「快捷帮助浮层」：补充诊断、日志和快捷键，并视需要
   覆盖 loading/错误页；不把原生托盘/右键替换掉。
2. 托盘/右键入口与插件入口并存，不冲突；当前已随 `0.1.1-rc.2.shell.4` 发布。

---

## 二十四、v0.1.1-rc.2.shell.4 发布（2026-08-25）

1. **版本与功能**：`0.1.1-rc.2.shell.4` 基于内核 `0.1.1-rc.2`，新增 Windows 菜单不可达时的
   应用内 `⋮` 更多操作入口，并保留系统托盘与窗口右键入口；三者均可进入 LAN 配对、全屏和关于。
2. **验证与发布**：本地 `pnpm run verify` 通过（118 项单测、类型检查、官网门禁、构建）；真实
   Electron 渲染验证通过；Release workflow `32813464908` 的 verify、Windows/macOS/Linux 构建、
   Windows packaged smoke 与 publish 全部成功，publish job 为 `97698807331`。GitHub Release
   发布时间为 `2026-08-25T05:46:04Z`。
3. **提交与资产**：tag `v0.1.1-rc.2.shell.4` peeled 到 `228c6b5`
   （`228c6b56c9658a7921ba8b18632b83891be990dd`），Release 含 8 个资产：三端安装包、三份
   `.sha256`、Windows `.blockmap` 和 `latest.yml`。
4. **GitCode 镜像**：dmg/exe/deb 与三份 `.sha256` 共 6 个用户资产已上传，`6/6` 在线验证通过；
   GitCode tag 已与发布提交对齐，官网刷新提交 `8afe659` 也已同步到 GitCode。
5. **官网**：Site Data Refresh 首次触发因并发提交产生 rebase 冲突（run `32814155085`），随后
   手动重跑 `32814990932` 成功并提交 `8afe659`；线上 `release.json` 已指向 shell.4，中英文页面
   已加入 Windows 入口介绍，`/api/downloads` 返回 200，线上累计统计为 173（mac 61 / win 97 / linux 15）。

发布元数据：

- GitHub Release：<https://github.com/citrusli2026/dsh-desktop/releases/tag/v0.1.1-rc.2.shell.4>
- 官网：<https://dsh-desktop.com>
- Site Data Refresh：run `32814990932`（成功），提交 `8afe659`

---

## 二十五、v0.1.1-rc.2.shell.5 发布：全局快捷键快速唤回（2026-08-26）

1. **本轮定位与取舍**：基于项目“官方 Harness 的桌面壳”定位，选择官方 WebUI 本身没有的桌面级能力：全局快捷键快速唤回窗口。默认快捷键为
   `CommandOrControl+Shift+Space`，macOS 显示为 `⌘ + Shift + Space`，Windows/Linux
   显示为 `Ctrl + Shift + Space`；触发后总是显示并聚焦主窗口，不做隐藏/切换语义。
   本轮明确不做视觉识别、不复制官方已有的视觉能力。
2. **用户友好与降级**：快捷键注册失败或与其他软件冲突时不阻断启动，托盘状态会显示“快捷键不可用”，用户仍可用托盘、窗口右键和应用菜单入口打开窗口；退出时只释放本壳持有的快捷键。
3. **实现与验证**：新增 `src/main/global-shortcut.ts` 及四组单测，覆盖注册、回调、冲突、异常和平台文案；菜单/托盘/右键均复用同一唤回动作。补充中英文 README、安装/FAQ、首页介绍和 ADR 0018。另修复 Electron E2E 对话框 stub 的页面初始化竞态。本地 `pnpm run verify` 通过：123 项单测，覆盖率 lines 90.72 / branches 82.67 / functions 84.43；全量本地 guarded E2E 9/9。
4. **发布**：Release workflow `32920479188` 成功，verify job `98032948669`、Windows build `98033270697`、Ubuntu build `98033270750`、macOS build `98033270751`、publish job `98034739524` 均成功；GitHub Release 于 `2026-08-26T02:01:32Z` 发布，8 个资产和三平台安装态/构建证明门禁通过。tag `v0.1.1-rc.2.shell.5` peeled 到 `df1727c5271cf057546daef2678df4e5c23965c3`。
5. **镜像与官网**：GitCode Release 创建后，6 个面向用户的安装包/校验资产全部上传并在线验证（6/6）；GitCode 的 shell.5 tag 已精确对齐发布 commit `df1727c`。Site Data Refresh run `32921179292` 成功并提交 `1c128bb`，`site/data/release.json` 已指向 shell.5 且 6/6 `gitcode_ok=true`。线上 `/api/downloads` 返回 200，实时统计为累计 184（mac 63 / win 105 / linux 16）。

**后续迭代路线（按用户价值排序）**：

1. **shell.6：自定义快捷键**。在设置页提供录入/清空/恢复默认，实时提示冲突；配置写入现有壳偏好文件，不触碰 Harness 数据。
2. **shell.7：可选开机启动**。默认关闭，明确区分“开机启动”和“启动后隐藏到托盘”，并提供一键关闭，优先解决长期使用成本。
3. **shell.8：桌面状态通知**。只呈现 Harness 已公开的任务状态/错误摘要，不读取屏幕、不做视觉识别；先确认上游事件边界和隐私文案，再决定是否进入设置。

边界原则：继续围绕窗口、托盘、快捷键、更新、诊断和本地可用性做桌面壳增强；官方已有的 WebUI/视觉能力直接复用，不重复实现；每个新能力都必须保留原生入口和失败降级路径。

发布链接：<https://github.com/citrusli2026/dsh-electron-shell/releases/tag/v0.1.1-rc.2.shell.5>；官网：<https://dsh-desktop.com>。

---

_更新于 2026-08-26_
