# HANDOFF — 运维核心

> 更新于 2026-08-17。产品架构见 `docs/ARCHITECTURE.md`；
> 决策记录见 `docs/decisions/`。本文是运维事实的唯一来源。

## 一、当前状态

| 项 | 状态 |
|---|---|
| 官网 | ✅ <https://dsh-desktop.com>（备用 <https://dsh-electron-shell.vercel.app>） |
| 最新代码基线 | ✅ `0.1.0-rc.8.shell.0`（未发布 2026-08-20 提升：内核 rc.6 → rc.8，壳修订归零；同步移除 ModLens） |
| 已发布 | ✅ `0.1.0-rc.6.shell.18`（2026-08-19） |
| 本地门禁 | ✅ 67 项单测、类型检查、覆盖率门槛、官网门禁、构建通过 |
| 核心发布 | ✅ shell.18 Release 严格 6 文件门禁、attestation 核验与双平台 packaged smoke 通过 |
| 官网数据 | ✅ 当前 `site/data/release.json` 指向 `v0.1.0-rc.6.shell.18`（四个资产 `gitcode_ok=true`） |
| 国内镜像 | ✅ shell.18 GitCode 镜像已补齐（2026-08-19，匿名 Range GET 4×206） |
| 实时下载统计 | ✅ 已完成并修复 404 — `site/api/downloads.js` 曾因 GitHub 匿名 list 接口不返回 Pre-release 导致 `/api/downloads` 恒 404；已改为优先读同站 `data/release.json` + GitHub tag 端点实时计数，2026-08-17 修复待部署 |

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

_更新于 2026-08-20_
