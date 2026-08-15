# dsh-electron-shell

[English](README.md)

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)(`dsh`)的 Electron 桌面壳:下载安装即用,功能与
`npx @deepseek-ai/dsh web` 完全一致——壳只提供窗口、进程监督、托盘与自动更新,
不改变任何 agent 功能。壳本身 MIT 开源。

> 非官方社区打包,与 DeepSeek AI 无关联;DeepSeek Harness 为 DeepSeek 的商标,本仓库仅做 MIT 许可下的再打包。
> Unofficial community packaging, not affiliated with DeepSeek AI. DeepSeek Harness is a trademark of DeepSeek; this repo only repackages it under MIT.

**官网**: <https://dsh-desktop.com> —— 介绍与下载,数据随 GitHub Releases 自动同步(`site/` + `site-refresh` 工作流)。

## 特性

- **开箱即用**:内置独立 Node 运行时与 `@deepseek-ai/dsh` 完整依赖闭包,
  无需预装 Node.js;
- **环境独立**:桌面版默认使用自己的数据目录(`~/.dsh-desktop`),设置、会话、
  API key、插件与命令行互不影响;如需与 CLI 共享,设 `DSH_HOME=~/.dsh` 即可
  (决策记录 0012);
- **健壮性**:harness 崩溃指数退避自动重启、错误页可手动重试、单实例锁、
  系统托盘(实时状态、重启、日志目录、检查更新)、窗口几何记忆、日志落盘;
- **更新**:Windows / Linux 应用内自动更新;macOS 在签名前检查新版本并
  引导至下载页(决策记录 0004、0010)。

## 版本号

版本号与 tag 为复合式:`<dsh 版本>.shell.<壳修订号>`——如 `0.1.0-rc.6.shell.3`
表示打包 `@deepseek-ai/dsh` 0.1.0-rc.6、壳第 3 次修订。版本字段由
`scripts/version.mjs` 统一管理(`show` / `check` / `bump`);`dsh-watch`
工作流每日检查上游 npm,发现新版自动开经验证的 bump PR(决策记录 0009)。

## 下载

在 [GitHub Releases](https://github.com/citrusli2026/dsh-electron-shell/releases) 下载对应平台的安装包:

| 平台 | 安装包 |
|---|---|
| macOS(仅 Apple Silicon,未签名) | `dsh-electron-shell-<版本>-arm64-mac.dmg` 或 `-arm64-mac.zip` |
| Windows | `dsh-electron-shell-setup-<版本>.exe`(NSIS,可选择安装目录) |
| Linux | `dsh-electron-shell-<版本>-x86_64.AppImage`(免安装)或 `dsh-electron-shell-<版本>-amd64.deb` |

- macOS:首次打开请右键 → 打开(未签名,决策记录 0004);
- Windows SmartScreen:点「更多信息」→「仍要运行」(未签名)。

### GitHub 慢或打不开?下载加速

如果 github.com 在你的网络下很慢或不可达,可以在下载地址前加社区加速前缀。
例如原地址为
`https://github.com/citrusli2026/dsh-electron-shell/releases/download/vX.Y.Z/<文件>`:

```
https://ghproxy.net/https://github.com/citrusli2026/dsh-electron-shell/releases/download/vX.Y.Z/<文件>
```

其他可选前缀(随社区维护情况增减):`https://gh-proxy.com/`、`https://ghfast.top/`。
这些镜像由社区免费运营、与本项目无关,可用性会波动——一个失效就换下一个。

仓库维护者可启用两个镜像渠道,均为 release 流水线中的可选任务,未配置时静默跳过:

- **Cloudflare R2**(任务 `mirror-r2`):S3 兼容对象存储,出口流量永久免费
  (10GB 免费额度)。建名为 `dsh-electron-shell` 的桶 + 具备对象读写权限的
  API token,然后设置仓库变量 `R2_ACCOUNT_ID` 与 secret `R2_API_TOKEN`;
  此后每个 release 自动镜像到 `dsh-electron-shell/<tag>/`,桶上绑自定义域名
  (或 r2.dev 开发域名)即得固定下载链接。补传已发布版本:
  `gh release download <tag>` 下载资产后逐文件
  `wrangler r2 object put "dsh-electron-shell/<tag>/<文件>" --file <文件>`。
- **GitCode**(任务 `mirror-gitcode`,2026-08-15 已联调验证):附件由国内华为云
  CDN 节点分发。在 gitcode.com 建镜像仓库、签发 personal access token,设置
  仓库变量 `GITCODE_REPO`(`owner/repo`)与 secret `GITCODE_TOKEN` 即可。
  稳定附件链接形如
  `https://gitcode.com/<owner>/<repo>/releases/download/<tag>/<文件>`;
  其背后的 `file-cdn.gitcode.com` 直链是签名时效 URL,不要直接对外引用。

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

内置 Node 本身是 pin 死的:版本与各平台 SHA-256 记录在 `manifest/node-runtime.json`,bootstrap 可复现,镜像只能交付与仓库提交哈希一致的字节。维护者用 `node scripts/fetch-node.mjs --update-pin` 升级 pin(从官方 nodejs.org 解析最新 22.x LTS)。

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

- [决策记录](docs/decisions/README.md):为什么这么设计(内置 Node、独立
  ~/.dsh-desktop 数据目录、unsigned 先发、闭包部署、监督协议、CJS 主进程打包等);
- 架构与实现细节见各决策记录中的背景与备选方案说明。

## License

[MIT](LICENSE)。内置的 DeepSeek Harness 运行时来自
[@deepseek-ai/dsh](https://www.npmjs.com/package/@deepseek-ai/dsh)(MIT)。
