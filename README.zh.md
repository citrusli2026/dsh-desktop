# dsh-desktop

[English](README.md)

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)(`dsh`)的 Electron 桌面壳:下载安装即用,功能与
`npx @deepseek-ai/dsh web` 完全一致——壳只提供窗口、进程监督、托盘与自动更新,
不改变任何 agent 功能。壳本身 MIT 开源。

## 特性

- **开箱即用**:内置独立 Node 运行时与 `@deepseek-ai/dsh` 完整依赖闭包,
  无需预装 Node.js;
- **与 CLI 互通**:默认共享 `~/.dsh`,会话、设置、API key 与命令行版延续;
- **健壮性**:harness 崩溃指数退避自动重启、错误页可手动重试、单实例锁、
  系统托盘、日志落盘;
- **更新**:Windows / Linux 应用内自动更新;macOS 待签名后启用(决策记录 0004)。

## 下载

在 [GitHub Releases](https://github.com/citrusli2026/dsh-desktop/releases) 下载对应平台的安装包:

| 平台 | 安装包 |
|---|---|
| macOS(仅 Apple Silicon,未签名) | `dsh-desktop-<版本>-arm64-mac.dmg` 或 `-arm64-mac.zip` |
| Windows | `dsh-desktop-setup-<版本>.exe`(NSIS,可选择安装目录) |
| Linux | `dsh-desktop-<版本>-x86_64.AppImage`(免安装)或 `dsh-desktop-<版本>-amd64.deb` |

- macOS:首次打开请右键 → 打开(未签名,决策记录 0004);
- Windows SmartScreen:点「更多信息」→「仍要运行」(未签名)。

### GitHub 慢或打不开?下载加速

如果 github.com 在你的网络下很慢或不可达,可以在下载地址前加社区加速前缀。
例如原地址为
`https://github.com/citrusli2026/dsh-desktop/releases/download/vX.Y.Z/<文件>`:

```
https://ghproxy.net/https://github.com/citrusli2026/dsh-desktop/releases/download/vX.Y.Z/<文件>
```

其他可选前缀(随社区维护情况增减):`https://gh-proxy.com/`、`https://ghfast.top/`。
这些镜像由社区免费运营、与本项目无关,可用性会波动——一个失效就换下一个。

仓库维护者也可以在 release 流水线中启用可选的 **Cloudflare R2 镜像**同步
(任务 `mirror-r2`,由仓库 secrets `R2_ACCOUNT_ID` / `R2_API_TOKEN` 开关),
把每个版本的资产自动镜像到稳定的 R2 地址。

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
src/main/            Electron 主进程:进程监督、窗口、占位/错误页、托盘
src/preload/         沙箱桥接(错误页的"重试启动"按钮)
scripts/             fetch-node / deploy-harness / install-electron / build / gen-icons
manifest/harness/    纯依赖 manifest:精确 pin @deepseek-ai/dsh 及其闭包
resources/harness/   bootstrap 产物(gitignore,不入库)
docs/decisions/      决策记录:架构选择与实现过程
```

## 文档

- [决策记录](docs/decisions/README.md):为什么这么设计(内置 Node、共享 ~/.dsh、
  unsigned 先发、闭包部署、监督协议、CJS 主进程打包等);
- 架构与实现细节见各决策记录中的背景与备选方案说明。

## License

[MIT](LICENSE)。内置的 DeepSeek Harness 运行时来自
[@deepseek-ai/dsh](https://www.npmjs.com/package/@deepseek-ai/dsh)(MIT)。
