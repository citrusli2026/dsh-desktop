# 交接文档 / Handoff — dsh-desktop

> English abstract: dsh-desktop is the unofficial Electron desktop shell for
> DeepSeek Harness. This file records the shipped product state, verification
> contract, and next iteration boundary. Website and mirror operations live in
> the root `HANDOFF.md`.

最后更新:2026-08-15 · 已发布版本 `0.1.0-rc.6.shell.8`

## 1. 当前结果

`dsh-desktop` 自带 Node 22 运行时与完整 `@deepseek-ai/dsh` 依赖闭包,提供
窗口、进程监督、托盘、菜单和更新能力,不改变 agent 行为。应用与安装包使用
`dsh-desktop` 名称;GitHub/GitCode 仓库 URL、appId 与历史基础设施继续使用
`dsh-electron-shell`(ADR 0013)。

本轮 shell.8 已完成并发布:

- 修复 macOS 更新检查:不再调用会排除 prerelease 的 `/releases/latest`,改为
  读取 release 列表、过滤草稿并选择最高可解析版本;全 prerelease 仓库不再 404。
- 收紧渲染层权限:Electron 权限检查与请求默认拒绝,未来能力必须显式加白名单
  (ADR 0014)。
- 官网增加安全边界说明和 FAQ,下载数据同步到 shell.8,镜像不可用自动回落。
- CI 新增官网完整性检查;核心 Release、官网刷新、第三方镜像解耦。

## 2. 架构速览

```text
src/main/index.ts           主进程装配、窗口/托盘/IPC/更新/生命周期
src/main/supervisor.ts      Harness 子进程生命周期与退避重启
src/main/restart-policy.ts  就绪协议、退避与重启预算纯函数
src/main/window-state.ts    窗口几何校验纯函数
src/main/update-check.ts    复合版本比较 + release 列表选择
src/main/permissions.ts     Electron 会话权限默认拒绝
src/main/dsh-home.ts        独立 DSH_HOME 解析
src/main/menu.ts            应用菜单与 About
src/main/pages.ts           加载页与错误页
src/main/paths.ts           开发态/打包态资源路径
src/preload/index.ts        唯一桥:harness:retry
```

## 3. 当前验证契约

每次主分支 CI 执行:

1. typecheck;
2. 26 个 `node:test` 单测;
3. `site:check`(release 数据、三平台资产、双语键、静态资源、tab 目标);
4. 主进程/预加载构建;
5. Harness 闭包与内置 Node bootstrap;
6. 三条 xvfb 冒烟:正常启动、错误页重试成功、强制重试失败后按钮恢复。

本轮发布前本地也执行了同样的三条冒烟链路。Release run
`31868875099` 三平台构建和 11 个资产发布成功。

## 4. 发布与数据流

```text
main push → CI + Vercel
tag push  → Release(构建 + GitHub Release)
             ├─ Site Data Refresh → main 的 release.json → Vercel
             └─ Release Mirrors → R2/GitCode(可失败、不中断主发布)
```

版本只通过 `node scripts/version.mjs` 修改。下次发版先 bump,推 main 等 CI
全绿,再创建 tag。GitCode 当前不能保证自动同步代码,还需显式快进其 `main`
并推送同名 tag;镜像资产失败不影响 GitHub 主渠道。

## 5. 下一轮:纯重构 + 测试补强

下一轮应保持**不改变外部行为、不发版**的边界,独立 PR 完成:

1. 把 `index.ts` 按职责拆为 `window.ts`、`tray.ts`、`update-prompt.ts`、
   `smoke.ts`,让入口只保留装配与生命周期编排;
2. 对 `HarnessSupervisor` 做默认行为等价的构造注入(command / args /
   logDir / env / readyTimeoutMs),用临时 fixture 子进程补齐核心生命周期测试;
3. 增加 `paths` 与 `menu` 中纯逻辑测试;
4. 保持 IPC 名、三个 smoke 环境变量、退出码、before-quit 顺序、单实例和
   hide-on-close 行为不变;
5. typecheck、全量单测、build 与三条 smoke 全绿后再合并,不打新 tag。

这轮完成后再考虑产品项:日志轮转、诊断导出、Linux deb 更新提示、Windows
更温和的进程树退出、macOS 签名/公证与壳文案 i18n。不要把这些功能混入
重构 PR。

## 6. 已知限制

- `harness.log` 尚无轮转上限;
- macOS 未签名/公证,只能检查更新并引导下载;
- GitCode 从 GitHub runner 上传约 160–220 MB 资产极慢,当前为尽力而为渠道;
- 主进程入口仍偏大,下一轮按上一节拆分,不要边拆边改变用户行为。
