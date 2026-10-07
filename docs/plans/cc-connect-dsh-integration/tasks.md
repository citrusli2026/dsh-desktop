# 原子任务清单

任务按顺序执行。除非当前任务明确允许，不跨任务修改文件。每个任务单独提交。

## P0：决策与边界

### PLAN-01：记录产品边界变更

目标：新增 ADR 0033，明确消息连接是用户主动启用的 Desktop Sidecar，Harness 仍拥有 Agent 与会话语义。

允许修改：

- `docs/decisions/0033-cc-connect-sidecar.md`
- `docs/decisions/0033-cc-connect-sidecar.zh.md`
- `docs/decisions/README.md`

ADR 必须覆盖：进程边界、同一 DSH_HOME、只在设置页出现、Safe Mode 行为、凭证边界、首版范围，以及对 ADR 0023/0030 的局部补充。

验收：文档链接有效；没有宣称功能已经实现。

## P1：cc-connect 子模块

### CC-01：注册一级 DSH Agent

目标：`type = "dsh"` 可创建基于通用 ACP 的 Agent。

允许修改：

- `third_party/cc-connect/agent/dsh/dsh.go`
- `third_party/cc-connect/agent/dsh/dsh_test.go`
- `third_party/cc-connect/cmd/cc-connect/plugin_agent_dsh.go`
- `third_party/cc-connect/Makefile`
- `third_party/cc-connect/config.example.toml`
- 与 Agent 列表直接相关的 README 行

实现要求：

- 参照 `agent/devin`，嵌入 `*acp.Agent`。
- `Name()` 返回 `dsh`。
- 默认 `command=dsh`、`args=[--profile, acp]`、`display_name=DeepSeek Harness`。
- 显式用户配置优先；nil map 不 panic。
- build tag 为 `no_dsh`，加入 `ALL_AGENTS`。

测试：默认值、用户覆盖、nil options、Name、display name；测试使用 `true` 或平台等价假命令，不要求安装全局 dsh。

提交建议：`feat(dsh): add first-class ACP agent`

### CC-02：支持标准 session/resume

目标：DSH 持久会话可以通过 `/switch` 恢复，旧 ACP 服务的 `session/load` 不回归。

允许修改：

- `third_party/cc-connect/agent/acp/agent.go`
- `third_party/cc-connect/agent/acp/list_sessions.go`
- `third_party/cc-connect/agent/acp/session.go`
- `third_party/cc-connect/agent/acp/*_test.go`

实现要求：

- `sessionCapabilities.resume` 用 `json.RawMessage` 判断“字段存在”，因为 `{}` 是合法 capability。
- resume ID 存在时：服务声明 `loadSession` 则走旧方法；否则声明 `resume` 则调用 `session/resume`；均不支持才创建新会话。
- `session/resume` 参数包括 sessionId、绝对 cwd、空 mcpServers。
- DSH resume 响应可以没有 sessionId；成功后使用请求中的 ID。
- RPC 失败应返回带上下文的错误，不能静默创建新会话。只有旧 `session/load` 当前既有的兼容回退行为可以保留，并需要测试锁定。

测试：fake ACP server 分别覆盖 load、resume、两者都无、resume 错误、resume 响应无 ID。

提交建议：`fix(acp): resume standard persistent sessions`

### CC-03：优雅关闭和 DSH 事件映射

目标：关闭前请求 DSH 刷盘，并正确显示 DSH 思考事件。

允许修改同 CC-02。

实现要求：

- 记录 `sessionCapabilities.close`。
- `Close()` 至多等待 2 秒调用 `session/close`，然后执行现有 cancel/kill/wait。
- Close 保持幂等；不能让 read loop 和 WaitGroup 死锁。
- `agent_thought_chunk` 映射为 `core.EventThinking`。
- `session/list` 同时接受 `updatedAt` RFC3339 与 DSH 数值 `createdAt`；单位以 DSH 协议/实现测试确认，不猜测。

测试：close success、timeout、unsupported、重复 close、thought chunk、createdAt。

提交建议：`fix(acp): close DSH sessions and map thought updates`

### CC-04：增加稳定 readiness 日志

目标：Desktop 不依赖模糊的单项目日志推断 cc-connect 是否完成启动。

允许修改：

- `third_party/cc-connect/cmd/cc-connect/main.go`
- `third_party/cc-connect/cmd/cc-connect/main_test.go`

实现要求：所有 project engine 完成启动流程后输出一次结构化 slog 消息 `cc-connect ready`，附带 project 数量。启动失败退出时不输出。不要改变 daemon/CLI 的退出语义。

测试：提取一个纯函数或可注入 logger，断言成功一次、失败零次；不要启动真实平台。

提交建议：`feat(cli): expose stable supervised readiness log`

### CC-05：子模块全量门禁与提交

不写功能。运行 `validation.md` 的 CC 门禁，修复仅限前述任务引入的问题。提交所有子模块改动，记录 SHA，并推送 `codex/dsh-agent-integration`。随后在父仓库提交新的 gitlink。

## P2：Desktop 打包基础

### DESK-01：构建并打包 cc-connect

目标：开发者和 CI 能从固定子模块提交生成当前目标平台的二进制。

允许修改：

