# dsh-desktop

[English](README.md) · [官网](https://dsh-desktop.com)

> 命名规则:应用与安装包叫 `dsh-desktop`;GitHub 仓库沿用原名 `dsh-electron-shell`。

DeepSeek Harness 的可靠桌面工作台:官方 WebUI 的桌面封装,下载安装即用,
功能与 `npx @deepseek-ai/dsh web` 完全一致。社区维护,MIT 开源,与 DeepSeek AI 无关联;
DeepSeek Harness 为 DeepSeek 的商标,本仓库仅做 MIT 许可下的再打包。

**官网**: [dsh-desktop.com](https://dsh-desktop.com) —— 产品介绍与下载(GitHub 与验证过的 GitCode 镜像,按可用性排序展示),以及未签名 macOS 首启、SmartScreen、校验与来源验证等常见问题。官网随 GitHub Releases 自动同步。

## 你得到什么

- **零配置** —— 内置锁定版本的 Node.js 22 运行时与 `@deepseek-ai/dsh` 完整依赖闭包;不用装 Node,无需任何配置。
- **默认独立** —— 自己的数据目录(`~/.dsh-desktop`),设置、会话、API Key、插件与 CLI 互不影响;`DSH_HOME=~/.dsh` 可共享(决策 0012)。
- **可靠守护** —— 崩溃指数退避自动重启、错误页手动重试、托盘实时状态、单实例锁、窗口几何记忆、可导出的诊断报告。Windows 菜单栏隐藏时，仍可通过应用内 `⋮` 入口、窗口右键或系统托盘操作桌面功能。
- **渲染层收敛** —— 保持沙箱与上下文隔离、关闭 Node 集成、限制导航;摄像头、定位、通知、文件系统权限默认拒绝(决策 0014)。
- **更新策略** —— Windows 原地自动更新;未签名 macOS 检查新版本并打开精确发布页(决策 0010、0016)。

## 下载

各平台安装包(Release 另含 Windows 原地更新所需的 `latest.yml` 与 `.exe.blockmap`):

| 平台 | 安装包 |
|---|---|
| macOS(仅 Apple Silicon,未签名) | `dsh-desktop-<版本>-arm64-mac.dmg` |
| Windows | `dsh-desktop-setup-<版本>.exe`(NSIS) |
| Linux | `dsh-desktop-<版本>-amd64.deb`(Debian/Ubuntu/UOS/Deepin/麒麟) |

从[官网](https://dsh-desktop.com)(按可用性展示 GitHub 与 GitCode 镜像)或
[GitHub Releases](https://github.com/citrusli2026/dsh-electron-shell/releases)下载。
校验:核对旁侧的 `.sha256`,或 `gh attestation verify <文件> -R citrusli2026/dsh-electron-shell`
验证来源证明,各平台完整步骤见[官网 FAQ](https://dsh-desktop.com/#faq)。

## 版本号

版本与 tag 为复合式:`<dsh 版本>.shell.<壳修订号>`——如 `0.1.1-rc.2.shell.4`
表示打包 `@deepseek-ai/dsh` 0.1.1-rc.2、壳第 4 次修订。版本字段由
`scripts/version.mjs` 统一管理;`dsh-watch` 工作流每日检查上游 npm,
发现新版自动开经验证的 bump PR(决策 0009)。

## 开发

要求:Node `^22.19.0 || >=24.0.0`,pnpm 11。

```sh
pnpm install         # 依赖 + Electron 二进制
pnpm run bootstrap   # 物化 harness 闭包 + 内置 Node 22 LTS
pnpm run dev         # 本机运行
pnpm run smoke       # 冒烟:harness 就绪 → 窗口加载 → 校验页面 → 退出
pnpm run verify      # typecheck + 单测与覆盖率 + site check + 构建
pnpm run dist        # 打当前平台安装包(产物在 dist/)
```

- **局域网 Web 连接**:「扩展 → 通过局域网连接手机 / 平板」启动独立
  mobile-shell Web 代理并显示一次性配对码。壳只消费另一仓库的 Web 产物
  (`dsh-mobile-shell`,不可变 tag `v1.0.0`);`DSH_LAN_IP` 可指定多网卡时的地址。
- 内置 Node 在 `manifest/node-runtime.json` 里 pin 死版本与各平台 SHA-256,
  bootstrap 从仓库提交值复现。

## 目录结构

```
src/main/        Electron 主进程:监督、窗口、占位/错误页、托盘
src/preload/     沙箱桥接(错误页的"重试启动")
scripts/         fetch-node / deploy-harness / install-electron / build / gen-icons
manifest/        @deepseek-ai/dsh 及其闭包的依赖 pin
docs/decisions/  ADR 风格的决策记录
```

## 文档

- [文档索引与治理](docs/README.md) · [决策记录](docs/decisions/README.md)
- [CONTEXT.md](CONTEXT.md) —— 领域词汇表(给 agent 对齐)· [HANDOFF.md](HANDOFF.md) —— 发布记录与运维历史

## License

[MIT](LICENSE)。内置的 DeepSeek Harness 运行时来自
[@deepseek-ai/dsh](https://www.npmjs.com/package/@deepseek-ai/dsh)(MIT)。
