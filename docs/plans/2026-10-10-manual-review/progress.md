# 后续迭代执行记录

执行约定（2026-10-11）：用户要求跳过 TDD，采用 **实现 → 验证 → 修复 → 再验证**。
每项确认允许范围，单独提交；不得跳过、删除或降低断言。自动测试隔离真实数据与凭证。
全部本地门禁通过后发布新的 shell 版本；不顺带升级无关依赖或内核。

## 当前进度

| 任务 | 状态 | 交付 |
|---|---|---|
| TR-01 | 完成 | 真实会话复现、公开能力缺口及回归范围已确认 |
| TR-02 | 完成 | Host 权威生命周期、归档修改、目录广播和双客户端真实回归 |
| TR-03 | 完成 | 会话身份冲突拒绝、事务回滚、跨进程锁、子会话保护与重启持久化 |
| MSG-01～MSG-04 | 未完成 | 配置、IPC、UI、文档与全门禁 |
| FS-01～FS-04 | 未完成 | 管理契约、应用记录、生命周期、统一管理窗口 |
| QA-01 / shell 发布 | 未完成 | 安装包、受控真实验收、发布与镜像 |

下一任务：**MSG-01**。

## TR-01 — 真实垃圾桶复现与契约核对

允许范围：本计划文档、隔离诊断脚本、文档索引；没有产品代码改动。
任务提交 SHA：`8161ef4cfc10888591b8314e12f861c447606c58`。

| 命令 | 结果 | 退出码 |
|---|---|---:|
| `pnpm run build` | 编译通过 | 0 |
| `node docs/plans/2026-10-10-manual-review/reproduce-trash-sidebar.mjs`（两次） | 真实会话已删除，磁盘 0、侧栏 1；5 秒后仍在。修复前预期失败，不计作功能验收通过 | 1 / 1 |
| `node --check docs/plans/2026-10-10-manual-review/reproduce-trash-sidebar.mjs` | 语法通过 | 0 |
| `git diff --check` | 通过 | 0 |
| `pnpm run site:check` | 站点与下载 API 全部通过；既存 MODULE_TYPELESS 警告未改动 | 0 |

夹具：临时 `DSH_HOME` / Electron userData / 工作区，本地 SSE 模拟模型、假 key；模拟答复与标题生成
共两次请求，真实模型/飞书请求为 0。实际点击设置中的删除按钮，以真实会话标题定位侧栏。
退出时关闭测试 Electron/模拟服务并清理本次临时目录。

契约结论：客户端刷新和工作区取消归档可复用公开服务；驻留 Session 的释放需要创建方持有的
`AgentHandle.dispose()`，现有公开 `sessionController` 未提供协调入口。TR-02 需交付可重复构建的
窄范围能力补丁/入口，不能修改私有缓存或仅过滤 UI 来掩盖问题。

未覆盖项（交由后续任务）：恢复/取消归档真实侧栏、其他客户端、选中回退、归档/置顶/子任务、
活动任务权威拒绝、路径冲突与失败回滚、重启持久化，以及新飞书管理和发布门禁。

## TR-02 — Host 权威生命周期与真实客户端同步

允许范围：Host/client 插件、垃圾桶 IPC/preload、Supervisor 私有端点、可重复构建的版本绑定
生命周期/选中回退补丁、对应测试及 ADR 0035。没有升级依赖、修改用户 overlay 或子模块。
任务提交 SHA：`f20861b74cc7c2deed54392852ff8946495333db`。

内核创建方保存自己的 AgentHandle，空闲维护区内 flush/移动，再释放；运行、排队、其他所有者
以及驻留子任务拒绝删除。冷会话持有持久化 writer lease。归档修改走 workspaceRegistry，恢复
广播目录新增；客户端同步失败显示可重试提示，旧异步刷新不覆盖新结果。移除当前项由选择
拥有者清除详情引用。随机鉴权令牌只留在 main/Host，不进入 renderer/日志。

