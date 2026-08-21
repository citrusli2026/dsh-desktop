# 架构与验证契约 / Architecture & Verification Contract

> dsh-desktop 是 DeepSeek Harness 的非官方 Electron 桌面壳。
> 本文记录产品架构、源码职责与 CI/Release 验证契约。
> 运维事实（发布流程、镜像操作、版本记录）见根 `HANDOFF.md`。

最后更新: 2026-08-21 · 当前代码基线 `0.1.1-rc.1.shell.0`（未发布）

## 1. 产品概述

`dsh-desktop` 自带 Node 22 与完整 `@deepseek-ai/dsh` 依赖闭包，提供原生窗口、
托盘、菜单、单实例、进程监督、更新与本地诊断，不改变 Agent 行为。默认使用
`~/.dsh-desktop`，与 CLI 数据隔离；渲染器保持沙箱、上下文隔离、关闭 Node
集成、限制导航并默认拒绝额外 Web 权限。

## 2. 架构速览

```text
src/main/index.ts           Electron 生命周期、IPC 装配
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
src/main/shell-preferences.ts  壳偏好（close-to-tray 说明）
src/preload/index.ts        沙箱桥接：仅对 shell 自有页面开放窄通道
```

## 3. 验证契约

每次主分支 CI 执行:

0. 依赖安全审计（官方 npm registry）;
1. TypeScript typecheck;
2. 67 个 `node:test` 单测，并执行 80% 行、75% 分支、70% 函数覆盖率门槛;
3. `site:check`（双端 release 数据、双语键与静态资源）;
4. 主进程/预加载构建;
5. Harness 闭包与内置 Node bootstrap;
6. 三条 xvfb 冒烟: 正常启动、错误页重试成功、强制重试失败后按钮恢复;
7. 真实 Electron E2E: 无标题栏拖拽区、语言同步、沙箱、close-to-tray、
   第二实例恢复。

tag Release 在上述基础上再执行质量门禁，并强制:

- tag 等于 `v${package.version}`;
- macOS / Windows 从 unpacked 产物启动内置 Harness 并通过 smoke;
- 只有 Apple Silicon DMG 与 Windows x64 EXE 两个大体积安装包;
- 两个安装包的 SHA-256 实算匹配，且 Windows `latest.yml` 与 `.exe.blockmap`
  齐全并引用本次 EXE; 严格拒绝其余 Release 文件。
