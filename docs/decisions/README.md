# Decision Records

This directory records the architecture decisions made while building dsh-electron-shell. Each record covers context, the decision, consequences, and alternatives. Records are numbered; accepted decisions constrain the implementation. Every record ships in English (`.md`) and Chinese (`.zh.md`).

本目录记录 dsh-electron-shell 实现过程中的架构决策,每篇含背景、决策、后果与备选方案;已接受的决策约束后续实现。每篇同时提供英文(`.md`)与中文(`.zh.md`)。

| No. | Title / 标题 | EN / 中文 | Status / 状态 |
|---|---|---|---|
| 0001 | Electron shell around the published @deepseek-ai/dsh | [EN](0001-electron-shell-around-published-dsh.md) · [中文](0001-electron-shell-around-published-dsh.zh.md) | Accepted / 已接受 |
| 0002 | Harness runs on a bundled standalone Node | [EN](0002-bundled-node-runtime.md) · [中文](0002-bundled-node-runtime.zh.md) | Accepted / 已接受 |
| 0003 | Share ~/.dsh with the CLI by default | [EN](0003-shared-dsh-home.md) · [中文](0003-shared-dsh-home.zh.md) | Accepted / 已接受 |
| 0004 | Release unsigned first, sign later | [EN](0004-unsigned-release-first.md) · [中文](0004-unsigned-release-first.zh.md) | Accepted / 已接受 |
| 0005 | Materialize the harness closure with pnpm deploy | [EN](0005-harness-closure-pnpm-deploy.md) · [中文](0005-harness-closure-pnpm-deploy.zh.md) | Accepted / 已接受 |
| 0006 | Harness supervision protocol | [EN](0006-process-supervision-protocol.md) · [中文](0006-process-supervision-protocol.zh.md) | Accepted / 已接受 |
| 0007 | CJS single-file main bundle | [EN](0007-cjs-main-bundle.md) · [中文](0007-cjs-main-bundle.zh.md) | Accepted / 已接受 |
| 0008 | Size reduction and download channels for Chinese networks | [EN](0008-size-and-cn-download-channels.md) · [中文](0008-size-and-cn-download-channels.zh.md) | Accepted / 已接受 |