- `scripts/build-cc-connect.mjs`
- `package.json`
- `electron-builder.yml`
- `test/packaged-resources.test.ts`
- 与 Windows 安装包资源检查直接相关的脚本/测试
- 生成的 `resources/cc-connect/manifest.json`；二进制按现有 ignore 策略处理

实现要求见 README 6.1。脚本必须检查子模块存在、工作树是否干净、Go 是否可用、输出是否可执行、`--version` 是否成功，并生成 SHA-256。错误信息给出修复命令。

提交建议：`build: package pinned cc-connect sidecar`

### DESK-02：路径与完整性

目标：主进程可以解析开发/打包环境的 Sidecar 路径，closure 检查包含它。

允许修改：

- `src/main/paths.ts`
- `test/paths.test.ts` 或对应现有路径测试
- `test/closure-manifest.test.ts`
- `scripts/smoke-packaged.mjs`

新增 `ccConnectBin()` 和 `ccConnectManifestPath()`。Windows 文件名必须为 `.exe`。不得用 PATH 搜索捆绑 Sidecar。

提交建议：`feat(shell): resolve bundled cc-connect runtime`

## P3：Desktop 配置与进程

### DESK-03：非敏感设置和 Secret 存储

目标：生成不含明文 Secret 的 cc-connect 配置。

允许修改：

- `src/main/cc-connect-config.ts`
- `src/main/cc-connect-credentials.ts`
- 对应 `test/*.test.ts`

测试必须覆盖：TOML 转义、绝对路径、`${DSH_CC_CONNECT_FEISHU_SECRET}` 原样写入、0600/原子写、加解密、不可用 fallback、删除 Secret、任何错误文本脱敏。

不要自行实现 TOML 通用解析器；只生成本功能拥有的固定配置结构。

提交建议：`feat(connect): persist settings and protected credentials`

### DESK-04：Sidecar Supervisor

目标：实现 README 6.3 的状态机和生命周期。

允许修改：

- `src/main/cc-connect-supervisor.ts`
- `src/main/process-lifecycle.ts`，仅当现有 primitive 缺少可复用能力
- 对应单元测试和测试 fixture

使用假可执行脚本测试 readiness、stderr 分行、崩溃退避、预算耗尽、stop、并发 start/stop、Secret 脱敏。测试中不得连接飞书。

提交建议：`feat(connect): supervise messaging sidecar`

### DESK-05：接入 App 生命周期

目标：在 `src/main/index.ts` 初始化、Safe Mode、Kernel 切换和退出流程中接入 Supervisor。

允许修改：

- `src/main/index.ts`
- 必要的现有生命周期测试

验收：未配置或 disabled 时不启动；Web ready 后启动；Safe Mode 停止/恢复；quit Promise 包含 Sidecar stop；总退出保护仍为 8 秒；Kernel install/restore 后使用当前 active kernel。

提交建议：`feat(connect): bind sidecar to desktop lifecycle`

## P4：Desktop API 与界面

### DESK-06：主进程 IPC 与 Preload

目标：实现 README 6.4 的窄接口。

允许修改：

- `src/preload/index.ts`
- `src/main/index.ts`
- 新增的 Connect 类型文件
- IPC 单元/E2E 测试

所有 handler 使用 `isMainWindowHarnessSender`。保存操作允许 Renderer 写入新 Secret，但没有读回接口。workspace 使用原生目录选择器并验证绝对目录。

提交建议：`feat(connect): expose guarded desktop bridge`

### DESK-07：设置页

目标：在 `settings.section` 增加消息连接配置。

允许修改：

- `plugins/dsh-desktop-controls/lib/client.js`
- `plugins/dsh-desktop-controls/README.md`
- `test/desktop-controls.test.ts`
- `e2e/electron-shell.spec.ts`

按现有 bundle 风格实现，不引入新的 UI 框架。Secret 输入保存成功后清空。按钮在 busy 时禁用。桥不存在时显示托盘/设置说明，不能抛错。

提交建议：`feat(connect): add Feishu settings surface`

## P5：端到端与交付

### QA-01：假 Sidecar E2E

覆盖：初始 disabled、保存设置、启动 ready、重连、崩溃错误、停止、Safe Mode。使用环境变量把 Sidecar 路径指向测试 fixture；生产路径不可受普通 Renderer 输入影响。

### QA-02：真实 DSH ACP 契约测试

从 Desktop 捆绑 Node 和当前 active DSH bin 启动 `--profile acp`，使用临时 DSH_HOME。至少验证 initialize capability、session/new、prompt mock、session/list、session/resume、session/close。若需要模型，使用 DSH 测试 patch/mock route，不使用真实账户。

### QA-03：人工飞书验收

只在自动门禁通过后进行。真实凭证通过应用 UI 输入，不写测试 fixture或 progress。记录脱敏证据：连接时间、会话 ID 后 6 位、操作步骤和结果。

### DOC-01：用户文档与发布说明

说明飞书后台要求、启动/停止、Safe Mode、数据位置、已知限制、如何查看脱敏日志、如何彻底禁用和删除凭证。

### REL-01：最终门禁

运行 `validation.md` 全部命令；确认父仓库和子模块干净；确认父仓库 gitlink 指向已推送的子模块提交。只生成本地 unpacked 构建，不创建 tag、不发布 Release。
