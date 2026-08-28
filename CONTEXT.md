# CONTEXT — dsh-desktop 领域词汇与入口

单上下文速查:本文件用最短篇幅给出项目公认词汇;深层事实以箭头指向的文档为准。
产品名 `dsh-desktop`,GitHub 仓库名保持 `dsh-electron-shell`(决策 0013)。

## 这是什么

DeepSeek Harness(`@deepseek-ai/dsh`,简称 **dsh**)的非官方 Electron 桌面壳:
提供原生窗口、托盘、菜单、单实例、进程监督、更新与本地诊断;不改变 Agent 行为。
功能上等价于 `npx @deepseek-ai/dsh web`,但零配置(自带 Node 与依赖闭包)。

## 术语

| 词 | 含义 |
|---|---|
| **harness** | 被壳托管的 DeepSeek Harness 运行时;闭包 = 内置 Node 22(`resources/harness/node`)+ `@deepseek-ai/dsh` 及依赖(`resources/harness/node_modules`),由 `pnpm run bootstrap`(deploy-harness + fetch-node)物化 |
| **shell / 壳修订** | 壳自身的修订;版本为复合式 `<dsh 版本>.shell.<壳修订>`,如 `0.1.1-rc.2.shell.2`(决策 0009) |
| **DSH_HOME / settings.yaml** | 壳与 harness 的私有数据根(默认 `~/.dsh-desktop`,决策 0012);`settings.yaml` 是 Harness 偏好(locale/theme),变更经 fs.watch + 2 秒轮询兜底生效;桌面快捷键、开机启动与通知开关保存在应用 userData 下的 `shell-preferences.json`;`DSH_HOME=~/.dsh` 可回退为与 CLI 共享 |
| **composite version** | `version.mjs`(show/check/bump shell/bump dsh/set)统一管理版本字段;tag `v<版本>` |
| **smoke 协议** | `src/main/smoke-protocol.ts` 集中定义旗标/退出码/注入 env:`--smoke-test`、`--smoke-ui`、`DSH_DESKTOP_TEST_FAIL_HARNESS`、`DSH_DESKTOP_TEST_RETRY_FAIL`、`DSH_DESKTOP_DEV_WEB_URL`;`quitGracefully` 在 will-quit 强制 `app.exit(code)`(Windows 上 app.quit 会丢退出码) |
| **S1 / S2 / S2.5 / A组** | 发布门禁层级,规划与边界见 `docs/test-hardening-plan.md`:S1=打包 E2E+故障注入;S2=安装态冒烟(deb/NSIS,含重装),macOS 无安装器故无 S2;S2.5=真实 Harness 首屏渲染(`--smoke-ui`);A组=设置面板/更新检查/诊断导出/几何恢复/真第二实例/特殊路径 |
| **guarded runner** | `scripts/run-e2e-guarded.mjs`:按 Playwright 摘要行("N passed")判决,再杀进程树——绕开 Playwright 1.62.1+Electron 的 worker teardown 挂起(根因未除,见 HANDOFF 二十节) |
| **8 文件契约** | 每个 Release 严格:3 安装包(dmg/exe/deb)+ 3 `.sha256` + `latest.yml` + `.exe.blockmap`;校验器拒绝缺失或多余(决策 0016/0017) |
| **deb 唯一 Linux 格式** | Debian/Ubuntu/UOS/Deepin/麒麟;依赖由用户侧 apt 解析(CI 实测:裸 runner 缺 libnotify4/libsecret,必须 `apt-get install -y ./<deb>`)(决策 0017) |
| **GitCode 镜像** | `scripts/mirror-gitcode.mjs` 全自动:probe→下载→上传→校验;`GH_SOCKS5=127.0.0.1:7890` 是本机已验证最快下载路径(~1MB/s,公开代理约 0.2MB/s 且大文件易断);幂等可重跑 |
| **全局唤起快捷键** | 发布版默认注册 `Ctrl/Cmd+Shift+Space`，可在 Harness「设置 → 通用」录入包含修饰键的新组合;只显示并聚焦窗口，冲突时不阻断启动，托盘/右键/菜单继续可用（决策 0018/0019） |
| **桌面偏好** | shell-owned 的快捷键、Windows/macOS 开机启动、启动后隐藏与本地通知开关;不写入 Harness `settings.yaml`,设置面板由 `dsh-desktop-controls` 插件提供（决策 0019） |
| **桌面状态通知** | 主进程只接收插件从 Harness `useSessions` 暴露的会话/后台任务状态边沿，在窗口未聚焦时用 Electron 原生通知提示完成、失败或待确认;不读屏、不做视觉识别、不上传（决策 0019） |
| **站点数据** | `site/data/release.json` 由 `scripts/gen-site-data.mjs` 生成,`site-refresh` bot 在 Release 后自动同步;`dsh-desktop.com` 是 GitHub Pages/Vercel 部署(发布入口见 README) |
| **安全模式 (safe mode)** | 壳拥有的启动形态:仅官方 bundles + 壳控件,禁用 profile 中全部用户插件条目;禁用靠 `--patch` overlay `{id, disabled: true}`(与官方 telemetry 开关同构),绝不改动用户插件文件;双触发(启动失败/手动),标志持久于 shell-preferences.json,退出需显式动作(决策 0021) |
| **恢复中心** | 错误恢复页四动作:重试 / 以安全模式启动(已在安全模式时为退出)/ 导出诊断 / 打开日志文件夹 |
| **.dshpreset** | 便携 Agent 预设包(JSON,`dsh-preset/v1`):导出某用户预设(`$DSH_HOME/.agent-presets/<id>/agent.cordis.yml + preset.yml`),导入带冲突检测(跳过/替换/克隆)与信任警告;写回用户预设根即被官方预设选择器挂载(决策 0021) |

## 快问快答

- 本地一跑:`pnpm install && pnpm run bootstrap && pnpm run dev`
- 一键门禁:`pnpm run verify`(typecheck+134 单测+覆盖率+site check+build);
  `pnpm run verify:full` 再加 dev E2E + dist:dir + 打包 smoke 全家桶
- 发布流程:看 `.agents/skills/release-dsh-desktop/SKILL.md`(runbook)与 `HANDOFF.md`(历史)
- 为什么这样设计:看 `docs/decisions/`(ADR 索引),别改历史 ADR,新结论写新 ADR
- 架构与验证契约:`docs/ARCHITECTURE.md`;领域深层文档:根 `AGENTS.md`(agent 指引)、`docs/README.md`(索引与治理)
