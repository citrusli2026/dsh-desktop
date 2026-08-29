# 社区 DSH 桌面端 / GUI 项目调研

> 调研日期：2026-08-28。所有星数、版本、日期均为当日通过 GitHub / npm 官方 API 与官方 README 查询所得。
> 只记录有主来源链接的陈述；README 中的宣传性数字（如"5MB 安装包""2300+ 插件"）已标注为"未独立验证"。
> 本仓库（citrusli2026/dsh-desktop）为对照基准，术语：bundled Node、托盘+窗口+单实例、全局召唤快捷键、桌面偏好、原生状态通知、LAN QR 手机配对（dsh-mobile-shell）、诊断导出、扩展入口浮层、Harness 设置内的"扩展设置"区；不含：代码签名、vision/OCR、macOS 自动更新、上游之外的自定义模型提供方 GUI。

## 1. 摘要

围绕 npm 包 `@deepseek-ai/dsh`（上游 deepseek-ai/DeepSeek-Harness，MIT，2026-08-28 时 201k★），社区（以中文社区为主）已生长出**数十个**桌面客户端/外壳项目，规模大、迭代极快：多数项目最后一笔提交都在 2026-08-24～08-28 之间，典型版本线是每周一两个小版本。官方上游**没有**桌面产品或路线图：官方 README（https://github.com/deepseek-ai/deepseek-harness/blob/master/README.md）只提供 `npx @deepseek-ai/dsh web` / 源码构建两种用法，社区部分只指向 Discussions、`dsh-plugin` topic 和 Discord，未提及任何官方或官方推荐的社区前端。社区桌面端的通行做法高度趋同：**固定版本的上游 dsh + 打包 Node 运行时 + 原生窗口（Electron 或 Tauri）从 127.0.0.1 加载官方 Web UI**，差异集中在"窗口之外"：插件市场、手机远程、签名/公证、更新链、安全恢复、主题皮肤、桌面宠物、多 Agent 视野与视觉能力。最有工程深度的是 anywhere-labs/dsh-desktop（21.4k★，桌面壳本身是 dsh 插件、三种 UI 模式、检查点恢复）、dataelement/dsh-desktop（3.0k★，macOS/Windows 均签名+公证、`.dshpreset` 预设包、Safe Mode、手机配对桥+临时 Cloudflare 隧道）、lencx/Minke（572★，Agent 浏览器+WeChat/Telegram/Discord 远程+本地模型）与 zouyuxuan122/Deepseek-Harness-EAC（1.4k★，皮肤/终端/文件 diff/人设卡/微信桥接的"全家桶"）。vision/OCR、代码签名（macOS）与"全局召唤快捷键 + LAN QR 配对 + 扩展入口"这组组合在社区中均无逐项对标者，分别只有部分对应实现（见第 3 节）。

## 2. 项目清单

### 2.1 桌面客户端 / GUI 外壳（已逐项核对 README/源码）

