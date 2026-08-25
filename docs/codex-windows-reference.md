# Codex 的 Windows 桌面形态参考（窗口 chrome 与功能发现）

本文是 DSH Desktop（隐藏原生菜单栏的 Electron 桌面壳）做功能发现设计时的外部参考调研。调研对象是 OpenAI Codex 在 Windows 上的产品形态与 UX 做法：它有没有桌面 GUI？GUI 的窗口 chrome 是什么样？没有 OS 菜单栏时，功能靠什么被发现？

## 调研方法与可信度说明（重要）

本次调研只使用 primary sources，但网络环境受限，如实记录如下：

- 可访问：GitHub（`api.github.com`、`raw.githubusercontent.com`），即 [`openai/codex`](https://github.com/openai/codex) 仓库的 README、`docs/`、`codex-rs/` 源码、GitHub Releases（已确认 `main` 分支 commit `0533f96c447b55b0eea414072db1436c42fba85e`，2026-08-24；latest release `rust-v0.149.1`）。
- **不可访问（返回 403 / 连接失败）**：`developers.openai.com`（官方 Codex 文档站，Cloudflare 403）、`openai.com/codex/`、`help.openai.com`（OpenAI Help Center）、`chatgpt.com`、`learn.chatgpt.com`、`web.archive.org`。
- 因此：凡官方文档站写的内容，本文只引用 GitHub 仓库内**自己链接的那些文档页 URL**（证明页面存在），但页面正文**无法核实**，一律标注 `[未核实]`，不猜。

下文所有可验证的结论都来自仓库内代码/README，并标注文件路径。

---

## 1. Codex 的产品形态与 Windows 支持（Q1）

结论：Codex 目前（2026-08，`rust-v0.149.1`）不是"一个 Windows 桌面应用"，而是一个**多形态组合**，每种形态的 Windows 支持情况不同：

| 形态 | 说明 | Windows 支持 | 证据来源 |
|---|---|---|---|
| **Codex CLI / TUI**（终端里的 Rust TUI） | `codex` 命令，仓库描述为 "Lightweight coding agent that runs in your terminal" | **支持（原生 Windows 二进制 + PowerShell 安装脚本）**；但仓库内 `docs/install.md` 仍写 "Windows 11 **via WSL2**"，两条资料矛盾（README 是新的，install.md 疑似滞后） | README.md、docs/install.md、Release assets |
| **Codex in IDE**（VS Code 扩展等） | "If you want Codex in your code editor (VS Code, Cursor, Windsurf), install in your IDE" | 扩展本身跨平台（VS Code/JetBrains 生态）；README 只点名 VS Code、Cursor、Windsurf；仓库中**没有任何 JetBrains 引用**，JetBrains 支持情况 `[未核实]` | README.md → developers.openai.com/codex/ide |
| **Codex Web**（云端 agent） | "the cloud-based agent ... Codex Web, go to chatgpt.com/codex" | 浏览器即 Windows 可用 | README.md |
| **Codex Desktop app**（独立 GUI） | "If you want the desktop app experience, run `codex app` or visit ... `chatgpt.com/codex?app-landing-page=true`" | **Windows 上存在**：Microsoft Store（MSIX）分发，安装器 URL `get.microsoft.com/installer/download/9PLM9XGG6VKS`，商店页 `apps.microsoft.com/detail/9plm9xgg6vks` | `codex-rs/cli/src/desktop_app/windows.rs` |
| **Codex 内嵌于 ChatGPT 桌面 app** | macOS 上 `codex app` 会查找 `Codex.app` 与 `ChatGPT.app` 两种 bundle；Windows 上检测的是 Store 包 `OpenAI.Codex_*!App`，代码注释明说 "This package identity is stable across **Codex- and ChatGPT-branded builds**" | **Windows 上该 MSIX 包同时覆盖 Codex 品牌与 ChatGPT 品牌构建**（即 Codex 桌面能力也是 ChatGPT 桌面应用的一部分），同理 Linux 上 `codex` 的提示是 "install it from learn.chatgpt.com/docs/linux/linux-app and run 'chatgpt'" | `desktop_app/mac.rs`、`desktop_app/windows.rs`、`tui/src/tooltips.rs` |

### Windows 安装与分发的仓库证据（Q5 前半）

- README.md 给 Windows 的原生 CLI 安装命令：

  ```powershell
  powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"
  ```

  另有 `npm install -g @openai/codex`；README 说 installers 默认从 `releases.openai.com/codex` 下载，回退 GitHub Releases。
- GitHub Release `rust-v0.149.1` assets 中存在**原生 Windows 二进制**：`codex-x86_64-pc-windows-msvc.exe`、`codex-aarch64-pc-windows-msvc.exe`（以及 `.tar.gz/.zst` 包）、`codex-app-server-*-pc-windows-msvc.exe`、`codex-code-mode-host-*`、`codex-command-runner-*`、`codex-windows-sandbox-setup-*`、`codex-package-*-pc-windows-msvc.tar.gz`。
- macOS 版桌面 app 是 DMG：`codex-*-apple-darwin.dmg`（`mac.rs` 中的下载 URL 指向 `persistent.oaistatic.com/codex-app-prod/Codex.dmg` / `Codex-latest-x64.dmg`）。
- Windows 桌面 app 更新走 Microsoft Store：`codex-rs/cli/src/doctor/updates.rs` 定义 `https://persistent.oaistatic.com/codex-app-prod/windows-store-update.json`，manifest 含 `storeProductId`、`packageIdentity`。
- **仓库中搜索不到 winget、MSI、msstore 之外的打包方式**；Windows GUI 就是 MSIX/Store 分发，CLI 是 npm/installer 脚本 + GitHub Release 二进制。CLI 侧没有独立的 Windows 安装器 UI。

### `codex app` 在 Windows 上的行为（来自源码，非常关键）

`codex-rs/cli/src/desktop_app/windows.rs` 的逻辑：

1. 用 `powershell Get-StartApps | Where-Object AppID -Like 'OpenAI.Codex_*!App'` 判断桌面 app 是否已安装；
2. 已安装 → 打开 **deep link** `codex://threads/new?path=<workspace>`（路径做 URL 编码，处理 `\\?\` 与 UNC 前缀）；
3. 未安装 → 打开 MS Store 安装器 URL（`get.microsoft.com/installer/download/9PLM9XGG6VKS`），失败则回退商店页。

即：**Windows 下 Codex 从 CLI 到 GUI 的桥是 `codex://` URI scheme deep link**，对应的 macOS 侧是 `open -a Codex.app codex://threads/new?path=...`。这对 DSH Desktop 的参考价值：主进程 CLI/终端与桌面 GUI 用 custom protocol（或 `--` 参数/单实例消息）互相唤醒，是 ChatGPT/Codex 家族的标准做法。

TUI 里也有 `/app` 命令："continue this session in the Desktop app"（`codex-rs/tui/src/slash_command.rs`），tip 文案也反复推 `codex app` / `/app`（`tooltips.rs`：`APP_TOOLTIP`、`MACOS_APP_TOOLTIP`、`LINUX_APP_TOOLTIP`）。

---

## 2. 桌面 GUI 的窗口 chrome / 菜单 / 托盘（Q2 与 Q4）

**结论：这方面没有任何可核实的 primary source，问题 4 的答案就是"未文档化"。**

具体事实与边界：

- Codex 桌面 app **本身是闭源**的：openai/codex 仓库只包含其后端 `codex-rs/app-server`（JSON-RPC over stdio/websocket/unix socket，README 写 "`codex app-server` is the interface Codex uses to power rich interfaces such as the Codex VS Code extension"），不包含任何 GUI 前端代码、窗口管理、菜单或托盘代码。
- 在仓库里用 GitHub code search 检索 `tray`、`menu bar`、`menubar`、`context menu`、`titlebar`：**没有任何 GUI 相关的命中**（命中的 `tray` 是无关代码）。
- 从 `doctor/desktop/`（`codex-rs/cli/src/doctor/desktop.rs` 与 `platform.rs`、`windows_security.rs`）可以确认的仅剩事实：
  - Windows 桌面 app 以 **MSIX Store 包**形式发现（`FindPackagesByPackageFamily`、package family 以 `openai.codex_` 开头），可执行文件名是 **`codex-desktop.exe`**；
  - 桌面 app 通过 **websocket 连接 CLI 的 app-server**（doctor 检查项 `desktop.app_server.handshake`，握手事件记录 `ConnectionContext { local_websocket }`）；
  - doctor 会列出桌面 app 的版本/更新状态（`windows_store_update`）。
- 官方文档站上可能有 Desktop app 的 UX/快捷键页面（README 指向 `chatgpt.com/codex?app-landing-page=true` 的 "Codex App page"），但本环境访问不到，**内容无法核实**，不做任何猜测。

因此，对于 DSH Desktop 最关心的"隐藏菜单栏后，tray 菜单与右键菜单该怎么设计"这个问题：**OpenAI 官方没有公开任何关于 Codex 桌面 app 窗口 chrome、菜单栏、托盘、右键菜单的设计资料**（至少在本环境可触及的 primary source 内）。不能把 ChatGPT 桌面客户端的做法当作 Codex 的官方设计——ChatGPT 桌面客户端同样没有官方公开的窗口 chrome 文档，`[未核实]`。

---

## 3. CLI / TUI：没有 OS 菜单栏时的功能发现（Q3）

这个是 Codex 文档最充分的部分，而且"终端 TUI 中如何发现功能"对 DSH Desktop 的隐藏目录栏问题有直接参考价值。证据分两类：官方文档页（仓库内链接，正文未核实）与仓库源码（可核实）。

### 3.1 官方文档页（存在但正文未核实）

- `docs/slash_commands.md` → [https://developers.openai.com/codex/cli/slash-commands](https://developers.openai.com/codex/cli/slash-commands)（仓库里明确链接的页面）
- `docs/getting-started.md` → [https://developers.openai.com/codex/cli/features#running-in-interactive-mode](https://developers.openai.com/codex/cli/features#running-in-interactive-mode)（"For an overview of Codex CLI features"）
- README 还链接了 [https://developers.openai.com/codex](https://developers.openai.com/codex)、[/codex/auth](https://developers.openai.com/codex/auth)、[/codex/ide](https://developers.openai.com/codex/ide)、[/codex/cli](https://developers.openai.com/codex/cli)、[/codex/config-advanced](https://developers.openai.com/codex/config-advanced)。

### 3.2 可核实的源码事实：Codex TUI 的功能发现机制（三件套）

**(a) In-TUI 快捷键提示（"无菜单栏 UI"的经典答案：脚注 + 帮助浮层）**

- 输入框 footer 常驻提示 **"`?` for shortcuts"**；`?` / `Shift+?` 打开快捷键浮层（`codex-rs/tui/src/bottom_pane/footer.rs`、`codex-rs/tui/src/keymap.rs` 的 `toggle_shortcuts: default_bindings![plain(KeyCode::Char('?')), shift(KeyCode::Char('?'))]`）。
- 默认键位（`keymap.rs` `built_in_defaults()`，全部**不依赖 OS 菜单栏**）：

  | 动作 | 默认键 |
  |---|---|
  | 提交 | Enter |
  | 排队输入 / 切模式 | Tab（footer 提示 `shift+tab to cycle`） |
  | 打断当前 turn | Esc |
  | 打开会话面板（transcript） | Ctrl+T |
  | 打开外部编辑器 | Ctrl+G |
  | 复制 | Ctrl+O |
  | 清屏 | Ctrl+L |
  | 打开侧边会话 | Ctrl+/（兼容 Ctrl+7） |
  | agent 面板 | Alt+A |
  | raw 输出模式 | Alt+R |
  | 历史搜索 | Ctrl+R / Ctrl+S |
  | 光标/Vim 移动 | 左右 ↑↓、Ctrl+B/F/P/N（emacs 系）、Vim 系（h/j/k/l、i、o 等） |
  | 快捷键浮层 | `?` |
  | 退出 | q / Ctrl+C / Ctrl+D（onboarding keys） |
  | 开关动画 | Ctrl+.（`onboarding/keys.rs`） |

- **键位可改**：`/keymap` 命令（"remap TUI shortcuts"）——把"快捷键被发现"这件事本身做成了命令，这是 Codex 处理"没有菜单栏可点"的典型思路：**发现入口本身也是可发现的功能（/ 斜杠命令）**。

**(b) `/slash` 命令大全（`codex-rs/tui/src/slash_command.rs`，可核实的命令清单）**

`/feedback`、`/new`、`/init`（生成 AGENTS.md）、`/compact`、`/review`、`/rename`、`/resume`、`/archive`、`/delete`、`/clear`、`/fork`、**`/app`（"continue this session in the Desktop app"）**、`/quit`、`/exit`、`/copy`、`/export`、`/raw`、`/diff`、`/mention`、`/skills`、`/import`、`/hooks`、`/status`、`/cd`、`/pwd`、`/usage`、`/debug-config`、`/title`、`/statusline`、`/theme`、`/pets`、`/ps`、`/stop`、`/model`、`/personality`、`/plan`、`/goal`、`/agents`、`/multi-agents`、`/permissions`、**`/keymap`**、`/vim`、`/elevate-sandbox`、`/experimental`、`/auto-review`、`/memories`、`/mcp`、`/apps`、`/plugins`。其中 `/permissions`（"choose what Codex is allowed to do"）、`/plan`、`/vim`、`/theme`、`/model` 这类都是"在没有菜单栏的界面里承担原来菜单职责"的典型——即**用斜杠命令模拟菜单层级**。

**(c) 首启 onboarding + 随机 tip**

- `codex-rs/tui/src/onboarding/`（`onboarding_screen.rs`、`welcome.rs`、`auth.rs`、`trust_directory.rs`）：首启有 welcome / 登录 / trust directory 流程，键位固定（`keys.rs`）。
- `tooltips.rs`：启动期展示随机 tip，**按平台定向推广桌面 app**（Windows：`APP_TOOLTIP` = "Try the **Desktop app**. Run 'codex app' or visit ...app-landing-page=true"；macOS：`MACOS_APP_TOOLTIP`；Linux：`LINUX_APP_TOOLTIP` 指向 ChatGPT Linux app）。

> 注：`docs/getting-started.md` 全文只有一句话（指向文档站），codelab/tutorial 类入门内容都在文档站 `/codex/cli/features` 等页面，正文 `[未核实]`。

---

## 4. 对 DSH Desktop 的具体启示（局限内的翻译）

1. **Codex 不存在"Windows 上隐藏菜单栏的官方 GUI"参照**——桌面 app 是闭源 MSIX，官方没有公开 chrome/菜单/托盘资料；**唯一公开的 GUI 骨架是 `codex app` + `codex://` deep link + app-server(websocket) 三层**。
2. **CLI→GUI 的衔接是 deep link + 单例检测**：`codex://threads/new?path=<编码路径>` 唤醒桌面 app；DSH Desktop 已有类似场景时可参考 `Get-StartApps` 检测 MSIX 安装、`Start-Process` 兜底商店页的做法（`windows.rs`）。
3. **无菜单栏时的功能发现，Codex 的公开答案是"快捷键 + 斜杠命令 + 常驻提示"**：footer 显示 "`?` for shortcuts"，`?` 打开快捷键浮层，`/` 命令把菜单项平移到命令层并支持 `/keymap` 自定义；对 DSH Desktop 的直接启发是：**把 tray/右键菜单内容同时暴露为可搜索的命令面板 + 常驻快捷提示**。
4. **用"提示条"代替菜单导航**：TUI 的 footer 提示（`? for shortcuts`、`shift+tab to cycle`、队列提示）是"常驻、低干扰、可发现"的替代方案。
5. **平台差异用一个入口统一**：`codex app` 在 macOS/Windows 行为不同（DMG vs MS Store）但命令相同——DSH Desktop 也可保留单一命令入口、按平台分流。

---

## 5. 需要明确标注"不支持/无法核实"的部分

- ❌ Codex 桌面 GUI 的窗口 chrome（标题栏/菜单栏/自定义隐藏 chrome/窗口控件位置）：**无任何 primary source 支持**，仓库无相关代码，官方文档站访问不到 → `[未核实]`。
- ❌ Codex/GPT 桌面 GUI 是否使用 system tray 菜单、右键上下文菜单：仓库零命中；ChatGPT 桌面客户端资料同样访问不到 → `[未核实]`。
- ❌ JetBrains 扩展的官方支持状态：仓库仅提 VS Code/Cursor/Windsurf，无 JetBrains 引用 → `[未核实]`。
- ❌ 文档站 `/codex/cli/features`、`/codex/cli/slash-commands` 的正文（keybindings 完整表、tutorial）：页面存在（仓库链接），正文本环境 403 → `[未核实]`。
- ⚠️ 矛盾点：README 走原生 Windows 二进制 + `install.ps1`，而 `docs/install.md` 的系统要求仍写 "Windows 11 **via WSL2**"，且 docs/install.md 的 Release assets 说明只列 macOS/Linux 二进制（与真实 Release 不符，疑似滞后）。
- ❌ winget / MSI：仓库与 Release 中均无 winget manifest 或 MSI 打包文件；Windows GUI 仅 Store/MSIX，CLI 仅 install.ps1/npm/Release 二进制。
- ❌ `chatgpt.com/codex`/`help.openai.com` 上的"ChatGPT for Windows"文档、MS Store 里的截图与描述：访问不到，未能核实（若需补足，建议人工在可联网环境核对）。

---

## Sources（本文引用的 primary source 清单）

GitHub（本次实际读取，commit `0533f96c447b55b0eea414072db1436c42fba85e` / release `rust-v0.149.1`，2026-08）：

- https://github.com/openai/codex — 仓库主页（description: Lightweight coding agent that runs in your terminal）
- https://raw.githubusercontent.com/openai/codex/main/README.md — 产品形态一览、Windows 安装脚本、`codex app`、Codex Web、IDE 链接
- https://raw.githubusercontent.com/openai/codex/main/docs/install.md — 系统要求（Windows 11 via WSL2）、构建说明
- https://raw.githubusercontent.com/openai/codex/main/docs/getting-started.md — 跳转 developers.openai.com/codex/cli/features
- https://raw.githubusercontent.com/openai/codex/main/docs/slash_commands.md — 跳转 developers.openai.com/codex/cli/slash-commands
- https://raw.githubusercontent.com/openai/codex/main/docs/config.md、docs/sandbox.md、docs/exec.md、docs/authentication.md — 仓库镜像文档（Windows 相关内容核查）
- https://github.com/openai/codex/releases/latest — release `rust-v0.149.1` assets 列表（windows-msvc.exe、app-server、sandbox-setup 等）
- https://github.com/openai/codex/blob/main/codex-rs/cli/src/desktop_app/windows.rs — MS Store 安装器 URL、`OpenAI.Codex_*!App` 检测、`codex://threads/new` deep link
- https://github.com/openai/codex/blob/main/codex-rs/cli/src/desktop_app/mac.rs — Codex.app/ChatGPT.app 查找、DMG 下载安装
- https://github.com/openai/codex/blob/main/codex-rs/cli/src/desktop_app/mod.rs — 平台分派
- https://github.com/openai/codex/blob/main/codex-rs/cli/src/app_cmd.rs — `codex app` 子命令
- https://github.com/openai/codex/blob/main/codex-rs/cli/src/desktop_app/…、codex-rs/cli/src/doctor/desktop/{desktop.rs,platform.rs,windows_security.rs} — `codex-desktop.exe`、MSIX package family、app-server websocket handshake
- https://github.com/openai/codex/blob/main/codex-rs/cli/src/doctor/updates.rs — `windows-store-update.json`（Store 更新 manifest）
- https://github.com/openai/codex/blob/main/codex-rs/cli/src/wsl_paths.rs — WSL 路径转换
- https://github.com/openai/codex/blob/main/codex-rs/tui/src/keymap.rs — 默认键位表（`?`/Ctrl+T/Ctrl+O/Ctrl+G/Ctrl+L/Ctrl+/、emacs/vim 系）
- https://github.com/openai/codex/blob/main/codex-rs/tui/src/slash_command.rs — 全部 slash commands 与描述
- https://github.com/openai/codex/blob/main/codex-rs/tui/src/tooltips.rs — 按平台推广 Desktop app 的 tip
- https://github.com/openai/codex/blob/main/codex-rs/tui/src/bottom_pane/footer.rs — "`?` for shortcuts" 常驻提示
- https://github.com/openai/codex/blob/main/codex-rs/tui/src/onboarding/{welcome.rs,keys.rs} — 首启 onboarding 与固定键位
- https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md — app-server：Codex GUI/IDE 的后端协议（JSON-RPC/websocket），GUI 前端不开源
- https://github.com/openai/codex/blob/main/codex-rs/features/src/lib.rs — Windows sandbox feature flags

OpenAI 官方文档/站点（**页面存在，正文本环境 403 未核实**，仅列出仓库内可证实的链接）：

- https://developers.openai.com/codex
- https://developers.openai.com/codex/cli
- https://developers.openai.com/codex/cli/features
- https://developers.openai.com/codex/cli/slash-commands
- https://developers.openai.com/codex/ide
- https://developers.openai.com/codex/auth
- https://developers.openai.com/codex/config-advanced
- https://chatgpt.com/codex（Codex Web；README 引用 `https://chatgpt.com/codex?app-landing-page=true` 为 Codex App 落地页）
- https://apps.microsoft.com/detail/9plm9xgg6vks 与 https://get.microsoft.com/installer/download/9PLM9XGG6VKS（windows.rs 中硬编码的 Windows 桌面 app 安装入口）
- https://learn.chatgpt.com/docs/linux/linux-app（tooltips.rs 中 Linux 桌面 app 入口）

> 备注：`openai.com/codex/`、`help.openai.com`（ChatGPT 官方帮助中心）、`chatgpt.com`、`developers.openai.com`、`web.archive.org` 在本次调研环境中均不可访问，未能引用其正文；如需完整对照，建议在可联网环境复核其中 Desktop app 与 ChatGPT for Windows 的页面。
