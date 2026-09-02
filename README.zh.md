# dsh-desktop

[English](README.md) · [官网](https://dsh-desktop.com)

DeepSeek Harness 的可靠 Electron 桌面壳:官方 WebUI 的桌面封装,下载安装即用,
功能与 `npx @deepseek-ai/dsh web` 完全一致。社区维护,MIT 开源,与 DeepSeek AI 无关联;
DeepSeek Harness 为 DeepSeek 的商标,本仓库仅做 MIT 许可下的再打包。

## 产品定位与范围

`dsh-desktop` 是社区维护的个人项目，定位是**可靠的 Electron 壳 + 开箱即用的支持**。
它只负责把官方 Harness WebUI 稳定地带到桌面：运行时封装、原生窗口与托盘、进程守护、
恢复、诊断、更新和必要的桌面入口；不另做一套 Agent 工作台或聊天产品。

社区插件始终由用户手动安装。安装包不包含社区插件，首次启动也不会自动播种；需要时在
「设置 → 扩展设置 → 插件市场」手动安装 `dsh-market`，再由用户自行选择其他插件。
签名和公证暂不列入当前迭代，待实际使用量和反馈足够后再评估。

**官网**: [dsh-desktop.com](https://dsh-desktop.com) —— 产品介绍与下载(GitHub 与验证过的 GitCode 镜像,按可用性排序展示),以及未签名 macOS 首启、SmartScreen、校验与来源验证等常见问题。官网随 GitHub Releases 自动同步。

## 你得到什么

- **零配置** —— 内置锁定版本的 Node.js 22 运行时与 `@deepseek-ai/dsh` 完整依赖闭包;不用装 Node,无需任何配置。
- **默认独立** —— 自己的数据目录(`~/.dsh-desktop`),设置、会话、API Key、插件与 CLI 互不影响;`DSH_HOME=~/.dsh` 可共享(决策 0012)。
- **可靠守护** —— 崩溃指数退避自动重启、错误页手动重试、托盘实时状态、单实例锁、窗口几何记忆、可导出的诊断报告。Windows 菜单栏隐藏时，仍可通过应用内 `⋮` 入口、窗口右键或系统托盘操作桌面功能；`⋮` 面板还提供打开日志文件夹、导出诊断与当前唤起快捷键。
- **随时唤回桌面应用** —— 窗口收进托盘后，在任意应用中按可自定义的唤起快捷键即可显示并聚焦 dsh-desktop，默认是 `Ctrl/Cmd + Shift + Space`（Windows/Linux 用 Ctrl，macOS 用 ⌘）。若快捷键被其他软件占用，托盘和右键入口仍然可用。
- **按你的桌面习惯工作** —— 在 Harness「设置 → 扩展设置」中录入快捷键，选择是否开机启动、启动后隐藏，以及是否接收本地状态通知；配置保存在壳自己的数据文件中。
- **开箱即用的插件路径** —— 安装包不预装社区插件；需要时从「设置 → 扩展设置 → 插件市场」手动安装。面板会展示准备、下载、验证、重启阶段和实际安装版本；registry、代理、profile 或安装脚本失败时给出可重试的脱敏原因。
- **坏插件也能恢复** —— 安全模式(错误页「以安全模式启动」、`⋮` 面板或扩展设置)下第三方插件被隔离，官方与内置扩展照常运行；导出的诊断报告会列出插件清单并标出疑似肇事者。
- **便携 Agent 预设** —— 「设置 → 扩展设置 → Agent 预设」可把预设导出为单个 `.dshpreset` 文件，在另一台机器上导入时带冲突检查(跳过 / 替换 / 克隆)与信任提示。
- **渲染层收敛** —— 保持沙箱与上下文隔离、关闭 Node 集成、限制导航;摄像头、定位、Web 通知、文件系统权限默认拒绝(决策 0014)。可选桌面通知只使用 Harness 公开状态，不读取屏幕；点击通知即可聚焦回桌面应用。
- **更新策略** —— Windows 原地自动更新;未签名 macOS 检查新版本并打开精确发布页(决策 0010、0016)。

## 下载

各平台安装包(Release 另含 Windows 原地更新所需的 `latest.yml` 与 `.exe.blockmap`):

| 平台 | 安装包 |
|---|---|
| macOS(仅 Apple Silicon,未签名) | `dsh-desktop-<版本>-arm64-mac.dmg` |
| Windows | `dsh-desktop-setup-<版本>.exe`(NSIS) |
| Linux | `dsh-desktop-<版本>-amd64.deb`(Debian/Ubuntu/UOS/Deepin/麒麟) |

从[官网](https://dsh-desktop.com)(按可用性展示 GitHub 与 GitCode 镜像)或
[GitHub Releases](https://github.com/citrusli2026/dsh-desktop/releases)下载。
校验:核对旁侧的 `.sha256`,或 `gh attestation verify <文件> -R citrusli2026/dsh-desktop`
验证来源证明,各平台完整步骤见[官网 FAQ](https://dsh-desktop.com/#faq)。

## 常见问题

- **插件坏了,Harness 起不来怎么办?** 在错误页点「以安全模式启动」(或从 `⋮` 面板 / 扩展设置进入安全模式)。第三方插件会被隔离，官方 bundle 与内置扩展照常运行；导出的诊断报告会列出插件清单并标出疑似肇事者，官方「设置 → 插件」仍可用于卸载它。修复后点击「退出安全模式」即可。
- **插件市场安装失败怎么办?** 扩展设置会区分网络、代理、超时、profile、安装脚本和随包工具故障。展开脱敏技术详情或导出诊断，修复对应环境问题后直接重试；失败的安装不会被标记成已安装。
- **想把 Agent 预设分享给同事或另一台机器?** 「设置 → 扩展设置 → Agent 预设」选中预设后点「导出预设」，得到单个 `.dshpreset` 文件；对方从同一面板「导入预设」。导入会先检查重名(跳过 / 替换 / 克隆)，且只会安装为**用户**预设——绝不会覆盖内置预设。
- **桌面偏好存在哪里?** 在 Electron 用户数据目录下的壳私有 `shell-preferences.json`，与 Harness 的 `settings.yaml` 和 CLI 数据(`DSH_HOME`)完全分开。
- **诊断报告?** 错误页或 `⋮` → 导出诊断，会把仅限本地的报告(最近 harness 输出、插件清单、疑似坏插件、壳/内核版本)写到自选路径。

## 版本号

版本与 tag 为复合式:`<dsh 版本>.shell.<壳修订号>`——如 `0.1.2-alpha.4.shell.0`
表示打包 `@deepseek-ai/dsh` 0.1.2-alpha.4、壳第 0 次修订。版本字段由
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