| 名称 | 类型 | 技术栈 | 活跃度 | 主要扩展功能 | 来源链接 |
|---|---|---|---|---|---|
| DSH Desktop (anywhere-labs) | 桌面本体即 dsh 插件 | Electron（`dsh-plugin-desktop` 作为 Cordis 插件组合，非独立 Electron UI） | 21.4k★，v2.0.3（2026-08-26） | 桌面能力作为一个 dsh 插件组合进运行时；三种 UI 模式（compatibility / extended / advanced）；macOS 透明材质、Windows acrylic/mica；托盘 profile 切换；健康启动三槽位检查点+恢复页；GUI 启动时登录 shell 恢复 PATH；打包 pnpm；内置 DSH Community Market（插件发现/安装/详情）；设置向导（窗口模式/材质/通知/浏览器打开/局域网访问）；"手机远程控制（即将推出）"；固定上游版本原样运行 | https://github.com/anywhere-labs/dsh-desktop（README 2026-08-28；与上游无隶属的独立声明见 [README 头部](https://github.com/anywhere-labs/dsh-desktop/blob/master/README.md)） |
| DSHDesktop (dataelement) | 独立桌面客户端 | Electron | 3.0k★，v0.6.3（2026-08-26） | macOS 双架构签名+公证、Windows x64 代码签名 NSIS；官方 DeepSeek + 主流第三方模型提供方；可移植 Agent 预设包 `*.dshpreset`（冲突检查+安装前信任警告）；profiles/plugins/workspaces/models/sessions 跨升级保留；启动/前端插件失败诊断（harness.log）+引导恢复；非破坏性 Safe Mode（隔离第三方插件）；手机经本地网络或可选临时 Cloudflare Quick Tunnel 配对桥接续会话（配对各需批准）；启动后与每 6h 检查更新、用户控制安装；无 Linux 支持 | https://github.com/dataelement/dsh-desktop（README 2026-08-28） |
| DeepSeek Harness 桌面版 (dsh-tauri-desk，原 hairyf/) | 独立桌面客户端 | Tauri 2 + React + Rust，Node 22.22 运行时 | 1.3k★，v0.9.2（2026-08-28） | 插件面板（升级/卸载/错误详情）；首启引导推荐插件（dsh-market 等）；第一方插件：dsh-tauri（消息桥）、dsh-tauri-ui（设置侧边栏）、**dsh-tauri-worktree（每会话隔离 Git worktree，可检出/归档）**、dsh-tauri-panel(-extension)（Skills/MCP 管理、导入技能仓库）；打包时注册 `dsh` 命令 shim 到 PATH；Harness 内核多版本管理+健康检查；应用内自更新；Homebrew tap；Linux AppImage/.deb（含 Wayland 黑屏处理）与 Win/macOS；README 宣传"5MB 安装包"（未独立验证）；MIT 附非商用条款 | https://github.com/dsh-tauri-desk/deepseek-harness-desktop（README 2026-08-28；项目原名 hairyf/deepseek-harness-desktop） |
| Deepseek Harness EAC | 独立桌面客户端（"全家桶"） | Electron 主壳（Win v4.4.1）+ Tauri Lite / Tauri 2（macOS v5.1.0 / Linux v4.4.0） | 1.4k★，v5.1.0 / v4.4.1（2026-08-28） | 内置 Node+npm+dsh；独立 `web-desktop` profile（与 CLI 共享 `~/.dsh` 会话与 API Key，插件互不干扰）；10 款皮肤/字体/字号/移动布局；内置文件树+行级 diff+一键还原+持久 PowerShell 终端+HTML/端口预览；自动 compact、人设卡、`soul.md` 热重载；可视化配置视觉模型与 MCP、从 Claude Code/Codex 导入配置；内置插件市场；临时对话、对话节点导航、第三方模型思考强度调整；微信 ClawBot/OpenClaw 消息桥接；安装/启动前自动快照+体检/修复/重试/回滚/事故报告；客户端与 dsh 内核双更新链（失败回退）；macOS 未签名未公证（README 自述） | https://github.com/zouyuxuan122/Deepseek-Harness-EAC（README 2026-08-28） |
| Minke (lencx) | 独立桌面客户端 + 远程 Host | Electron + 本地 Host | 572★，v0.3.0（2026-08-25），Apache-2.0 | **Agent Browser（共享人控：agent 开页/点击/填表/截图，人随时接管/标注并回传截图上下文）**；WeChat（扫码）/Telegram/Discord bot 远程派活收结果；三条已验证远程路线：Tailscale Serve(HTTPS)/Tailscale Direct IP/Cloudflare Access，远端是响应式 Web 工作台+PWA 而非桌面投影；Files/Terminal(真实 PTY)/Browser/Plugins 标签工作台，Plugins 支持 GitHub 发现/状态检查/修复/移除；本地模型（LM Studio/Ollama/循环 OpenAI 兼容+可选生命周期管理）；Cmd+K 命令面板、可配置快捷键、日志导出、主题同步、中英双语；数据迁移（预览合并/去重）；macOS/Win/Linux 含 AppImage；内置更新器校验 release+尺寸+SHA-256 | https://github.com/lencx/Minke（README 2026-08-28） |
| DSH Desktop (myYangyunfan) | 独立桌面客户端 | Tauri 2（v0.5.x 起；0.1.x–0.4.x 为 Electron） | 597★，v0.5.2（2026-08-22） | 深色玻璃无边框自绘标题栏+Win11 圆角；托盘常驻；桌面宠物小鲸鱼；会话独立浮窗；归档/恢复/删除；**余额小部件（本轮费用/余额+OpenCode Go 额度，点击充值）**；任务完成系统通知；"守护瀑布"内核启动链自愈（坏插件自动修复/坏配置重建/内核崩溃环原地重启）、渲染层假死心跳重载、事件词汇表自动修补；GitHub/Gitee 双源自更新（sha256 fail-closed、离线静默）；快捷方式自检重补；便携版+安装版 | https://github.com/myYangyunfan/dsh_desktop（README 2026-08-28） |
| DeepSeek Harness Studio (fufankeji) | 独立桌面客户端（增强型工作台） | Electron | 548★，v0.1.0-rc.19（2026-08-27 前后） | 原生目录选择+Workspace 管理/归档/Fork；长会话完整目录+全文跳转；插件发现+**Agent 智能推荐**；可信安装（版本/权限/兼容性/风险预检）+事务回滚+插件安全模式；Preset 广场（7 套内置工作流）+"应用中心"；**多模型+本地推理（Ollama/vLLM/SGLang/自定义 OpenAI 兼容）**；**视觉增强（DeepSeek 图文模型或已验证云端/自托管视觉路线，图片附件持久化单一路径）**；Plan/Goal/Todo/Jobs/Workflow 面板；SubAgent 多 Agent 协作+父子谱系；权限/沙箱（只读/工作区写/完全访问）+人工确认；主题皮肤；路线图:独立能力中心(MCP/Skills)、可视化 Agent 编排、远程控制与自动化 | https://github.com/fufankeji/deepseek-harness-studio（README 2026-08-28） |
| Cocode | Harness 发行版（GUI+TUI） | Electron GUI（electron 43 + electron-updater + notarize）+ npm TUI（`@cocode-agency/tui`）+ `host-supervisor` | 161★，v1.1.1（2026-08-27） | 换 Agent 而非只换模型：四个内置 preset（Standard/PTC/Minimal/Creator），界面内可直接读 `agent.cordis.yml` 并复制修改；工作台（文件/Git/终端/内置浏览器/diff 预览）；GUI 与 TUI 并列发行；"Cocode Nut"或自有 DeepSeek 兼容 Key；macOS/Win 产物（README 声明需真实 TTY、开发者预览） | https://github.com/cocode-agency/cocode（README 2026-08-28） |
| DSH Desktop Bundle Edition (vibeinging) | 独立桌面客户端（预装 Bundle 发行版） | Electron | 632★，v0.2.0（2026-08-28） | 直接运行官方 dsh-web-app + 一组固定验证的社区 Bundle：Better Sidebar 0.16.0（多仓库/Worktree/Vue/本地 md 图）、任务看板、附件、Git worktree、Office 成果物、插件市场；同一 profile 统一管理；macOS Developer ID 签名+公证；新 Profile 离线固定产物初始化（可复现默认环境、不静默装回用户卸载的插件）；出错进入恢复页 | https://github.com/vibeinging/dsh-desktop（README 2026-08-28） |
| DSH Desktop (bruc3van) | 独立桌面客户端（安全向） | Electron | 76★，未签名（README 自述"尚未经过正式开发者签名认证"） | 关窗不退出、托盘常驻、受控重启+唤醒恢复；**Agent 执行环境治理**（优先复用运行中实例/PATH dsh/npx 缓存/内置运行时，macOS 对齐登录 shell PATH，注入 node/pnpm/dsh，`ELECTRON_RUN_AS_NODE` 不泄漏给 Agent）；**内置安全市场：600+ 精选插件，每日自动采集+人工精选，安装前先由 Agent 读代码审查，默认关闭**；更新链防劫持+SHA-256；沙箱渲染器；智能模式四层探测（127.0.0.1:3080→PATH→npx→内置）+自定义固定地址模式；五种运行时来源状态透明；发布流水线门禁（空 PATH 冒烟/更新链夹具/e2e） | https://github.com/bruc3van/dsh-desktop（README 2026-08-28） |
| DSH Desktop (qufei1993) | 纯壳型客户端 | Electron（electron-vite） | 47★，v0.2.6（2026-08-24） | 打包 Node 24 LTS+pinned pnpm；**Version Manager：安装/保留/切换官方 dsh 版本**；官方新版本更新提示；沙箱窗口；双语文案；SHA-256 校验；明确边界：不改/不读官方 DSH 数据、不管模型/插件/Skills/MCP | https://github.com/qufei1993/dsh-desktop（README 2026-08-28） |
| DeepSeek Harness Desktop Pro (FuqiangCraft) | dsh 插件 + Tauri 壳 | Tauri 2 + 插件包 `@mixian/dsh-desktop-plugin`（npm 0.1.1，2026-08-25） | 4★（仓库），插件 npm 0.1.1 | **待审批/提问/计划评审桌面通知**（点击跳转会话）；**可选 `screen_capture` 模型工具**（默认关闭，`screenCapture: true` 显式开启；截图以图片附件回填会话，绝不静默注入）；多 Agent 平铺画布（只读网格）；桌宠窗口（猫/机器人/鲸鱼，状态机驱动 idle/thinking/working/alert/success）；桌面设置区+窗口皮肤（磨砂/动漫/赛博/太空）；托盘+最近会话菜单+更新检查；空闲零 token；自述未实现：原生 OS 通知、Alt+Space 全局快速面板、时间旅行 | https://github.com/FuqiangCraft/dsh-desktop（README 2026-08-28；[awesome-dsh-plugin 收录条目](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)） |
| DSH Desktop (liguobao) | 加固 Electron 壳 | Electron | 26★，macOS Developer ID 签名+公证 | 内置版本匹配的 Harness+Remote+File Viewer；**只读预览（源码/文本/Markdown/图片/PDF/CSV/JSON/YAML）**；**远程会话访问（另一台电脑/手机/平板，附 DSH Remote Android APK）**；插件从 npm/GitHub 发现安装；工作区动作（VS Code/Cursor/VSCodium/Zed/系统文件管理器）；本地回环服务+受限渲染器；SHA-256 更新校验；Linux AppImage；夸克网盘镜像 | https://github.com/liguobao/dsh-desktop（README 2026-08-28） |

