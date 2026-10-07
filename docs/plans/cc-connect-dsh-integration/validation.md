# 验证矩阵

每个命令记录退出码和必要摘要。不要把“命令未运行”“测试跳过”记成通过。

## 1. Git 与子模块

```bash
git status --short --branch
git submodule status
git -C third_party/cc-connect status --short --branch
git -C third_party/cc-connect log -1 --oneline --decorate
git diff --submodule=log
```

预期：父仓库在 `codex/cc-connect-dsh-integration`；子模块开发时在 `codex/dsh-agent-integration`，最终无未提交文件；gitlink SHA 已存在于可访问远端。

全新检出复现：

```bash
git submodule sync --recursive
git submodule update --init --recursive
```

## 2. cc-connect 快速门禁

在 `third_party/cc-connect`：

```bash
changed_go="$(git diff --name-only --diff-filter=ACMR origin/main...HEAD -- '*.go')"
test -z "$changed_go" || printf '%s\n' "$changed_go" | xargs gofmt -w
go test ./agent/dsh ./agent/acp ./cmd/cc-connect
go test -race ./agent/dsh ./agent/acp
go build ./cmd/cc-connect
```

仅格式化本任务实际修改的 Go 文件；不要因此改写无关文件。

## 3. cc-connect 全量门禁

```bash
go test ./...
go test -race ./...
go vet ./...
```

如果全量 race 受已知上游耗时或环境限制失败，保存具体包、测试名和错误；仍需保证本任务包的 race 通过。

## 4. DSH ACP 本机探测

不要使用用户真实 DSH_HOME：

```bash
probe_home="$(mktemp -d)"
DSH_HOME="$probe_home" \
  resources/harness/node/bin/node \
  resources/harness/node_modules/@deepseek-ai/dsh/lib/bin.js \
  --profile acp --help
```

预期：退出 0；临时目录生成 `profiles/acp`；stdout 只有帮助文本。协议契约测试由 QA-02 提供自动客户端。

## 5. Desktop 快速门禁

```bash
pnpm run typecheck
node --test \
  test/cc-connect-config.test.ts \
  test/cc-connect-credentials.test.ts \
  test/cc-connect-supervisor.test.ts \
  test/desktop-controls.test.ts \
  test/packaged-resources.test.ts
```

文件尚未创建时只运行当前任务已经存在的子集，不提前建立空测试文件。

## 6. Desktop 全量门禁

```bash
pnpm run runtime:check
pnpm run test:coverage
pnpm run build
pnpm run cc-connect:build
pnpm run dist:dir
pnpm run smoke:packaged
pnpm run smoke:packaged-ui
```

`pnpm run build` 依赖 dsh-mobile-shell Web artifact；缺失时按现有项目说明准备，不修改脚本绕过。

## 7. 打包形状

对 unpacked 目录检查：

```bash
find dist -path '*resources/cc-connect*' -maxdepth 8 -type f -print
```

必须存在：

- `resources/cc-connect/bin/cc-connect` 或 `cc-connect.exe`
- `resources/cc-connect/manifest.json`
- `resources/manifest.json`

核对 cc-connect 二进制 SHA-256 与两个 manifest 中记录一致，并运行打包后的 `cc-connect --version`。

## 8. Secret 与配置扫描

```bash
rg -n --hidden --glob '!third_party/cc-connect/.git' \
  'app_secret\s*=\s*"(?!\$\{)|DSH_CC_CONNECT_FEISHU_SECRET=.+' \
  . --pcre2
```

允许命中测试中的明显假值和文档占位符；逐条检查。禁止提交：真实 `cli_...`、App Secret、token、用户当前配置内容、解密后的 fixture。

另外检查生成配置的自动测试：

- TOML 中只有 `${DSH_CC_CONNECT_FEISHU_SECRET}`。
- 日志和 `lastError` 不含传入的假 Secret。
- diagnostics 不包含 Sidecar 环境。

## 9. Electron E2E

```bash
pnpm run test:e2e -- --grep "cc-connect|message connection|Safe Mode"
```

假 Sidecar 必须覆盖：

1. disabled 不启动；
2. 保存后启动并进入 ready；
3. stop 后进程退出；
4. crash 显示脱敏错误并按预算重启；
5. 进入 Safe Mode 停止，退出后恢复；
6. App quit 不残留子进程。

## 10. 人工飞书验收

自动门禁全部通过后执行：

1. 新建消息触发新 DSH 会话。
2. 执行会产生工具调用的只读任务，确认卡片/文本更新。
3. 发 `/stop`，确认当前 turn 取消且连接存活。
4. 发 `/ls`，选择一个已关闭会话并 `/switch` 恢复。
5. 触发一次权限请求，分别验证允许或拒绝中的一种；另一种由自动 fake ACP 测试覆盖。
6. 重启 Desktop，确认 enabled 状态恢复且 Secret 无需重新输入。
7. 进入/退出 Safe Mode，确认连接按设计停止和恢复。

记录中不得粘贴飞书 App ID 全值、Secret、用户消息正文或完整会话路径。
