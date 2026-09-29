# A 路线：保留现有壳，强化可靠性

日期：2026-09-29。状态：详细执行计划，功能尚未实现。先读[双路线入口](../2026-09-29-dual-track.md)和[进度](progress.md)。

## 1. 固定范围

保留 Electron + 独立 Node + 官方公开 `web` profile，继续现有 Windows/macOS arm64/Linux deb 交付。保留 appId、默认 `~/.dsh-desktop`、手动社区插件策略、现有发布资产契约。不引入官方 desktop-host，也不重做界面或内核。

本轮优先解决四类问题：内核退回可能破坏数据、退出/更新打断任务、出错后的处理路径不清楚、兼容性只靠“能启动”判断。

第一批可交付目标是 **A00–A07**；A08–A10 后续完成。不要求一次发布包含全部任务。涉及代码的任务要逐项实现和验证；本轮计划交付没有替代现有发版流程。

## 2. 工作区和版本纪律

- 从执行时最新主干的干净提交开 `codex/reliability-<task>` 维护分支。用户原主干工作区有并发升级，先记录状态；不 stash、不 reset、不覆盖它。
- `git worktree list` 确认不是 `codex/official-desktop-patches`。该实验 Worktree 不执行 A 代码任务。
- `package.json`、manifest lock、实际 `resources/harness`、GitHub 最新 Release 四者分别记录。工作区写 rc.2 不表示随包资源已更新或 rc.2 已发布。
- Node/pnpm 以当前仓库 pin 为准。调查基线为 Node 24.21.0、pnpm 10.33.2；不因官方 monorepo 用 pnpm 11 就调整本项目。
- 不把对比报告中的“建议”当已实现。新行为写新决策，保留历史 ADR。

## 3. 实施顺序

```text
A00 基线和待办确认
  → A01 文档事实与产品边界
  → A02 内核/数据兼容调查与真实 fixture
  → A03 内核切换/自动回退保护
  → A04 任务状态可信度模型
  → A05 普通退出/重启统一确认
  → A06 更新下载与安装授权
  → A07 故障恢复闭环
  → A08 经验证的版本组合
  → A09 并存/迁移说明与只读预检
  → A10 回归、发布准备和效果记录
```

## 4. A00 — 基线和现有成果盘点（小）

**修改范围：** progress、`docs/plans/reliable-shell/evidence/baseline.md`（新）。

1. 记录分支、HEAD、原有未提交变化、代码版本和已发布版本。
2. 读 `CONTEXT.md`、`docs/ARCHITECTURE.md`、ADR 0026/0030/0031、现有 `reliable-shell-iteration-plan.md` 的最新交付段。
3. 阅读 `src/main/{kernel-manager,index,supervisor,shell-app,update-prompt,safe-mode,health-check}.ts` 与相关测试，确认任务未被并发工作完成。
4. 安装/资源已就绪时跑一次 `pnpm run verify`；缺资源先按本项目 bootstrap，记录真实错误。不重复跑全量来“碰碰运气”。

**验收：** 基线状态明确，现有失败与新增回归分开。未通过基线不能在后续声称“所有失败都是本次造成”，也不能无条件忽略。

## 5. A01 — 文档事实与产品边界（小）

**依赖：** A00。**允许修改：** README 中英、CONTEXT、ARCHITECTURE、相关 FAQ、后续计划说明；不改运行时代码。

1. 修复 Node 22/实际 Node 24、pnpm 等已核实的漂移，使用事实来源，不批量替换历史 release 记录。
2. 区分“复用官方 WebUI/核心能力”和“等同官方桌面端”。官方 Office payload、native browser 等不得宣传成社区已有。
3. 准确表述 kernel rollback：当前是执行版本退回，不是数据恢复。记录 A03 将改变的条件，未实现前不先写成已交付。
4. 准确说明 Windows 自动下载/退出安装、macOS 检查更新、垃圾桶/删除拦截的行为范围。
5. 把定位说明限定为可靠运行、升级可控、自助恢复；保留独立数据和可选插件承诺。

**验收：** 中英面向用户的功能说明一致；`pnpm run site:check`；本地链接有效。计划文本和产品文案不混写。

## 6. A02 — 数据兼容与内核切换资格（中）

**依赖：** A00。**允许修改：** 临时 fixture 构造脚本、对应测试、`evidence/kernel-data-contract.md`；此任务不改变用户数据，也不实现通用备份管理器。