### 2.2 同包生态工具（非桌面，简要）

| 名称 | 类型 | 活跃度 | 主要能力 | 来源 |
|---|---|---|---|---|
| dsh-market | 插件市场（装进 Harness 设置的插件） | 2.7k★ | 2300+（README 数字，未独立验证）插件目录、分类/排序/双语、AppStore 式截图、giscus 评论、主题一键换装、**插件清单备份/恢复（JSON/WebDAV/GitHub Gist，合并+回滚）**、单插件/批量更新 | https://github.com/dsh-market/dsh-market |
| ccch1mneyyy/dsh-TUI | 终端 TUI 插件 | 2.7k★ | Claude Code 风 TUI：鲸鱼顶栏/实时状态/流式思考/双击 Esc 回滚/上下文进度+TPS；被 DSH 官方公众号收录（README 自述，未独立验证） | https://github.com/ccch1mneyyy/dsh-TUI |
| @openma/deepseek-harness-acp | npm ACP 适配器 | 0.4.26（2026-08-24） | 让 Zed 等 ACP 客户端直接驱动 dsh（多客户端复用） | https://www.npmjs.com/package/@openma/deepseek-harness-acp |
| 移动端组：saya-ch/dsh-mobile（168★）、kelai141/dsh-mobile-apk（262★，WebView+Termux 快照）、thness/dsh-mobile（17★，Kotlin 嵌入式 Node）、chokwinlee/deepseek-harness-desktop（110★，SwiftUI iPhone Remote）等 | Android/iOS 客户端或远程插件 | 见左 | 把 dsh 装进手机（嵌入式运行时）或作为安全远程插件（LAN/远程、自定义移动界面），与桌面客户端形成配对关系 | https://github.com/saya-ch/dsh-mobile 等（逐仓库 README） |

