# 后续迭代执行记录

执行约定（2026-10-11）：用户要求跳过 TDD，采用 **实现 → 验证 → 修复 → 再验证**。
每项确认允许范围，单独提交；不得跳过、删除或降低断言。自动测试隔离真实数据与凭证。
全部本地门禁通过后发布新的 shell 版本；不顺带升级无关依赖或内核。

## 当前进度

| 任务 | 状态 | 交付 |
|---|---|---|
| TR-01 | 完成 | 真实会话复现、公开能力缺口及回归范围已确认 |
| TR-02 | 完成 | Host 权威生命周期、归档修改、目录广播和双客户端真实回归 |
| TR-03 | 未完成 | 身份安全恢复、冲突/失败恢复、并发与重启持久化 |
| MSG-01～MSG-04 | 未完成 | 配置、IPC、UI、文档与全门禁 |
| FS-01～FS-04 | 未完成 | 管理契约、应用记录、生命周期、统一管理窗口 |
| QA-01 / shell 发布 | 未完成 | 安装包、受控真实验收、发布与镜像 |

下一任务：**TR-03**。

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
任务提交 SHA：提交后记录。

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