1. 查实际内核的会话格式、profile/settings/credentials/storage 位置和数据库迁移代码。参考上游 `docs/session-format-status.md`、`packages/core/session` 及具体 persistence provider，不能只看 semver。
2. 使用两套**精确**内核版本和合成数据目录，列出启动前、ready 后、一次合成交互/写设置后，哪些文件改变。记录 schema/格式号和文件 hash。
3. fixture 包含非空会话、设置、插件 manifest、预设和相关数据库；用本地受控 provider 或 keyless fixture，不使用用户真实 API Key/会话。
4. 在副本执行旧→新→旧，检查实际可读性和内容；新增/删除/被覆盖分别判断，不能只断言进程退出 0。
5. 产出明确的三态：`verified-compatible`、`incompatible`、`unknown`。精确版本与数据格式匹配才可使用验证记录；插件自己的未知持久化状态不因核心兼容而自动通过。
6. 写新决策草案：本轮先阻止无法证明安全的自动降级，**不自动恢复/覆盖用户数据**；完整快照恢复另做专项。

**验收：** 有可重跑 fixture、实际版本及结果；能演示“新内核启动后写数据但未 ready”的失败场景。没有合适的两个内核/fixture 时标 blocked，不伪造兼容表。

## 7. A03 — 给所有内核回退路径加保护（中）

**依赖：** A02。**允许修改：** `kernel-manager.ts`、`index.ts` 内切换接线、`supervisor.ts` 的选择/启动接线、错误页/locale、聚焦测试。新增小型 `kernel-transition.ts` 可接受，不建通用升级框架。

固定行为：

| 场景 | 处理 |
|---|---|
| 同一精确内核版本重启 | 沿用普通重启保护，无跨版本迁移承诺 |
| 新版本尚未启动就安装失败 | 保持原指针和原运行实例；不触碰数据 |
| 已验证兼容的版本切换 | 通过任务确认后执行；记录 from/to 和数据格式证据 |
| 数据/版本未知或明确不兼容 | 拒绝自动跨版本启动；显示原因和备份/诊断入口 |
| 目标已经启动但失败 | 不能仅因未 ready 就断言数据未改变；按兼容证据决定是否自动退回 |
| overlay 缺失/损坏/failed marker | 不无条件改用旧内置版本；数据状态不能确认时停在恢复页 |

实施步骤：

1. 从纯函数开始描述 transition verdict，保留结构化拒绝原因；测试未知版本、格式缺失、损坏记录和明确不兼容。
2. 记录本次已启动过的内核和 transition 状态，原子写入；不把 token 或会话内容写进记录。写入失败不能继续危险切换。
   对没有历史记录的既有安装，当前既定启动版本可沿原路径启动并建立观测；这不构成跨版本兼容证明。已有 overlay 路径缺失时不得先静默切到内置，再把内置登记成“原版本”。补充旧配置迁移和首次启动测试，避免新保护把所有既有用户锁在恢复页。
3. 盘点所有入口：`activeKernelBin` 默认回退、`createKernelLaunchGuard`、`rollbackKernel`、`switchKernel`、`kernelRestore`、启动期恢复；每处用同一判定，避免只保护设置按钮。
4. 被拒绝时保留内核文件、active/failed 事实、用户数据；错误页提供重试当前版本/诊断/说明，不自动 purge。
5. 能力确认不足时降级为明确阻止，而不是 `force=true` 或仅弹警告后继续。相应文案写清受影响的既有 overlay 功能。

**验收：** `node --test test/kernel-manager.test.ts test/supervisor.test.ts` 加新增 transition 测试；E2E 故障注入确认 unsafe fallback 不启动旧内核、用户数据 hash 不变；正常同版本重启和验证过的切换保持可用。

**停止条件：** 需要编写任意版本数据“逆迁移”——停止并拆专项，不猜格式、不改写历史数据。

## 8. A04 — 任务状态可信度（中）

**依赖：** A00。**允许修改：** `desktop-notifications.ts` 或独立 `task-activity.ts`、`desktop:session-status` 的主进程状态接线、controls 状态投影、preload、测试。

现状：renderer 的 `useSessions` snapshot 主要用于通知，没有已验证的完整队列/全局任务保证。**禁止把“数组为空”直接解释为后端无任务。**

固定输出：`idle | active | unknown`，另含检查时间、完整性和原因。`active` 包括运行中、等待交互、排队消息、running/stopping jobs。某项无法从公开接口读取就标 unknown；旧版内核/插件不支持新字段也返回 unknown。

步骤：

1. 对照当前内核公开 state 和上游 `desktop-host/src/{quit-inspection,update-tasks}.ts` 列出字段映射。只读参考，不引入整个 private Host。
2. 补确实可取得的字段和 schema 校验；主进程记录接收时间，过期（首版 5 秒）/断连/renderer reload/切换内核立即失效。
3. 如果观察不到全局 roster/队列，明确 `complete=false`。本轮默认 unknown 走用户确认，不为了“少弹窗”猜 idle。
4. 若当前公开 Host plugin API 能提供完整检查，可在已有 controls Host 面增加一个**只读**状态查询，沿官方 authenticated RPC/窄桥接传回；禁止新增未认证 loopback 服务。先写查询协议测试再接入。
5. 没有可靠 Host API 时保留 conservative unknown 是允许的交付结果；记录限制，后续贡献公开检查能力，不扩大本轮为 admission-lock 重构。