| 命令 | 结果 | 退出码 |
|---|---|---:|
| `pnpm run verify` | 全绿；覆盖率行 89.01%、分支 80.45%、函数 84.74%；ACP/站点/构建通过 | 0 |
| `node --test test/desktop-controls.test.ts test/trash.test.ts test/trash-sessions.test.ts test/trash-host.test.ts test/session-trash-patch.test.ts test/supervisor.test.ts` | 39 passed，0 failed，0 skipped | 0 |
| `pnpm exec playwright test e2e/trash-ui.spec.ts -g 'real idle\|Host refuses' --repeat-each=2` | 4 passed；双客户端删除/还原/取消归档与活动任务拒绝，连续两轮 | 0 |
| `node docs/plans/2026-10-10-manual-review/reproduce-trash-sidebar.mjs` | 磁盘 0、侧栏 0、无幽灵详情 | 0 |
| `node docs/plans/2026-10-10-manual-review/reproduce-trash-refresh.mjs` | 删除/恢复分别公开刷新，共 2 次 | 0 |
| `pnpm run typecheck`、`git diff --check` | 通过 | 0 |

迭代中定位并修复：全 ID 与目录扫描去前缀 ID 不一致、主视图遗留引用、测试夹具缺少真实
持久化事件、默认窗口窄屏折叠侧栏、已失效 Supervisor 端点。没有降低产品断言。
测试全部使用临时目录、本地模拟模型和假 key，无真实模型/飞书调用；临时实例已清理。

未覆盖项：同名会话恢复拒绝、索引失败回滚、跨进程垃圾桶竞争、重启、置顶/子任务与永久清理
的完整回归由 TR-03 补齐；安装包/平台/真实飞书由 QA-01 验收。当前补丁仅支持绑定内核版本，
未知版本失败关闭；用户 overlay 不提供安全入口时拒绝操作，不回退强杀/直接删除。

## TR-03 — 身份安全恢复与事务回归

允许范围：垃圾桶共享工具、Host/IPC/client 的会话恢复路径、生命周期子会话保护、真实回归
夹具与相应测试、ADR/本记录。任务提交 SHA：`151e2337927a77fd8dd38ab9117d47493ce9be8e`。

会话恢复拒绝已占用路径/已存在身份，保留桶内原件；恢复后核对公开持久化 header、工作区与
全 ID。普通文件仍编号另存。main/Host 通过同一跨进程锁读写索引，删除先记录恢复位置，
失败不覆盖新建原路径；恢复时 registry/索引失败回滚到桶内。驻留或持久子会话保护父会话，
先处理子会话，不强停/批量暗删。刷新失败可重试，成功后明确显示已完成且不重复磁盘操作。

| 命令 | 结果 | 退出码 |
|---|---|---:|
| `node --test test/trash.test.ts test/trash-host.test.ts test/trash-sessions.test.ts test/session-trash-patch.test.ts` | 30 passed，0 failed，0 skipped；含跨进程 12 条写入、重复恢复、故障回滚、子会话保护 | 0 |
| `node --test test/trash-client-ui.test.ts` | 2 passed；同步重试不重复删除，旧读取不覆盖新状态 | 0 |
| `pnpm exec playwright test e2e/trash-ui.spec.ts -g 'real idle\|Host refuses\|external kernel' --repeat-each=2` | 6 passed；置顶/归档恢复、双入口冲突、双客户端、活动/外部 writer、永久清除与重启 | 0 |
| `pnpm run verify` | 361 单测 + 1 ACP 契约通过，站点/构建/类型全绿；覆盖率 89.05/80.60/85.06% | 0 |
| `git diff --check` | 通过 | 0 |

实现后失败已定位并重验：冷会话依赖未声明（补显式 sessionPersistence 注入）；重启新客户端
正常创建空白草稿，完整目录基线仍保留且清除目标不复活，额外草稿严格验证仅有三条权限初始化
事件、无父会话/模型任务；刷新成功缺少完成反馈（已补齐）。未删除或跳过产品断言。
所有自动测试为临时 home/userData、假 key/本地模拟模型；仅永久清除了测试自建桶内数据。

未覆盖项：本轮 Windows/Linux 实机与安装包重跑交 QA-01；飞书新管理/显示设置尚未实施。
故障退出留下的共享 lock 文件沿用已有 withFileLock 的超时拒绝行为，不自动抢锁或覆盖数据。
