# Decision Records

This directory records the architecture decisions made while building dsh-desktop. Each record covers context, the decision, consequences, and alternatives. Records are numbered; accepted decisions constrain the implementation. Every record ships in English (`.md`) and Chinese (`.zh.md`).

本目录记录 dsh-desktop 实现过程中的架构决策,每篇含背景、决策、后果与备选方案;已接受的决策约束后续实现。每篇同时提供英文(`.md`)与中文(`.zh.md`)。

| No. | Title / 标题 | EN / 中文 | Status / 状态 |
|---|---|---|---|
| 0001 | Electron shell around the published @deepseek-ai/dsh | [EN](0001-electron-shell-around-published-dsh.md) · [中文](0001-electron-shell-around-published-dsh.zh.md) | Accepted / 已接受 |
| 0002 | Harness runs on a bundled standalone Node | [EN](0002-bundled-node-runtime.md) · [中文](0002-bundled-node-runtime.zh.md) | Accepted / 已接受 |
| 0003 | Share ~/.dsh with the CLI by default | [EN](0003-shared-dsh-home.md) · [中文](0003-shared-dsh-home.zh.md) | Superseded by 0012 / 已被 0012 取代 |
| 0004 | Release unsigned first, sign later | [EN](0004-unsigned-release-first.md) · [中文](0004-unsigned-release-first.zh.md) | Accepted / 已接受 |
| 0005 | Materialize the harness closure with pnpm deploy | [EN](0005-harness-closure-pnpm-deploy.md) · [中文](0005-harness-closure-pnpm-deploy.zh.md) | Accepted / 已接受 |
| 0006 | Harness supervision protocol | [EN](0006-process-supervision-protocol.md) · [中文](0006-process-supervision-protocol.zh.md) | Accepted / 已接受 |
| 0007 | CJS single-file main bundle | [EN](0007-cjs-main-bundle.md) · [中文](0007-cjs-main-bundle.zh.md) | Accepted / 已接受 |
| 0008 | Size reduction and download channels for Chinese networks | [EN](0008-size-and-cn-download-channels.md) · [中文](0008-size-and-cn-download-channels.zh.md) | Partially superseded by 0022 / 部分被 0022 取代 |
| 0009 | Composite version (dsh + shell) and upstream watch automation | [EN](0009-composite-version-dsh-watch.md) · [中文](0009-composite-version-dsh-watch.zh.md) | Accepted / 已接受 |
| 0010 | macOS check-only update prompt | [EN](0010-macos-check-only-update.md) · [中文](0010-macos-check-only-update.zh.md) | Accepted / 已接受 |
| 0011 | Shell UX polish: retry recovery, persisted window state, tray surface / 壳体验打磨:重试恢复、窗口状态持久化、托盘面 | [EN](0011-shell-ux-polish.md) · [中文](0011-shell-ux-polish.zh.md) | Accepted / 已接受 |
| 0012 | Isolate the desktop data home by default / 桌面数据目录默认独立 | [EN](0012-isolated-dsh-home.md) · [中文](0012-isolated-dsh-home.zh.md) | Accepted / 已接受 |
| 0013 | Product naming: app/artifacts are dsh-desktop, repo keeps dsh-electron-shell / 产品命名:应用与安装包用 dsh-desktop,仓库保持 dsh-electron-shell | [EN](0013-product-naming.md) · [中文](0013-product-naming.zh.md) | Superseded by 0022 / 已被 0022 取代 |
| 0014 | Deny renderer permissions by default / 渲染层权限默认拒绝 | [EN](0014-deny-renderer-permissions-by-default.md) · [中文](0014-deny-renderer-permissions-by-default.zh.md) | Accepted / 已接受 |
| 0015 | Local-only diagnostics and bounded log retention / 本地诊断报告与有界日志保留 | [EN](0015-local-diagnostics-and-log-retention.md) · [中文](0015-local-diagnostics-and-log-retention.zh.md) | Accepted / 已接受 |
| 0016 | Minimal dual-platform release surface / 最小双端发布面 | [EN](0016-minimal-dual-platform-release-surface.md) · [中文](0016-minimal-dual-platform-release-surface.zh.md) | Partially superseded by 0017 / 部分被 0017 取代 |
| 0017 | Linux deb as the sole Linux release format / Linux 发布唯一格式 deb | [EN](0017-linux-deb-sole-format.md) · [中文](0017-linux-deb-sole-format.zh.md) | Accepted / 已接受 |
| 0018 | Global shortcut for summoning the desktop shell / 桌面全局快捷键快速唤起 | [EN](0018-global-summon-shortcut.md) · [中文](0018-global-summon-shortcut.zh.md) | Accepted / 已接受 |
| 0019 | Desktop preferences and status notifications / 桌面偏好与状态通知 | [EN](0019-desktop-preferences-and-status-notifications.md) · [中文](0019-desktop-preferences-and-status-notifications.zh.md) | Accepted / 已接受 |
| 0020 | Desktop entry help surface and notification click-to-focus / 桌面入口帮助浮层与通知点击聚焦 | [EN](0020-desktop-entry-help-surface.md) · [中文](0020-desktop-entry-help-surface.zh.md) | Accepted / 已接受 |
| 0021 | Safe mode, recovery center, and portable presets / 安全模式、恢复中心与便携预设包 | [EN](0021-safe-mode-recovery-presets.md) · [中文](0021-safe-mode-recovery-presets.zh.md) | Accepted / 已接受 |
| 0022 | Repository renamed back to dsh-desktop / 仓库改回 dsh-desktop | [EN](0022-repo-rename-dsh-desktop.md) · [中文](0022-repo-rename-dsh-desktop.zh.md) | Accepted / 已接受 |
| 0023 | Extension surfaces carry extension actions only / 扩展面只放扩展动作 | [EN](0023-extension-surface-actions.md) · [中文](0023-extension-surface-actions.zh.md) | Accepted / 已接受 |