**验收：** fake clock 测 freshness；缺字段/越界/断连都是 unknown；全局 job、子 agent、待确认、两种队列 fixtures 为 active；只有已证明完整且新鲜的检查能返回 idle。通知行为回归不变。

## 9. A05 — 普通退出与重启统一保护（中）

**依赖：** A04；涉及内核切换还依赖 A03。**允许修改：** `index.ts`、`shell-app.ts`、`process-lifecycle.ts` 的必要接线、locale、一个小型 `quit-guard.ts`、测试。

行为规范：

- active：告知运行任务将被中断；unknown：告知无法确认任务状态。默认按钮和 Escape 为取消。
- idle：普通退出可直接继续；真正停进程前复查，若出现 active/unknown 则确认。
- 确认框期间多个退出/重启请求合并，取消后窗口/Host/LAN/托盘仍正常；确认前不得把 `quitInProgress` 设成永久关闭态、销毁托盘或停进程。
- 手动重启 Harness、Safe Mode 切换、内核切换/恢复、需要重启的桌面偏好使用同一授权语义，避免两次确认或绕过。
- 崩溃恢复、没有成功启动的 Host、测试退出、OS 确定的 session-end 和已授权的安装退出走明确原因分支。只有确定的系统关闭事件可跳过，普通窗口关闭不是系统关闭。
- “确认中断”授权只用于该次操作，不持久存成以后全部允许；不声称当前 Web 壳具有官方完整 admission-lock 原子性。

实现一个有限状态流：`idle → checking → confirming → stopping`，取消返回 idle。复用现有停止预算和进程树清理，避免第二套 supervisor。

**验收：** 聚焦 node:test 覆盖重入/取消/Host 崩溃/检查超时；真实 Electron fixture 覆盖菜单、托盘、系统关闭请求、重复点击和取消后继续任务；保留窗口 close-to-tray 行为。只杀本次 fixture PID。

## 10. A06 — 更新偏好与显式安装（中）

**依赖：** A05。**允许修改：** `update-prompt.ts`、shell preferences、桌面设置/locale、主进程接线、更新测试。不改下载签名/校验逻辑和稳定 feed 来源。

固定首版策略：

1. 添加 Windows `autoDownloadUpdates` 偏好；迁移既有用户时保留现有自动下载行为，新用户默认仅检查提示。区分“字段不存在的旧配置”与“全新 userData”，并测试。
2. 所有用户的自动退出安装改为显式安装授权：`autoInstallOnAppQuit=false`。普通退出不安装；下载完成后展示“安装并重启”，点击后进入 A05 保护。
3. 自动检查不弹阻塞对话框；下载失败可显式重试。并发 check/download/install 合并为单次操作，不因重复注册 updater listener 多次弹窗。
4. active/unknown 必须明确允许中断后才能安装。取消保留已下载状态，不反复弹窗；实际启动 installer 失败恢复清楚的可重试状态。
5. macOS/Linux 保持目前可用的检查/下载页行为；UI 不展示无效 Windows 开关。
6. 这属于用户可见策略变化，更新中英文档和对应新决策；不能仅改一个库选项不补用户入口。

**验收：** fake updater 覆盖无新版本、可下载、失败、取消、已下载重启、安装失败；真实 Windows fixture 验证安装交接（拦截执行与真正安装需分别记录）；普通 Quit 不调用安装器；原有 SHA/更新来源校验不被弱化。

## 11. A07 — 完善已有恢复闭环（中）

**依赖：** A03/A06。**允许修改：** `health-check.ts`、`diagnostics.ts`、`pages.ts`、`plugin-recovery.ts`、相关 controls UI 和测试。按一类故障一小提交完成。

| 子项 | 场景 | 验收 |
|---|---|---|
| A07a | 闭包损坏/原生依赖失败 | 体检说明具体失败类、当前版本正确重装包；修复后复查通过，不自动重写资源 |
| A07b | 插件 API 不兼容 | 明确是候选而非确定肇事者；升级/禁用/安全模式结果一致，不能声称某操作未改配置但实际自动隔离已写入 |
| A07c | overlay 回退被阻止 | 解释数据兼容未知/不兼容；保留内核与数据，诊断带 from/to/原因而无敏感正文 |
| A07d | 网络/registry/更新源故障 | 默认体检不联网；用户选择联网后才探测；区分超时、代理和服务响应，不输出含凭证 URL |
| A07e | 重试后仍失败 | 按钮恢复可操作，保留前一次失败原因，日志可导出；不无限自动重启 |