### 2.3 长尾（未逐项核实特征，仅记录存在与简要描述）

以下均为 `gh search repos` 命中、且 README 描述明确为 dsh 桌面壳/启动器的项目，本表仅列仓库名与描述口径，**特征未逐项到 README 验证**：

- `ningbainb/deepseek-harness-desktop`（226★，Windows 零配置）· `agent-earth/deepseek-harness-desktop`（184★，极简跨平台）· `ChisaAlter/Deepseek-Harness-Desktop`（142★，Electron，主题背景）· `xiincs/deepseek-harness-desktop`（54★，Tauri 2，托盘常驻+自动更新）· `chen704290901chen/deepseek-harness-desktop`（62★，AI 桌面工作台）· `xingj404-lab/dsh-desktop`（61★）· `microtree9/deepseek-harness-desktop`（71★）· `baihejiangnan/deepseek-harness-desktop`（27★，多实例隔离+协作画布，便携版约 18M）· `baiyuscc13724-max/deepseek-harness-desktop`（9★，中文 Windows：女仆鲸桌宠/主题/插件市场/模型路由/安全更新——README 描述含"多模态视觉"）· `jiangnanquan/dsh-ux`（8★，Web UI 增强插件+无边框 Electron 壳）· `gatesenman/dsh-desktop`（10★）· `foolgry/dsh-desktop`（10★）· `hdw-design/deepseek-harness-gui`（0★，Windows 自动更新）· `festoney8/deepseek-harness-GUI`（5★，Tauri，免安装便携+内核升级）· `CoralFlower325/Deepseek-Harness-GUI`（2★，SwiftUI+WKWebView 原生 macOS）· `ln9527/deepseek-harness-gui`（0★，Electron，托盘+原生通知+版本管理）· `2439816947/DSH-Desktop`（31★）· `JustGenius-s/DSH-Desktop`（24★）· `RAFOLIE/dsh-desktop-windowos`（12★，Tauri，托盘+任务完成 toast+单文件 exe）· `FlashingChen/dsh-desktop-hub`（56★，Electron+TS 管理控制台：多 Tab 管理 Harness/Plugin/MCP/Skills）· `yu-wenchao/deepseek-harness-desktop-Install`（6★，含插件市场+多模态视觉）· `xingj404`/`iuikj/dsh-desktop`（20★）/`yxccai/dsh-desktop`（11★）/`wangjicheng2004`（8★）等。

