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
| CC-03 close 与事件映射 | done | `e0ca09b9c82f82a4470e597dd677ccef7d1301b0` / gitlink `6ea430a355b648582b7518c4afee6bc466b7ba6e` | close、thought、createdAt 单测已写入；Go 测试受模块下载阻塞 |
| CC-04 readiness | done | `c783f2f85a18fca12cbf5821bdbb9e48f7935209` / gitlink `20c9ab256e629b5f29965e4cbfc66946a3a3a6d4` | fake slog handler 覆盖成功一次、全失败零次；CLI 编译受环境阻塞 |
| CC-05 子模块门禁 | done | `c88f4c911902cacaf6d53c28d3c8f160369c0979` / gitlink `62d05be3b11a3cf6a5659ee997df1016e4fdc102` | 包级 test/race 通过；全量受既有失败、依赖网络和缺失 web/dist 阻塞 |
| DESK-01 打包 | done | `8a0e9a7` | sidecar 构建、manifest、Electron 资源映射、发布 CI 和 Windows 资源检查已完成；本机 `dist:dir`、SHA、版本和 macOS codesign 验证通过 |
| DESK-02 路径与完整性 | done | `101b5be` | 新增 sidecar/manifest 路径解析，closure fixture 覆盖 sidecar，packaged smoke 校验 SHA 与 `--version` |
| DESK-03 配置与凭证 | done | `51c7803` | 固定 TOML、非敏感 settings、safeStorage/file 凭证存储和脱敏测试已完成 |
| DESK-04 Supervisor | done | `de5a5cf` | 独立 Sidecar 状态机、ready、stderr/log、脱敏、5 分钟/5 次退避和 SIGTERM→SIGKILL 已完成 |
| DESK-05 App 生命周期 | done | `c63f1e6` | Harness ready 后按配置启动 Sidecar；Safe Mode 停止/恢复；Kernel 切换、恢复和回滚按当前 active kernel 重写配置并重启；退出纳入 Sidecar 停止和 8 秒保护 |
| DESK-06 IPC/Preload | todo | — | — |
| DESK-07 设置页 | todo | — | — |
| QA-01 假 Sidecar E2E | todo | — | — |
| QA-02 DSH ACP 契约 | todo | — | — |
| QA-03 飞书人工验收 | todo | — | — |
| DOC-01 用户文档 | todo | — | — |
| REL-01 最终门禁 | todo | — | — |

## 下一任务

执行 `DESK-06`。接入 IPC/Preload，向设置页提供非敏感配置和状态。

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

### CC-03 — 2026-10-07

- 子模块提交：`e0ca09b9c82f82a4470e597dd677ccef7d1301b0`（已推送至 `origin/codex/dsh-agent-integration`）
- 父仓库提交：gitlink `6ea430a355b648582b7518c4afee6bc466b7ba6e`
- 行为变化：记录 DSH `close` capability；Close 最多等待 2 秒请求 `session/close` 后终止现有 ACP 进程，且重复调用幂等；映射 `agent_thought_chunk` 为 `EventThinking`；支持 RFC3339 `updatedAt` 和 DSH `Date.now()` Unix 毫秒 `createdAt`。
- 测试命令与退出码：随包代码确认 `@deepseek-ai/dsh-acp` 的 `close/list/resume` capability、`agent_thought_chunk` payload 和 `Date.now()` 单位（0）；`gofmt -d agent/acp/list_sessions.go agent/acp/session.go agent/acp/session_close_test.go agent/acp/session_thought_test.go agent/acp/session_list_created_at_test.go`（0）；`git diff --check`（0）；`GOPROXY=off go test ./agent/acp`（1，既有模块未缓存且外部代理不可达）。
- 未覆盖项：在线 ACP 单测、race、子模块全量门禁和真实 DSH 进程契约测试待依赖可用后执行。
- 下一任务：`CC-04`。

### CC-04 — 2026-10-07

- 子模块提交：`c783f2f85a18fca12cbf5821bdbb9e48f7935209`（已推送至 `origin/codex/dsh-agent-integration`）
- 父仓库提交：gitlink `20c9ab256e629b5f29965e4cbfc66946a3a3a6d4`
- 行为变化：所有 engine 完成启动尝试且未走“全部失败退出”路径后，输出一次结构化 `cc-connect ready` 日志并附带项目数；全部失败时不输出，不改变原有退出语义。
- 测试命令与退出码：`gofmt -d cmd/cc-connect/main.go cmd/cc-connect/main_test.go`（0）；`git diff --check`（0）；`GOPROXY=off go test ./cmd/cc-connect`（1，既有 Go 模块未缓存，且 `web/embed.go` 缺少 `web/dist`）。
- 未覆盖项：在线 CLI 单测、race、构建和实际 daemon 启动日志待 Go 依赖与 Web artifact 可用后执行。
- 下一任务：`CC-05`。

