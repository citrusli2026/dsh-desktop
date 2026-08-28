# shell.9 迭代计划:救援与分享(安全模式 / 恢复中心 / 便携预设包)

> 规划日期:2026-08-28。决策依据见 ADR 0021(中英);本文是**可执行任务清单**,
> 含 spike 侦察项、任务列表与状态跟踪。完成后按 `.agents/skills/release-dsh-desktop`
> runbook 走 shell.9 发布。
> 版本范围(用户确认):五块全收——① Safe Mode;② 恢复中心化+诊断增强;
> ③ `.dshpreset` 便携预设包;④ 诊断包内只读查看(可降级砍除);⑤ 发布杂项。

## 0. 范围速览

| 块 | 内容 | 目标 | 优先级 |
|---|---|---|---|
| ① Safe Mode | 非破坏性插件隔离、双触发、持久标志与横幅 | 坏插件不再击垮 profile | P0 |
| ② 恢复中心+诊断增强 | 错误页四动作;报告含插件清单/坏插件候选/safeMode/版本 | 引导式救援 | P0 |
| ③ .dshpreset | 预设导出/导入+冲突检测+信任警告,入口在扩展设置区 | 预设可携带可分享 | P1 |
| ④ 诊断包内查看 | 导出后壳内纯文本查看报告与 harness.log | 诊断立即可读 | P2(可砍) |
| ⑤ 发布杂项 | 关闭 6 个过期 issue;site-refresh 根因 | 不再重复还债 | P1 |

## 1. Spike(先做,各约半天,结论回填本节)

| ID | 问题 | 方法 | 产出 |
|---|---|---|---|
| SPIKE-1 | 用户插件在盘上的落点,以及最小禁用方式 | 临时 `DSH_HOME` 走 Harness「设置→插件」装一个测试插件,记录 profile `package.json` 依赖、`cordis.patch.yml` 条目、`profiles/node_modules` 链接;再装一个启动即崩插件,抓 harness 输出中的失败签名精确行格式 | ① 禁用语义结论(首选 disable/id 定向 patch;回退=依赖条目临时重命名);② 失败签名正则 |
| SPIKE-2 | 预设根写入口径与信任模型 | 读 `dsh-agent-presets` 的 roots 配置与 trust 判定(根属官方预置 vs 用户目录);验证:导出目录 → 打包 → 放到用户预设根 → 官方预设选择器可见 | 导出/导入涉及的目录集合与合法性约束 |

## 2. 任务清单

| ID | 任务 | 涉及文件 | 依赖 | 状态 |
|---|---|---|---|---|
| T1 | safe-mode 纯函数模块:生成禁用用户插件的覆盖层、组合启动参数集、`detectPluginFailure(logLines)`、状态机(enter/exit/标志读写) | `src/main/safe-mode.ts`(新) | SPIKE-1 | ⬜ |
| T2 | supervisor 感知安全模式:默认启动挂 safe 参数集;`HarnessState.ready` 携带 safeMode;日志环 buffer 已有,接 T1 检测(仅记录检测触发,不强制重启) | `src/main/supervisor.ts` | T1 | ⬜ |
| T3 | 标志持久化与 IPC:`shell-preferences.json` 增 `safeMode`;`desktop:state` 暴露、`desktop:action` 白名单增 safeMode enter/exit(复用既有发送方校验) | `src/main/shell-preferences.ts`、`src/main/index.ts` | T1 | ⬜ |
| T4 | 恢复中心:错误恢复页四动作(重试/以安全模式启动/导出诊断/打开日志);已在安全模式时隐藏 safe 按钮 | `src/main/pages.ts`、`src/preload/index.ts`、`src/main/window.ts` | T3 | ⬜ |
| T5 | 横幅与退出:插件侧顶部横幅显示「安全模式:第三方插件已隔离」+「退出安全模式」;扩展入口/扩展设置区加状态行与动作 | `plugins/dsh-desktop-controls/` | T3 | ⬜ |
| T6 | 诊断增强:报告加入插件清单(profile 依赖+patch 条目)、坏插件候选(日志签名提取)、safeMode、壳/内核版本;`desktop:diagnostics` 返回结构扩展 | `src/main/diagnostics.ts`、`src/main/lan.ts` 无涉 | T1 | ⬜ |
| T7 | .dshpreset:导出(选定预设→包文件)/导入(冲突检测:跳过/覆盖/克隆新名;信任警告)/扩展设置区入口+IPC(`desktop:presets` 动作) | `src/main/presets.ts`(新)、`plugins/dsh-desktop-controls/` | SPIKE-2 | ⬜ |
| T8 | 诊断包内查看:导出完成后壳内纯文本查看报告与 harness.log(仅文本渲染;不引第三方查看器) | `src/main/pages.ts` 或受限子页面 | T6 | ⬜(可砍) |
| T9 | 发布杂项:关闭 issue #3/#4/#9/#10/#12(站点同步失败,以已修复/过期标注)与 #8(陈旧);site-refresh `startup_failure` 根因诊断+修复或记录为平台不可控 | `.github/workflows/site-refresh.yml` | — | ⬜ |
| T10 | 文档:ARCHITECTURE(新模块+验证契约)、CONTEXT(术语 safe mode/.dshpreset)、README 中英(FAQ:插件装坏了怎么办;预设分享)、`docs/release-notes/v0.1.1-rc.2.shell.9.md`(发布说明正文) | docs 多文件 | T1–T8 | ⬜ |

## 3. 测试计划(全部纳入 verify/发布门禁)

| 层 | 用例 | 数量 |
|---|---|---|
| 单测 | safe-mode 纯函数(覆盖层生成/幂等/状态机/标志清退)、detectPluginFailure 签名、presets 包往返+冲突分支、诊断报告字段 | +12~15 |
| dev E2E | ①恢复中心流:注入启动失败 → 错误页点「以安全模式启动」→ 断言重启 args 含 safe 覆盖层、横幅出现 → 退出恢复;②预设导入流(stub 预设) | +2(10→12) |
| 打包 smoke(@smoke,三平台) | 坏插件 fixture profile(仓库内 stub 包,hermetic)→ 普通启动断言首屏失败 → 安全模式重启断言恢复渲染+横幅 | +1 |
| 门禁 | `pnpm run verify`:typecheck、135+单测与覆盖率门槛、site:check、build;发布时全量 verify + 8 文件契约 + GitCode + site-refresh | — |

## 4. 发布顺序

1. spike(SPIKE-1/2)→ 结论更新 ADR 0021 备选段(如有出入)。
2. T1→T4(Safe Mode 与恢复中心,先红后绿)→ T5/T6(横幅+诊断)→ T7(预设)→ T8(可选)。
3. `node scripts/version.mjs bump shell` → shell.9;本地 `pnpm run verify` 全绿。
4. 按 release runbook 发布;镜像与站点数据按既有流程;HANDOFF 追加三十节。

## 5. 本轮边界(ADR 0021)

不做:快照/自动修复/回滚(EAC 式)、内核版本管理、余额/用量小部件、通用文件预览、
预设市场/远程下载、插件安全市场、Agent Browser、Tailscale 远程。上游发新 rc 版
则先插内核 bump 迭代。

## 6. 状态跟踪

| 项 | 状态 |
|---|---|
| ADR 0021(中英)+ 索引 | ✅ 2026-08-28 |
| 本计划 | ✅ 2026-08-28 |
| SPIKE-1/2 | ⬜ |
| T1–T10 | ⬜ 见上表 |
| shell.9 发布 | ⬜ |