> 上述条目来自 2026-08-28 的 `gh search repos`（query 见第 5 节）。判断"未验证"的含义：只读了 GitHub 搜索结果的仓库描述，未打开 README。

## 3. 亮点与对标

### 3.1 他们有、我们没有的（值得关注的差异点）

1. **代码签名/公证**：dataelement（macOS 双架构 Apple 签名+公证、Windows 代码签名）、liguobao（macOS）、vibeinging（Developer ID+公证）已把它做成发布门禁（dataelement 还公开了 release runbook 文档）。我们完全没有。
2. **vision/画面捕获**：FuqiangCraft 的 `screen_capture` 模型工具（显式 opt-in 配置 + 截图始终回填会话保证透明）；Studio 的"视觉增强自动路由"（DeepSeek 图文模型或云端/自托管视觉路线 + 图片附件持久化）；EAC 可视化配置视觉模型。我们只有规划。
3. **安全恢复 / Safe Mode 机制**：dataelement 非破坏性 Safe Mode（只跑官方核心 bundle）；anywhere-labs 三槽位健康启动检查点+恢复页；EAC 安装/启动前快照+体检修复回滚+事故报告；myYangyunfan"守护瀑布"逐级自愈。我们没有同等粒度的插件级故障隔离。
4. **远程接入路线多样**：Minke（Tailscale Serve/直接 IP/Cloudflare Access 三路线+PWA）、liguobao（内置 DSH Remote Android APK）、dataelement（配对桥+临时 Cloudflare 隧道）。我们只有 QR LAN 配对一种形态。
5. **预装/可移植"预设"**：dataelement `*.dshpreset` 便携预设包（冲突检查+信任警告）；Studio Preset 广场；cocode 四套可读可改的 Agent preset（agent.cordis.yml 直接在界面里看）。我们只有"扩展设置"区。
6. **插件安全审查**：bruc3van 每日自动采集+人工精选目录，安装前 Agent 读代码审查，默认关闭、开启后才联网。
7. **本地模型支持**：Minke（LM Studio/Ollama）、Studio（Ollama/vLLM/SGLang）。
8. **多 Agent 监控/协作 UI**：FuqiangCraft 平铺画布（只读）、Studio SubAgent 谱系（父子+状态+耗时+停止轮次）、baihejiangnan 协作画布。
9. **Agent 浏览器与人机共控**：Minke（唯一一家把这做成完整功能的）。
10. **会话级 Git Worktree 隔离**：dsh-tauri-desk（dsh-tauri-worktree）、vibeinging（Better Sidebar worktree）。
11. **桌面宠物/游戏化**：myYangyunfan 小鲸鱼、FuqiangCraft 桌宠、cookiesheep/whale-on-desk、Dkrillex macOS 桌宠、EternalNight996 像素办公室 —— 社区把"agent 在用"可视化做得很有创意。
12. **余额/成本小部件**：myYangyunfan（本轮费用+余额+OpenCode Go）、GeekRicardo/dsh-balance（多提供方）。
13. **dsh 内核版本管理**：qufei1993 Version Manager、dsh-tauri-desk 多版本内核+健康检查、EAC 双更新链（内核与客户端分离、失败回退）—— 上游 rc 阶段破坏性变更频繁，它们都为此做了产品化。
14. **终端/文件工作台集成**：EAC 持久 PowerShell、Minke 真实 PTY、giiiiiithub node-pty 终端、cocode 内嵌浏览器、liguobao 只读预览（PDF/CSV/JSON/YAML）。

