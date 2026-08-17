# 交接文档 / Handoff — dsh-desktop

> English abstract: dsh-desktop is the unofficial Electron desktop shell for
> DeepSeek Harness. This file records the shipped product state, verification
> contract, and next iteration boundary. Website and mirror operations live in
> the root `HANDOFF.md`; historical release records live in `docs/HANDOFF-archive.md`.

最后更新:2026-08-17 · 当前代码基线 `0.1.0-rc.6.shell.15` · 最新已发布 `0.1.0-rc.6.shell.15`

## 1. 当前结果

`dsh-desktop` 自带 Node 22 与完整 `@deepseek-ai/dsh` 依赖闭包，提供原生窗口、
托盘、菜单、单实例、进程监督、更新与本地诊断，不改变 Agent 行为。默认使用
`~/.dsh-desktop`，与 CLI 数据隔离；渲染器保持沙箱、上下文隔离、关闭 Node
集成、限制导航并默认拒绝额外 Web 权限。

## 2. 架构速览

```text
src/main/index.ts           Electron 生命周期与模块装配
src/main/window.ts          窗口、状态持久化、导航守卫、hide-on-close
src/main/tray.ts            托盘状态与生命周期入口
src/main/update-prompt.ts   跨平台更新与 macOS check-only 提示
src/main/smoke.ts           CI 冒烟断言与退出约定
src/main/supervisor.ts      Harness 子进程生命周期与退避重启
src/main/lan.ts             局域网 Web 代理与配对二维码
src/main/diagnostics.ts     日志轮转、遮罩、报告格式与导出
src/main/restart-policy.ts  就绪协议、退避与重启预算纯函数
src/main/window-state.ts    窗口几何校验纯函数
src/main/permissions.ts     Electron 会话权限默认拒绝
src/main/menu.ts            应用菜单、About、诊断入口
src/main/pages.ts           有 CSP 的加载页与错误恢复页
src/preload/index.ts        仅暴露 retry 与诊断导出两项窄桥
```

## 3. 当前验证契约

每次主分支 CI 执行:

0. 依赖安全审计（官方 npm registry）;
1. TypeScript typecheck;
2. 67 个 `node:test` 单测，并执行 80% 行、75% 分支、70% 函数覆盖率门槛;
3. `site:check`(双端 release 数据、双语键与静态资源);
4. 主进程/预加载构建;
5. Harness 闭包与内置 Node bootstrap;
6. 三条 xvfb 冒烟:正常启动、错误页重试成功、强制重试失败后按钮恢复;
7. 真实 Electron E2E:无标题栏拖拽区、语言同步、沙箱、close-to-tray 与
   第二实例恢复。

tag Release 在上述基础上再执行质量门禁，并强制:

- tag 等于 `v${package.version}`;
- macOS / Windows 从 unpacked 产物启动内置 Harness 并通过 smoke;
- 只有 Apple Silicon DMG 与 Windows x64 EXE 两个大体积安装包;
- 两个安装包的 SHA-256 实算匹配，且 Windows `latest.yml` 与 `.exe.blockmap`
  齐全并引用本次 EXE;严格拒绝其余 Release 文件。

## 4. 已发布版本摘要

> 完整发布记录见 `docs/HANDOFF-archive.md`（shell.10–14 详情）和根 `HANDOFF.md`（shell.14–15 运维记录）。

### shell.15（已发布 2026-08-17）

1. `redactDiagnosticsLog` 边界测试加固：补 2 项边界测试（base64 padding、
   JWT 形状、OpenAI key 尾部字符）锁定行为。
2. LAN 端到端测试：新增 2 项 E2E（stub proxy 覆盖 start/restart/stop 全流程 +
   外域 pairing URL 拒绝）。`LanServiceOptions` 加 `lanAddress?: () => string`
   测试钩子。
3. GitCode 镜像发布 checklist：HANDOFF 加显式发布后 5 步 checklist。

本地门禁全绿：typecheck、67 项单测、覆盖率（lines 84.61% / branches 79.45% /
functions 78.74%）、`site:check`、`build`。无新 ADR。

- CI run `31992896301`；Release run `31994766855`；
- tag `v0.1.0-rc.6.shell.15` 指向 `e7792dace377d57f8624e301b2fdcb9bde385d39`；
- Site Data Refresh run `31995175898`，提交 `1346abb`。

## 5. 已知限制

- 公开 macOS Release 仍未完成分发签名/公证，只能检查更新并引导下载；本机审核包
  的 Apple Development 签名不等价于 Developer ID 分发签名或 notarization;
- 诊断遮罩为尽力而为，界面已要求用户分享前自行检查;
- GitCode 发行版资产为人工镜像渠道：跨境自动推送/拉取方案均已否决（0008
  第二修订），发版后由维护者从国内网络手动上传 dmg/exe 与校验文件并触发
  Site Data Refresh;
- 资产校验 CLI 已独立化为 `bin/dsh-validate-release.mjs`，在 `package.json` 注册
  `dsh-validate-release` bin，支持用户自助校验下载完整性。
