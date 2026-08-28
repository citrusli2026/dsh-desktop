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
| SPIKE-1 | 用户插件在盘上的落点,以及最小禁用方式 | **已完成(2026-08-28,一手实测)**:临时 `DSH_HOME` 装 `spike-fake-plugin` 实测 → `dsh plugin --profile web add file:…` = pnpm 装依赖 + 把包名追加进 profile `package.json` 的 `dsh.profile.bundles`(官方 `@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app` 之后);插件行 id 由插件自身 `dsh.bundle.patch`(cordis.patch.yml)的 insert 列表定义;`--patch` overlay `[{id, disabled: true}]` 在组合树中生效(与官方 telemetry 关闭开关 `resolveTelemetryPatch` 同构,dump-config 实测行带 `disabled: true` 且注释 `patched by <overlay>`);坏插件(构造抛错)启动 exit=1,harness 输出含 `failed to apply loader entry <id> (<name>)` 批注链,带禁用 overlay 后正常输出 `dsh web: http://127.0.0.1:<port>` | ① 禁用语义=id 定向 overlay(不再用依赖重命名回退);② 失败签名正则 `failed to apply loader entry (\S+) \(([^)]*)\)`(取最后一次匹配的 id/name) |
| SPIKE-2 | 预设根写入口径与信任模型 | **已完成(2026-08-28,源码核对)**:预设挂载行 id=`agent-presets`;`config.roots` 数组每项 `{path, trust}`,trust ∈ `system|user`;官方根 = `<dsh安装>/config/agent-presets/{standard,minimal,code,cordis/<id>/agent.cordis.yml + preset.yml}`(trust `system`,不可写,写则抛 `PresetNotWritableError`);自动追加 user 根 = `$DSH_HOME/.agent-presets`(trust `user`,即 `writableRoot()`);预设 id=目录名,composition=`agent.cordis.yml`,元数据=`preset.yml` | 导出=打包 `<id>/` 两文件;导入=冲突检查(id 冲突)→复制到 `$DSH_HOME/.agent-presets/<id>/`;信任警告=user 根非官方内置根 |

## 2. 任务清单

| ID | 任务 | 涉及文件 | 依赖 | 状态 |
|---|---|---|---|---|
| T1 | safe-mode 纯函数模块:生成禁用用户插件的覆盖层、组合启动参数集、`detectPluginFailure(logLines)`、状态机(enter/exit/标志读写) | `src/main/safe-mode.ts`(新) | SPIKE-1 | ✅ |
| T2 | supervisor 感知安全模式:默认启动挂 safe 参数集;`HarnessState.ready` 携带 safeMode;日志环 buffer 已有,接 T1 检测(仅记录检测触发,不强制重启) | `src/main/supervisor.ts` | T1 | ✅ |
| T3 | 标志持久化与 IPC:`shell-preferences.json` 增 `safeMode`;`desktop:state` 暴露、`desktop:action` 白名单增 safeMode enter/exit(复用既有发送方校验) | `src/main/shell-preferences.ts`、`src/main/index.ts` | T1 | ✅ |
| T4 | 恢复中心:错误恢复页四动作(重试/以安全模式启动/导出诊断/打开日志);已在安全模式时隐藏 safe 按钮 | `src/main/pages.ts`、`src/preload/index.ts`、`src/main/window.ts` | T3 | ✅ |
| T5 | 横幅与退出:插件侧顶部横幅显示「安全模式:第三方插件已隔离」+「退出安全模式」;扩展入口/扩展设置区加状态行与动作 | `plugins/dsh-desktop-controls/` | T3 | ✅ |
| T6 | 诊断增强:报告加入插件清单(profile 依赖+patch 条目)、坏插件候选(日志签名提取)、safeMode、壳/内核版本;`desktop:diagnostics` 返回结构扩展 | `src/main/diagnostics.ts` | T1 | ✅ |
| T7 | .dshpreset:导出(选定预设→包文件)/导入(冲突检测:跳过/覆盖/克隆新名;信任警告)/扩展设置区入口+IPC(`desktop:presets` 动作) | `src/main/presets.ts`(新)、`plugins/dsh-desktop-controls/` | SPIKE-2 | ✅ |
| T8 | 诊断包内查看:导出完成后壳内纯文本查看报告与 harness.log(仅文本渲染;不引第三方查看器) | `src/main/pages.ts` 或受限子页面 | T6 | 🚫 **砍除**(与官方附件/工作区查看重叠风险,且诊断报告已含日志引用;聚焦版本质量,下轮候选) |
| T9 | 发布杂项:关闭 issue #3/#4/#9/#10/#12 与 #8(✅ 已关闭);site-refresh `startup_failure` 根因 | `.github/workflows/site-refresh.yml` | — | ✅(**结论:平台级 runner 启动失败,工作流已有每日兜底+失败告警+GitCode 重试,不改代码,记录为已知平台边界**) |
| T10 | 文档:ARCHITECTURE(新模块+验证契约)、CONTEXT(术语 safe mode/.dshpreset)、README 中英(FAQ:插件装坏了怎么办;预设分享)、`docs/release-notes/v0.1.1-rc.2.shell.9.md`(发布说明正文) | docs 多文件 | T1–T8 | 🔄 进行中(README 与发布说明待发版前) |