### 3.2 我们有、他们没有（或只有局部实现的）

- **全局召唤快捷键**：调研覆盖的 15+ 桌面项目中，只有 FuqiangCraft 明确把"Alt+Space 全局快速面板"列为规划（自述未实现）；其余项目只有应用内快捷键/命令面板（Minke Cmd+K），均无系统级全局热键。
- **LAN QR 配对到手机**：最接近的是 dataelement 的配对桥（扫描配对码+桌面批准+临时隧道）与 Minke 的远程接驳，但"桌面内配对码 + 专用手机壳 dsh-mobile-shell"这组组合未发现同级项目（chokwinlee 的 SwiftUI iPhone Remote 属于另一形态，未比较界面细节）。
- **应用内"扩展入口"浮层 + Harness 设置内的"扩展设置"区**：社区多做"插件市场"或侧栏面板（dsh-market、dsh-tauri-panel、AKS1st/dock、Fishquito7 skill-MCP 面板），没有"桌面壳与 Harness 设置 UI 同源扩展区"这一形态的实现。
- **原生状态通知（完成/失败/需确认三态）**：FuqiangCraft 只做浏览器通知（自述原生 OS 通知未实现）；myYangyunfan 有任务完成系统通知但需确认态未见；dsh-notification 插件只覆盖回合完成。我们是三态原生通知。
- **诊断导出**：dataelement（harness.log+引导恢复）、Minke（日志导出）、EAC（事故报告）有源头，但"一键导出诊断包"形态仍算差异点。
- **启动偏好（开机自启/启动隐藏）**：多数项目只有"关闭隐藏到托盘"，launch-at-login 几乎无人提及。

## 4. 可借鉴清单

按投入产出比排序（含理由）：

