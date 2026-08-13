# dsh-desktop

DeepSeek Harness(`dsh`)的 Electron 桌面壳:下载安装即用,功能与
`npx @deepseek-ai/dsh web` 完全一致——壳只提供窗口、进程监督与自动更新,
不改变任何 agent 功能。壳本身 MIT 开源。

## 特性

- **开箱即用**:内置独立 Node 运行时与 `@deepseek-ai/dsh` 完整依赖闭包,
  无需预装 Node.js;
- **与 CLI 互通**:默认共享 `~/.dsh`,会话、设置、API key 与命令行版延续;
- **健壮性**:harness 崩溃指数退避自动重启、单实例锁、日志落盘;
- **更新**:Windows / Linux 自动更新;macOS 待签名后启用(见决策记录 0004)。

## 下载

在 [GitHub Releases](https://github.com/citrusli2026/dsh-desktop/releases) 下载对应平台的安装包:

- macOS:`dsh-desktop-0.1.0-pre.0-arm64-mac.zip` 或 `-arm64.dmg`(**当前仅 Apple Silicon**;未签名,首次打开请右键 → 打开);
- Windows:`dsh-desktop-setup-0.1.0-pre.0.exe`(NSIS,可选择安装目录);
- Linux:`dsh-desktop-0.1.0-pre.0-x64.AppImage`(免安装)或 `dsh-desktop_0.1.0-pre.0_amd64.deb`。

Windows / Linux 支持应用内自动更新;macOS 待签名后启用(见决策记录 0004)。

## 开发

要求:Node `^22.19.0 || >=24.0.0`,pnpm 11。

```sh
pnpm install         # 安装依赖并下载 Electron(默认走 npmmirror 国内镜像)
pnpm run bootstrap   # 物化 harness 依赖闭包 + 下载内置 Node 22 LTS
pnpm run dev         # 本机运行
pnpm run smoke       # 冒烟:harness 就绪 → 窗口加载 → 校验页面 → 退出
pnpm run dist        # 打当前平台的安装包(产物在 dist/)
```

慢网络/海外环境:仓库默认使用国内镜像(npmmirror)加速下载,可用环境变量覆盖:

- `NPM_CONFIG_REGISTRY` — npm 包源
- `ELECTRON_MIRROR` — Electron 二进制
- `ELECTRON_BUILDER_BINARIES_MIRROR` — electron-builder 辅助二进制
- `NODE_DIST_MIRROR` — 内置 Node 发行包(官方源为 `https://nodejs.org/dist`)

## 目录结构

```
src/main/            Electron 主进程:进程监督、窗口、占位/错误页
scripts/             fetch-node / deploy-harness / install-electron
manifest/harness/    纯依赖 manifest:精确 pin @deepseek-ai/dsh 及其闭包
resources/harness/   bootstrap 产物(gitignore,不入库)
docs/decisions/      决策记录:架构选择与实现过程
```

## 文档

- [决策记录](docs/decisions/README.md):为什么这么设计(内置 Node、共享 ~/.dsh、unsigned 先发等);
- 架构与实现细节见各决策记录中的背景与备选方案说明。

## License

[MIT](LICENSE)。内置的 DeepSeek Harness 运行时来自
[@deepseek-ai/dsh](https://www.npmjs.com/package/@deepseek-ai/dsh)(MIT)。