### CC-05 — 2026-10-07

- 子模块提交：`c88f4c911902cacaf6d53c28d3c8f160369c0979`（已推送至 `origin/codex/dsh-agent-integration`）
- 父仓库提交：gitlink `62d05be3b11a3cf6a5659ee997df1016e4fdc102`
- 行为变化：无；修复本计划新增 ACP 测试中的常量取址和未使用导入，使包级门禁可执行。
- 测试命令与退出码：`GOPROXY=direct go test ./agent/dsh ./agent/acp`（0）；`GOPROXY=direct go test -race ./agent/dsh ./agent/acp`（0）；`GOPROXY=direct go test ./agent/dsh ./agent/acp ./cmd/cc-connect`（1，CLI 依赖下载超时且缺少 `web/dist`）；`GOPROXY=direct go build ./cmd/cc-connect`（1，同上）；`GOPROXY=direct go test ./...`（1，CLI/platform/web 依赖和 `web/dist` 阻塞，另有既有 `agent/codex` 测试失败）；`GOPROXY=direct go test -race ./...`（1，同样的编译阻塞及既有 Codex/Workspace Skills 测试失败）；`GOPROXY=direct go vet ./...`（1，同样的编译阻塞）；`git diff --check`（0）。
- 未覆盖项：完整 Go 门禁需补齐既有跨平台依赖、构建 `web/dist`，并修复/隔离未改动的 Codex/Workspace Skills 基线失败；这些不属于本计划已允许文件，未擅自修改。`go test ./agent/codex -run '^TestListSkills_ExcludesClaudeDisabledAndCachedSkills$' -count=1` 单独重跑仍失败。
- 下一任务：`DESK-01`。

### DESK-01 — 2026-10-07

- 子模块提交：`c88f4c911902cacaf6d53c28d3c8f160369c0979`（无子模块改动，使用已推送固定提交）
- 父仓库提交：`8a0e9a7`
- 行为变化：新增 `scripts/build-cc-connect.mjs`，在干净子模块中以 `-trimpath`、固定 DSH commit ldflags 和最小 sidecar build tags 构建当前平台二进制；校验 `--version`、生成 SHA-256 manifest 并忽略本地二进制。Electron builder 复制 `resources/cc-connect`，`dist`/`dist:dir` 与 release CI 显式执行 sidecar 构建；Windows installer 检查验证 sidecar 和 manifest，macOS 跳过会改写 Mach-O 的二次签名。
- 测试命令与退出码：`node --check scripts/build-cc-connect.mjs`（0）；`node --check scripts/verify-windows-installer.mjs`（0）；`pnpm run typecheck`（0）；`pnpm run runtime:check`（0）；`pnpm exec node --test test/packaged-resources.test.ts`（0，5 passed）；`pnpm run build`（0）；`GOPROXY=https://goproxy.cn,direct pnpm run cc-connect:build`（0）；`GOPROXY=https://goproxy.cn,direct pnpm run dist:dir`（0）；解包 sidecar SHA 与 manifest（0）；sidecar `--version`（0）；`codesign --verify --deep --strict`（0）。
- 未覆盖项：当前主机未生成 Windows NSIS 安装包，Windows verifier 仅完成脚本语法和静态资源断言；macOS 按现有签名策略不生成根 `resources/manifest.json`，完整 closure manifest 仍由 Windows/Linux `afterPack` 验证。默认 Go proxy/direct 路径超时，成功门禁使用临时环境变量 `GOPROXY=https://goproxy.cn,direct`，未写入仓库配置。
- 下一任务：`DESK-02`。

### DESK-02 — 2026-10-07

- 子模块提交：`c88f4c911902cacaf6d53c28d3c8f160369c0979`（无子模块改动）
- 父仓库提交：`101b5be`
- 行为变化：`paths.ts` 新增 `ccConnectBin()` 和 `ccConnectManifestPath()`，仅从 Electron resources root 拼接固定路径，不搜索 PATH；Windows 使用 `cc-connect.exe`。closure manifest fixture 纳入 `cc-connect/bin` 与 sidecar manifest；packaged smoke 校验 sidecar 文件、SHA-256 和 `--version`。
- 测试命令与退出码：首次测试按 TDD 预期失败（缺少新导出、fixture 计数仍为 3）；`node --check scripts/smoke-packaged.mjs`（0）；`pnpm run typecheck`（0）；`pnpm exec node --test test/paths.test.ts test/closure-manifest.test.ts`（0，11 passed）；`pnpm run smoke:packaged`（0，sidecar SHA、版本和 Electron smoke 均通过）；`git diff --check`（0）。
- 未覆盖项：本机为 macOS，未运行 Windows/Linux 原生 sidecar；Windows closure/installer 实机门禁留给 CI/REL-01。
- 下一任务：`DESK-03`。

