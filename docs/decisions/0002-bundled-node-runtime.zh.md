# 0002:harness 运行在随壳内置的独立 Node 上

- 日期:2026-02-09
- 状态:已接受

## 背景

Electron 自带一个 Node,但 harness 需要真正的 Node 运行时
(上游 engines: `^22.19.0 || >=24.0.0`)。harness 闭包含原生模块:
`node-pty`(NAN 绑定,按 Node ABI 编译)、`koffi`(纯 FFI,ABI 稳定)、
`sharp`(N-API,ABI 稳定)、`node-addon-require-builtin`(平台预编译 addon)、
Linux 上的 `@deepseek-ai/node-addon-landlock-run`。

两种候选:

- A. 随壳内置官方 Node 22 LTS 二进制,harness 作为独立子进程运行;
- B. 用 Electron 自带 Node(`ELECTRON_RUN_AS_NODE=1`)运行 harness。

## 决策

选择 **A:内置独立 Node 22 LTS(≥ 22.19)**:

- 与上游官方支持的运行方式完全一致,不在上游测试矩阵之外引入新组合;
- 原生模块按普通 Node ABI 安装即可,零 `@electron/rebuild`;
- Electron 升级与 harness 运行时彻底解耦;
- 代价:安装包多约 30MB(压缩后)。

Node 二进制由 `scripts/fetch-node.mjs` 从 nodejs.org 官方发行包下载,
校验 SHASUMS256.txt 后解压到 `resources/harness/node/`,版本自动选"最新 22.x LTS"
并记录到清单文件,构建可复现。

## 后果

- 正面:一致性、零重编译、升级隔离;
- 负面:双运行时(Electron + Node)体积;每个平台要各下一份 Node;
  需要在 CI 里保证下载源可达并校验哈希(已内置 SHA256 校验)。

## 备选方案

- B(`ELECTRON_RUN_AS_NODE`):Electron ≥ 40 内置 Node 24,恰好满足 engines;
  省体积,但 node-pty / require-builtin / landlock 需要 `@electron/rebuild`,
  且每个 Electron 大版本都要重验 ABI 矩阵——作为后续瘦身备选,当前否决;
- 把 harness 直接嵌进 Electron 主进程:ESM loader、原生 ABI、进程所有权
  信号处理都与上游运行方式不同,风险最大,否决。