1. **代码签名与公证（macOS）** —— dataelement/liguobao/vibeinging 已论证可行且有 runbook 化流程；信任维度上他们与我们最大的差距所在。建议把 release runbook + 签名/公证 + SHA-256 校验作为发布门禁纳入我们的发布流程。
2. **内核版本管理与双更新链** —— 上游 rc 频繁破坏性变更（qufei1993/EAC/tauri-desk 均为此做产品），我们只有"随包固定版本"。可借鉴：应用内"检查新 dsh 内核 → 安装到数据目录 overlay → 失败一键回退内置版本"（EAC 的原子切换与回退）。
3. **Safe Mode/健康检查点** —— 插件是 dsh 的病源。EAC 快照+修复+回滚、anywhere-labs 三槽位检查点、dataelement Safe Mode 三种做法里，**Safe Mode（只装官方 bundle 的隔离 profile + 恢复引导）** 与我们现有诊断导出最搭，实现成本也最低（dsh 本身支持 profile 隔离）。
4. **便携预设包（`.dshpreset`）** —— dataelement 的冲突检查+信任警告设计可以直接对齐；与我们的"扩展设置"区天然衔接（把 Agent 预设作为可导出/导入的扩展资源）。
5. **vision/画面捕获的"透明注入"设计** —— FuqiangCraft 的 opt-in + 截图回填会话（不静默注入）是社区共识的稳妥做法；做 vision/OCR 时先抄这个形态，再做系统级截屏/OCR 扩展。
6. **插件安全市场（先审查再装）** —— bruc3van 的 Agent 读代码审查+默认关闭，可作为我们"扩展入口"里第三方插件来源的信任层。
7. **会话级 Worktree 隔离** —— dsh-tauri-worktree 模式（每会话 Git worktree + 检出/归档）保护工作区，可直接做成扩展入口里的一项能力。
8. **余额/成本小部件** —— myYangyunfan 的"本轮费用+余额+OpenCode Go"是低成本高感知的功能，可放进我们的状态通知体系。
9. **只读文件预览** —— liguobao 的 PDF/CSV/JSON/YAML 预览十分钟就做得完，弥补我们"诊断导出"里的文件查看体验。
10. **远程路线扩展（Tailscale Serve/Cloudflare Access）** —— Minke 已验证三路线端到端；在 QR 配对之外加一条 Tailscale Serve 选项即可覆盖"不想开隧道"的场景。
11. **多 Agent 只读监控画布** —— FuqiangCraft 平铺网格是纯客户端读 sessions store，零 token；可在我们的浮层菜单里加一个"工作台速览"。
12. **Agent Browser（人机共控）** —— Minke 的旗舰能力（agent 开页+人接管+标注回传），工程量最大，适合列入长期路线图而非近期。

## 5. 附注

**检索方法（全部主来源）**

- GitHub：`gh search repos "deepseek harness" / "dsh desktop" / "dsh tui" / "deepseek harness gui" / "dsh mobile" / "dsh web ui" / "deepseek harness desktop"`；`gh api repos/<repo>`（stars/license/pushed_at）、`releases/latest`、`readme`（Accept: application/vnd.github.raw）、`contents/package.json`（判断 Electron/Tauri）。搜索日期 2026-08-28。
- npm：registry.npmjs.org `/-/v1/search?text=deepseek harness`，及逐个 `https://registry.npmjs.org/<pkg>` 查最新版本与修改日期。
- 上游检查：`deepseek-ai/deepseek-harness` README（master，2026-08-28）——未提及桌面端/roadmap/推荐社区前端；`deepseek-ai` org 仓库全量列表无 desktop 相关仓库。
- 社区目录交叉验证：awesome-dsh-plugin/awesome-dsh-plugin（13328★，含"On desktop clients"说明与"Clients worth a look"条目）。

**未能验证 / 明确标注**

- 未做 `search/code` 全量消费方枚举（受 API 限流影响）；npm 上直接声明依赖 `@deepseek-ai/dsh` 的第三方包极少（多数客户端 vendored 固定版本或运行时下载，metadata 中不可见），已发现的直接消费方仅 `@openma/deepseek-harness-acp` 等。
- 各 README 中宣传性数字未独立验证：dsh-tauri-desk"5MB 安装包"、"2300+ 插件"（dsh-market）、ccch1mneyyy"官方公众号收录"、EAC 各路版本号与"未签名"自述、与上游"无隶属"声明 —— 均转述自项目自述。
- "签名/公证"仅依据 README 声明（未用 spctl/公证 API 复核）。
- 长尾清单（2.3）只读取了搜索结果描述，特征未逐项核实。
- 星数与版本在 2026-08-28 单日采样，社区迭代极快，数字随时会变。
