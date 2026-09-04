# 架构与验证契约 / Architecture & Verification Contract

> dsh-desktop 是 DeepSeek Harness 的非官方 Electron 桌面壳。
> 本文记录产品架构、源码职责与 CI/Release 验证契约。
> 运维事实（发布流程、镜像操作、版本记录）见根 `HANDOFF.md`。

最后更新: 2026-09-04 · 当前代码基线 `0.1.2-rc.1.shell.1`（待发布）
（主界面提供一次性首次成功引导；桌面设置提供本地优先、只读且脱敏的运行体检；
发布门禁覆盖真实 Harness、插件市场、安全模式和跨版本升级；内核 `0.1.2-rc.1`）

## 1. 产品概述

`dsh-desktop` 自带 Node 22 与完整 `@deepseek-ai/dsh` 依赖闭包，提供原生窗口、
托盘、菜单、单实例、进程监督、更新与本地诊断，不改变 Agent 行为。默认使用
`~/.dsh-desktop`，与 CLI 数据隔离；渲染器保持沙箱、上下文隔离、关闭 Node
集成、限制导航并默认拒绝额外 Web 权限。

产品定位是**可靠的 Electron 壳 + 开箱即用的支持**，而不是新的 Agent 工作台。
壳层只扩展桌面运行所需的能力：安装与运行时封装、窗口/托盘、进程守护、更新提示、
诊断、安全恢复、手动插件入口和必要的桌面连接。Agent、会话、工具、模型与插件核心
行为继续由官方 Harness 负责。

范围约束：社区插件不进入随包闭包，也不在首次启动自动安装；用户必须主动安装。
当前迭代优先完成和打磨已有壳能力及开箱即用流程。Agent 工作台、独立聊天界面、
多 Agent 编排、复杂项目/worktree 工作区、默认远程隧道、Vision/Browser 等不属于
当前产品范围。签名与公证也暂不作为当前发布门禁，待实际使用量和反馈足够后再单独评估。

具体的产品边界与迭代顺序见 `docs/reliable-shell-iteration-plan.md`，正式取舍见 ADR 0030。

## 2. 架构速览

```text
src/main/index.ts           Electron 生命周期、IPC 装配
src/main/window.ts          窗口、状态持久化、导航守卫、hide-on-close
src/main/tray.ts            托盘状态与生命周期入口
src/main/update-prompt.ts   跨平台更新与 macOS check-only 提示
src/main/smoke.ts           CI 冒烟断言与退出约定
src/main/supervisor.ts      Harness 子进程生命周期与退避重启
src/main/kernel-manager.ts  内核 overlay(0026):选择/安装/健康守卫与失败回滚
src/main/desktop-controls.ts  shell-owned Web 插件挂载与降级
src/main/global-shortcut.ts  桌面全局快捷键注册、校验与平台文案
src/main/desktop-preferences.ts  快捷键、启动/通知与首次成功引导状态及原生副作用
src/main/desktop-notifications.ts  公开会话/任务状态归一化、通知与首次成功边沿纯函数
src/main/health-check.ts        本地运行时/目录/loopback/profile 检查与 opt-in 连通性探测
src/main/balance.ts         DeepSeek 余额读数(0025):凭证读取、缓存与托盘行
src/main/lan.ts             局域网 Web 代理与配对二维码
src/main/diagnostics.ts     日志轮转、遮罩、报告格式与导出版
src/main/presets.ts         便携预设包(.dshpreset)导出/导入、冲突与信任检查
src/main/profile.ts         只读用户 Harness profile 清单与已安装插件状态
src/main/market-install.ts  手动市场安装阶段、失败归因、安装后验证与重启结果
src/main/safe-mode.ts       安全模式:用户 bundle 盘点、禁用覆盖层、失败签名检测
src/main/restart-policy.ts  就绪协议、退避与重启预算纯函数
src/main/window-state.ts    窗口几何校验纯函数
src/main/permissions.ts     Electron 会话权限默认拒绝
src/main/menu.ts            应用菜单、About、诊断入口
src/main/pages.ts           有 CSP 的加载页与错误恢复页
src/main/shell-preferences.ts  壳偏好（close-to-tray 与桌面偏好）
src/preload/index.ts        沙箱桥接：错误恢复与已验证 Harness 来源的窄通道
plugins/dsh-desktop-controls/  应用内桌面工具、首次成功引导与桌面设置插件（shell.overlay/settings.section）
```

