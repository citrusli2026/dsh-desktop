# Post shell.15 遗留与迭代计划

> 创建于 2026-08-17。基于 shell.14/15 审查-加固-发布的完整迭代，记录遗留事项
> 与后续路线。每项标注优先级、预估工作量和前置条件。

## 1. 遗留事项

### 1.1 GitCode 国内镜像补齐（shell.15）

| 项 | 值 |
|---|---|
| 优先级 | 高（用户可见，影响国内下载体验） |
| 预估 | ~15 分钟（维护者手动） |
| 前置 | 维护者需已登录 gitcode.com 的 Edge/Chromium 浏览器会话 |
| 状态 | ✅ 已补齐（2026-08-17） |

### 1.2 HANDOFF 文档结构整理

| 项 | 值 |
|---|---|
| 优先级 | 中 |
| 预估 | 30 分钟 |
| 状态 | ✅ 已完成（2026-08-17） |

历史 shell 小节已折叠到 `docs/HANDOFF-archive.md`，根 HANDOFF 精简为最近两版 + 运维速查。同步清理了 `docs/HANDOFF.md` 中的重复内容。

---

## 2. 迭代路线

### 近期（下一个 shell 候选）

| # | 项 | 优先级 | 预估 | 说明 |
|---|---|---|---|---|
| A | 修复 `sk-` 正则 word boundary | 低 | 10min | `\bsk-...\b` 末尾 `\b` 在 `-` 后可能提前断开；OpenAI 实际 key 不以 `-` 结尾，但理论上 token 截断 |
| B | LAN 子进程 stdout 多行 chunk 测试 | 低 | 15min | 已改为 readline，但无测试覆盖；加一个 proxy stub 输出多行的 case |
| C | supervisor `cwd` 集成断言 | 低 | 15min | 现有 supervisor 测试用 `process.execPath`（无 cwd 依赖），可加一个 fixture 断言子进程 cwd 确为注入值 |

### 中期

| # | 项 | 优先级 | 预估 | 说明 |
|---|---|---|---|---|
| D | 发布资产校验器 CLI 独立化 | 中 | 1h | 把 `check-release-assets.mjs` 的 `validateReleaseAssets()` 拆成独立包/命令，方便用户下载后自行校验；官网加"如何校验下载完整性"小节。✅ 已完成（2026-08-17）：`bin/dsh-validate-release.mjs` + `package.json` bin 注册 + FAQ 新增校验说明 |
| E | `fs.watch` 可靠性改进 | 中 | 30min | `locale.ts` 用 `fs.watch` 监听 settings.yaml，vim 等编辑器临时文件替换会丢事件；改用 chokidar 或加 1-2s stat 兜底轮询。需先完整读 locale.ts 确认是否已有兜底 |
| F | 资产 provenance / SBOM | 中-高 | 2-4h | bundled Node 有 SHA-256 pin，harness closure 来自 pnpm lockfile；可生成 SLSA provenance 或 CycloneDX SBOM 随 Release 发布。需新 ADR |
| G | GitHub API rate limit 持久化 token | 低 | 30min | `DSH_DESKTOP_GH_TOKEN` 已支持环境变量注入；可扩展为 settings.yaml 配置项，UI 提示未认证时的 rate limit 风险 |

### 远期 / 战略级

| # | 项 | 优先级 | 预估 | 说明 |
|---|---|---|---|---|
| H | macOS 签名与公证 | 高（产品） | 1-2天 | 启用 macOS 原地更新的前置条件；需 Apple Developer ID 证书（$99/年）+ notarization 工作流 + CI secrets。需新 ADR |
| I | Linux 发行版评估 | 低 | 需评估 | 当前只发 macOS + Windows；加 Linux AppImage/deb 会扩大 Release 资产面（违背 ADR 0016），需明确需求量后决定 |
| J | harness UI 标题协商协议 | 低 | 需协调 | `page-title-updated` 全屏蔽 harness 标题；若 harness 想显示 workspace 名，可做 postMessage 协议。需和 upstream dsh 协调 |

---

## 3. 决策待定

| 决策 | 选项 | 影响 |
|---|---|---|
| GitCode 镜像自动化 | A) 维持手动 B) 国内 self-hosted runner C) GitCode webhook 拉取 | 手动最简单但易遗漏；runner 有成本；webhook 受限于 GitCode API |
| HANDOFF 结构 | A) 维持追加式 B) 折叠历史 C) 只保留最近两版 | A 最省力但越来越乱；B/C 需一次性整理 |
| macOS 签名时机 | A) 现在 B) 累计 100+ 用户后 C) 社区赞助后 | $99/年成本；A 最快解锁原地更新；B/C 等需求确认 |
| SBOM 格式 | A) CycloneDX B) SPDX C) SLSA provenance only | C 最轻量；A/B 更完整但维护成本高 |

---

## 4. 下一步行动建议

如果继续迭代，推荐按以下顺序：

1. **GitCode 镜像补齐**（#1.1）— 这是用户可见的交付缺口，shell.13/14/15 三个版本
   都没镜像。越早补越好。
2. **HANDOFF 整理**（#1.2）— 30 分钟内可完成，降低新维护者上手成本。
3. **#D 发布资产校验器 CLI 独立化** — 中等工作量，提升供应链透明度，和 SBOM 方向一致。
4. **#H macOS 签名** — 如果社区有明确需求量，这是最有产品价值的单一改进。

要执行哪一项告诉我。
