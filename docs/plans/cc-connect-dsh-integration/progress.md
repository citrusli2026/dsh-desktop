# 执行进度

最后更新：2026-10-07。

## 当前基线

- 父仓库分支：`codex/cc-connect-dsh-integration`
- 父仓库基线：`6ae74923289fe771287e03e3234bb140455f4177`
- 子模块远端：`git@github.com:citrusli2026/cc-connect.git`
- 子模块目录：`third_party/cc-connect`
- 子模块基线：`dfad19415a38b00b2c5c288610784d1a7eef337f`
- 子模块本地开发分支：`codex/dsh-agent-integration`
- 产品功能实现：尚未开始

## 状态表

| 任务 | 状态 | 提交 | 验证摘要 |
|---|---|---|---|
| 仓库准备：父分支和子模块 | done | `5c8d430` | 两个分支已推送；子模块固定到 `dfad1941` |
| PLAN-01 ADR | done | `0f92715f22004c49125a8c020fdcba6a3596a680` | 中英文 ADR、新索引链接；文档门禁通过 |
| CC-01 一级 DSH Agent | done | `90e2f65b5128c43659d6b43745e0373cbee4d218` / gitlink `a6b6ea20ec2cbc25565b4500ae2606b629b07136` | Agent 单测已写入；格式门禁通过，Go 测试受模块下载阻塞 |
| CC-02 session/resume | done | `604c1abe7593a12d7902802859805d9c1dad4e90` / gitlink `78034bf00eec431f3310827f6241b77d6dabe7e1` | fake ACP 覆盖 load、resume、无能力、错误和缺少响应 ID；Go 测试受模块下载阻塞 |
| CC-03 close 与事件映射 | next | — | — |
| CC-04 readiness | todo | — | — |
| CC-05 子模块门禁 | todo | — | — |
| DESK-01 打包 | todo | — | — |
| DESK-02 路径与完整性 | todo | — | — |
| DESK-03 配置与凭证 | todo | — | — |
| DESK-04 Supervisor | todo | — | — |
| DESK-05 App 生命周期 | todo | — | — |
| DESK-06 IPC/Preload | todo | — | — |
| DESK-07 设置页 | todo | — | — |
| QA-01 假 Sidecar E2E | todo | — | — |
| QA-02 DSH ACP 契约 | todo | — | — |
| QA-03 飞书人工验收 | todo | — | — |
| DOC-01 用户文档 | todo | — | — |
| REL-01 最终门禁 | todo | — | — |

## 下一任务

执行 `PLAN-01`。先读 ADR 0023、0030、0031 和 `docs/decisions/README.md`，新增 0033 中英文决策记录。该任务只写决策文档，不实现代码。

## 每项完成后的记录格式

```text
### TASK-ID — YYYY-MM-DD

- 子模块提交：<sha 或 n/a>
- 父仓库提交：<sha 或 n/a>
- 行为变化：
- 测试命令与退出码：
- 未覆盖项：
- 下一任务：
```

长日志保存到被忽略的 `test-results/`，这里只写脱敏摘要。状态改为 done 前必须有提交 SHA 或明确说明为何该任务只更新未提交的执行记录。

### PLAN-01 — 2026-10-07

- 子模块提交：n/a
- 父仓库提交：`0f92715f22004c49125a8c020fdcba6a3596a680`
- 行为变化：新增 ADR 0033 中英文版本，记录 cc-connect Desktop Sidecar 的进程边界、共享 `DSH_HOME`、设置页入口、安全模式、凭证边界和首版范围；未宣称功能已实现。
- 测试命令与退出码：`git diff --check`（0）；决策文件存在性检查（0）；ADR 索引链接检查（0）。
- 未覆盖项：未运行运行时代码或集成测试；人工飞书验收不属于本任务。
- 下一任务：`CC-01`。

### CC-01 — 2026-10-07

- 子模块提交：`90e2f65b5128c43659d6b43745e0373cbee4d218`（已推送至 `origin/codex/dsh-agent-integration`）
- 父仓库提交：gitlink `a6b6ea20ec2cbc25565b4500ae2606b629b07136`
- 行为变化：新增一级 `type = "dsh"` ACP Agent，默认 `dsh --profile acp` 与 `DeepSeek Harness`，保留用户覆盖的 command、args、display_name、work_dir、env；加入 `no_dsh` 插件注册、构建列表和配置样例。
- 测试命令与退出码：`gofmt -d agent/dsh/dsh.go agent/dsh/dsh_test.go cmd/cc-connect/plugin_agent_dsh.go`（0）；`git diff --check`（0）；`GOPROXY=off go test ./agent/dsh`（1，既有 `gorilla/websocket`、`robfig/cron` 模块未缓存且外部代理不可达）。
- 未覆盖项：`go test ./agent/dsh ./agent/acp ./cmd/cc-connect`、race、全量测试和构建未能执行；registry 集成只能由 Go 门禁覆盖。
- 下一任务：`CC-02`。

### CC-02 — 2026-10-07

- 子模块提交：`604c1abe7593a12d7902802859805d9c1dad4e90`（已推送至 `origin/codex/dsh-agent-integration`）
- 父仓库提交：gitlink `78034bf00eec431f3310827f6241b77d6dabe7e1`
- 行为变化：ACP 初始化能力新增 `sessionCapabilities.resume` 原始字段判断；持久会话按旧 `session/load`、标准 `session/resume`、新建的兼容顺序处理；resume 失败返回上下文错误，resume 响应缺少 ID 时沿用请求 ID；保留旧 load 失败创建新会话的兼容回退。
- 测试命令与退出码：`gofmt -d agent/acp/list_sessions.go agent/acp/session.go agent/acp/session_resume_test.go`（0）；`git diff --check`（0）；`GOPROXY=off go test ./agent/acp`（1，既有 `gorilla/websocket`、`robfig/cron` 模块未缓存且外部代理不可达）。
- 未覆盖项：在线 Go 单测、race、子模块全量门禁和真实 DSH ACP 契约测试待依赖可用后执行。
- 下一任务：`CC-03`。