## 3. 验证契约

每次主分支 CI（ci.yml，ubuntu runner）执行:

0. 依赖安全审计（官方 npm registry）;
1. TypeScript typecheck;
2. 193 个 `node:test` 单测，并执行 80% 行、75% 分支、70% 函数覆盖率门槛;
3. `site:check` 与 `check-api-downloads`（双语键、静态资源与下载接口契约）;
4. 主进程/预加载构建; Harness 闭包与内置 Node bootstrap;
5. 三条 xvfb 冒烟: 正常启动、错误页重试成功、强制重试失败后按钮恢复;
6. 真实 Electron E2E（`run-e2e-guarded.mjs`，12 用例）: 语言同步、托盘单实例、
   设置面板 UI、更新检查、诊断导出、桌面状态通知（基线静默/未聚焦提示/点击
   聚焦/偏好开关）、便携预设导入、窗口几何恢复、真实第二实例、特殊路径、
   只读 DSH_HOME。

tag Release（release.yml: verify → build 三平台并行 → publish）在 CI 之上
另加质量门禁，并强制:

- verify（ubuntu runner）: 上述全部 + mobile-shell Web 产物打包 +
  guarded E2E + tag 等于 `v${package.version}`;
- build，三平台各执行: 打包（dmg / NSIS exe / deb）→ 打包 smoke 链 →
  安装态冒烟 → 8 文件契约写入 → attestation → 产物上传。打包 smoke 链
  （每平台同一套，故障注入与 UI 变体见 `scripts/smoke-packaged.mjs`）:
  1. 基本 smoke（启动 → boot HTML）;
  2. S2.5 真实 Harness 首屏渲染（`--smoke-ui`: boot 覆层消失、无
     "Failed to load plugins"、存在表单控件，失败留截图）;
  3. S1 故障注入 ×2（启动失败 → 错误页重试恢复; 强制重试失败 → 按钮恢复）;
  4. 打包 E2E（`DSH_E2E_PACKAGED=1`，fixture 直接启动 unpacked 二进制、
     真实 Harness 渲染、跳过 stub-only 断言，只跑 `@smoke @critical`
     2 用例）;
  5. 上一公开版本安装包先通过 `.sha256` 校验，再在同一份含中文/空格路径的
     `DSH_HOME` 与 Electron userData 上执行“旧版本安装与启动 → 写入用户设置和
     Safe Mode 插件夹具 → 新版本覆盖安装与启动”；macOS dmg、Windows NSIS、
     Linux deb 都必须逐文件证明用户状态未变化;
  6. 手动插件市场离线 E2E：用独立 profile、registry 和 pnpm store 运行真实
     dsh/pnpm 安装链，断言失败原因可读、技术详情脱敏、按钮可重试且 profile
     不出现伪安装记录;
  7. 安装态冒烟（S2）：ubuntu 经 `apt-get install -y ./dist/<deb>`
     （真实 SUID chrome-sandbox、解析依赖）→ smoke → `dpkg -i` 重装 →
     smoke; windows NSIS `/S` 安装 → smoke → 卸载（同版本覆盖不做
     —— 见 test-hardening-plan A-3 已知边界）; macOS 无安装器，以
     dist 内 .app 直接冒烟;
  8. 8 文件契约：三安装包（dmg/exe/deb）+ 三 `.sha256` + `latest.yml` +
     `.exe.blockmap`; 校验和实算匹配、updater 元数据引用本次 exe，
     多一个少一个都拒绝;
- publish（仅 tag 触发）: tag→commit 解引用门禁（拒绝对齐失败）→
  发布说明门禁（`docs/release-notes/v<tag>.md` 缺失或留占位符即失败，
  正文即 GitHub Release 内容）→ 资产下载 → 8 文件契约校验 → 每安装包
  attestation 验证 → release 创建/上传。

测试硬化的规划、成本护栏与已知边界（NSIS 覆盖安装挂死、macOS dmg
安装路径无自动化等）见 `docs/test-hardening-plan.md`; 2026-08-23
shell.2 首次全量执行全绿，十余次波折与修复记录见 HANDOFF 二十节。