### DESK-03 — 2026-10-07

- 子模块提交：`c88f4c911902cacaf6d53c28d3c8f160369c0979`（无子模块改动）
- 父仓库提交：`51c7803`
- 行为变化：新增 `cc-connect-config.ts`，以固定结构生成带 TOML 转义的绝对路径配置，始终写入 `${DSH_CC_CONNECT_FEISHU_SECRET}` 占位符；非敏感 `settings.json` 与 `config.toml` 均原子写入且权限为 0600。新增 `cc-connect-credentials.ts`，优先使用 Electron `safeStorage`，不可用时使用 0600 文件 fallback；支持读取、删除、状态查询，并对错误文本脱敏。
- 测试命令与退出码：TDD 初次运行因两个实现文件不存在退出 1；`pnpm run typecheck`（0）；`pnpm exec node --test test/cc-connect-config.test.ts test/cc-connect-credentials.test.ts`（0，6 passed）；`pnpm exec node --test test/cc-connect-config.test.ts test/cc-connect-credentials.test.ts test/config-file.test.ts`（0，13 passed）；凭证扫描命令（0，只有测试占位符和既有示例命中）；`git diff --check`（0）。
- 未覆盖项：未接入 Supervisor/IPC，尚未验证真实 Electron safeStorage provider；未写入任何真实用户目录或凭证。
- 下一任务：`DESK-04`。

### DESK-04 — 2026-10-07

- 子模块提交：`c88f4c911902cacaf6d53c28d3c8f160369c0979`（无子模块改动）
- 父仓库提交：`de5a5cf`
- 行为变化：新增 `cc-connect-supervisor.ts`，复用 `ManagedChild`/`InFlight` 实现 `disabled → stopped → starting → ready` 以及 `degraded/crashed` 状态；监听 stdout/stderr 的 `cc-connect ready`，记录 0600 rolling log，按 5 分钟窗口最多 5 次重启并采用有界退避；停止执行 SIGTERM 后 5 秒 SIGKILL，启动/停止并发共享 promise，日志和错误脱敏并限长。
- 测试命令与退出码：TDD 初次运行因 supervisor 实现不存在退出 1；`pnpm run typecheck`（0）；`pnpm exec node --test test/cc-connect-supervisor.test.ts`（0，5 passed）；`pnpm exec node --test test/cc-connect-supervisor.test.ts test/supervisor.test.ts`（0，14 passed）；`git diff --check`（0）。
- 未覆盖项：尚未接入真实 Electron App 生命周期、Safe Mode、Kernel 切换和 IPC；测试使用假 Node sidecar，未连接飞书。
- 下一任务：`DESK-05`。

### DESK-05 — 2026-10-07

- 子模块提交：`c88f4c911902cacaf6d53c28d3c8f160369c0979`（无子模块改动）
- 父仓库提交：`c63f1e6`
- 行为变化：主进程仅在设置启用、配置完整、Harness 已 ready 且非 Safe Mode 时生成配置并启动 cc-connect；进入 Safe Mode 停止 Sidecar，退出后随 Harness 恢复；Kernel install/restore/rollback 后按当前 active DSH bin 重写 TOML 并重启 Sidecar；退出流程把 Sidecar stop 纳入已有 8 秒总保护。新增生命周期静态接线检查。
- 测试命令与退出码：`node --test test/cc-connect-lifecycle.test.ts`（0，2 passed）；`pnpm run typecheck`（0）；相关 Desktop 测试（0，34 passed）；`pnpm run runtime:check`（0）；`pnpm test`（0，324 passed）；`pnpm run test:coverage`（0，88.72% 行覆盖、81.38% 分支覆盖、84.31% 函数覆盖）；`pnpm run build`（0）；`pnpm run smoke:packaged`（0，sidecar SHA/版本和 Electron smoke 通过）；`git diff --check`（0）。
- 未覆盖项：生命周期测试未启动真实 Electron App，使用源码接线检查；Sidecar 运行仍由 DESK-04 假进程测试覆盖。未连接飞书、未写入真实用户目录或凭证；Windows/Linux 原生打包仍待跨平台门禁。
- 下一任务：`DESK-06`。
