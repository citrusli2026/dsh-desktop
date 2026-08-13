# 决策记录(Decision Records)

本目录记录 dsh-desktop 实现过程中的架构决策:每份记录说明背景、决策内容、后果与备选方案。
记录按编号递增,状态为 `已接受` 的决策约束后续实现。

| 编号 | 标题 | 状态 |
|---|---|---|
| [0001](0001-electron-shell-around-published-dsh.md) | 用 Electron 壳包裹已发布的 @deepseek-ai/dsh,功能保持不变 | 已接受 |
| [0002](0002-bundled-node-runtime.md) | harness 运行在随壳内置的独立 Node 上 | 已接受 |
| [0003](0003-shared-dsh-home.md) | 默认与 CLI 共享 ~/.dsh 数据目录 | 已接受 |
| [0004](0004-unsigned-release-first.md) | 先以未签名(unsinged)形式发布,签名后补 | 已接受 |
| [0005](0005-harness-closure-pnpm-deploy.md) | 用 pnpm deploy 物化 harness 依赖闭包 | 已接受 |
| [0006](0006-process-supervision-protocol.md) | harness 进程监督协议:就绪行解析、崩溃重启、优雅退出 | 已接受 |
| [0007](0007-cjs-main-bundle.md) | 主进程以 CJS 单文件形式打包(esbuild bundle,electron-updater 内联) | 已接受 |