## 3. 测试计划(全部纳入 verify/发布门禁)

| 层 | 用例 | 数量 | 状态 |
|---|---|---|---|
| 单测 | safe-mode 纯函数(覆盖层生成/幂等/状态机/标志清退)、detectPluginFailure 签名、presets 包往返+冲突分支、诊断报告字段、supervisor insertPatches | +18 | ✅ 147 项(原 135)→ 全绿 |
| dev E2E | ①预设导入流(stub 预设,走真实主进程 dialog 打桩);**Safe Mode 恢复中心流调整**:dev stub 模式 boot 短路无法产生错误页(架构校验),全链路放入打包 smoke 门禁 | +1 | ✅ 12 用例(11 过 + 1 按设计 skip) |
| 打包 smoke(@smoke,三平台) | 坏插件 fixture profile(两阶段:普通启动确证失败→安全模式重启断言恢复渲染+横幅);`DSH_DESKTOP_SAFE_BREAK=1`,release.yml 三平台步骤已加 | +1 | ✅ mac 本地全链路通过(2026-08-28) |
| 门禁 | `pnpm run verify`:typecheck、135+单测与覆盖率门槛、site:check、build;发布时全量 verify + 8 文件契约 + GitCode + site-refresh | — | ✅ 本机 typecheck/test/build 全绿(147 单测) |

## 4. 发布顺序

1. spike(SPIKE-1/2)→ 结论更新 ADR 0021 备选段(如有出入)。
2. T1→T4(Safe Mode 与恢复中心,先红后绿)→ T5/T6(横幅+诊断)→ T7(预设)→ T8(可选)。
3. `node scripts/version.mjs bump shell` → shell.9;本地 `pnpm run verify` 全绿。
4. 按 release runbook 发布;镜像与站点数据按既有流程;HANDOFF 追加三十节。

## 5. 本轮边界(ADR 0021)

不做:快照/自动修复/回滚(EAC 式)、内核版本管理、余额/用量小部件、通用文件预览、
预设市场/远程下载、插件安全市场、Agent Browser、Tailscale 远程。上游发新 rc 版
则先插内核 bump 迭代。

## 6. 运行时升级专项(下一迭代候选,2026-08-28 立项)

依赖升级原则:安全更新(advisory)即时跟进;其余只在有收益且可全量验证时升。
dependabot 已限制 `version-update-semver-scope: minor`,major 由专项迭代人工处理
(2026-08-28 已关闭 #2/#13/#14 三个不合规 major PR,理由记录于其评论)。

| 项 | 目标 | 触发条件 |
|---|---|---|
| Electron 43.x → 44.x | 保持"中间一代"单步跟踪;43 仍处支持窗口,45/46 发布后将出窗口 | `44.x.y` 发布且 `security:audit` 通过(44.0.0 依赖树带 3 漏洞,已否决) |
| 捆绑 Node 22 → 24 LTS | 与上游 dsh 的 Node 要求对齐;22 为 Maintenance LTS(2027-04 EOL) | @deepseek-ai/dsh 上游许可(内核 bump 迭代) |
| @types/node 22 → 24 | 跟随捆绑 Node 版本,不超前 | 随上面两项一同升级 |
| esbuild 0.25 → 0.28 | 构建工具,无紧迫 | 随专项顺手验证 |

验证要求(专项内):`pnpm run verify:full` + 三平台打包 smoke + 安装态 + 更新链
(Dependabot major PR 不进主干,只在本专项合入)。

> 本轮(shell.9)启动的审核结论:dependabot 的本意不是"推荐升级版本",而是
> 暴露新版本;**是否升级由策略决定**,CI 的 `security:audit` 门禁负责拦截
> 未经验证的依赖树。

## 7. 状态跟踪

| 项 | 状态 |
|---|---|
| ADR 0021(中英)+ 索引 | ✅ 2026-08-28(提交 70aba99) |
| 本计划 | ✅ 2026-08-28(提交 70aba99) |
| SPIKE-1/2 | ✅ 已回填(结论见 §1) |
| T1–T7 | ✅ 已实现(147 单测、dev E2E 12 用例、typecheck/build 全绿) |
| T8 | 🚫 砍除(记录于 §2) |
| T9 | ✅ issue 全部关闭;site-refresh 为平台边界(记录于 §2) |
| T10 | 🔄 ARCHITECTURE/CONTEXT 随本轮更新;README FAQ 与发布说明待发版前 |
| shell.9 发布 | ⬜(先补打包 smoke 安全模式用例 + README/发布说明,再按 runbook 发布) |