**验收：** 每类至少一个故障注入用例；现有 safe-mode、plugin recovery、health、diagnostics 单测；一次真实 packaged smoke。具体台数/通过数以实测记录，不能照抄旧 HANDOFF。

## 12. A08 — 经验证的版本组合（中）

**依赖：** A02/A03/A07。**范围：** 小型版本资格清单、验证脚本、内核设置文案；不建在线插件审查平台。

1. 只发布精确组合的证据：shell commit/version、kernel version、Node、平台、测试过的插件版本和已知限制。
2. “可启动”与“已验证”分开。资格至少含 profile 加载、非空会话读取、一个本地 fixture 任务、插件启用/禁用、正常退出；涉及 downgrade 还必须有 A02 结果。
3. peerDependencies 仅作提示，不能当运行兼容证明；一个 peer 满足不代表全部依赖可用。
4. 设置中给明确状态；未经验证的版本不走自动切换推荐路径。版本来源仍是公开 npm，校验与供应链检查不删。
5. 不自动安装社区插件；测试 fixture 与用户默认产品内容分离。

**验收：** 两个组合能从记录追到命令/产物；删除/更改任一关键版本使资格失效，不复用不匹配平台的结论。

## 13. A09 — 官方版并存与迁移准备（中）

**依赖：** A02。**范围：** 文档、只读 preflight；本轮不自动迁移真实数据。

步骤：

1. 对照官方 `profiles/desktop` 与社区 `profiles/web`，列数据目录、格式、凭证和插件差异。
2. 为用户选择的目录提供只读检查：是否应用仍在运行、是否嵌套/同一路径、版本和格式是否支持、是否有安全备份空间；不读取凭证内容到报告。
3. 说明先完全退出两边，再处理数据副本；插件按清单重装，不复制 node_modules；凭证只在明确选择下迁移，默认跳过。
4. 用合成目录验证预设和支持的会话导入路径。无官方稳定导入接口时只交付经过验证的手工步骤，不直接复制数据库后宣称兼容。
5. B 实验版与官方发行版是不同目标，不能混用 appId/路径/登录状态。

**验收：** 原始 fixture 全量 hash 不变；不支持的格式明确拒绝；“预检通过”不写成“数据已迁移”。

## 14. A10 — 回归、发布准备与反馈（中）

**依赖：** 本轮选定交付任务完成。**范围：** 必要测试、变更说明、兼容说明和 evidence。

- 每项先跑相关 node:test；涉及 Electron 行为补聚焦 E2E；本轮收口再跑 `pnpm run verify`。
- 按实际变更触发 `pnpm run test:e2e`、`dist:dir`、打包 smoke、真实 Harness/插件市场与跨版本升级门禁。不得因为全套很慢而删已有门禁。
- 运行 Playwright/改测试时读适用测试技能；正式发版另按仓库 release skill。当前计划不是立即打 tag/推送/发布的指令。
- 发布说明清楚解释：受保护的回退可能被拒绝、普通 Quit 不再静默装更新、任务状态未知时会确认；说明用户如何继续操作。
- 记录本轮维护工时、同类故障重复次数、用户自愿反馈；不为统计默认增加远程遥测。

**验收：** 每个已交付任务有测试证据，两个平台以上的必要差异不靠推断；未验证平台和场景单列。产品改动和文档描述一致。

## 15. 给执行模型的停止规则

| 情况 | 下一步 |
|---|---|
| 工作区已有他人升级/修复 | 不修改/提交那些文件；在干净基线维护分支继续，记录差异 |
| 找不到队列或完整 task roster | 返回 unknown，保留确认；不猜字段、不默认 idle |
| 新内核已写数据且降级未知 | 不自动启动旧内核；保留恢复页、文件和证据 |
| 修复要求逆向迁移数据 | 停在专项设计，不造“通用回滚” |
| 旧测试依赖无条件 fallback | 先更新任务所定义的真实行为，再写新回归；不要删除测试掩盖失败 |
| 多次退出触发卡死 | 先复现状态机，检查确认前的副作用和重入；不延长超时当修复 |
| Windows 未实测 | 本地可做单测/脚本；安装/更新任务保持待验证 |
| 需求开始涉及官方原生浏览器/Office | 转 B 路线，不在 A 临时移植 |

遇到新的设计选择，优先本计划中的保守行为；如果与实际源码冲突，记录文件/行号和最小替代方案，先完成不依赖该选择的工作。不要在没有证据时扩大任务范围。
