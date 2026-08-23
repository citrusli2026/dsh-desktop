# 项目文档索引与治理

> 本文档是 `dsh-desktop` / `dsh-electron-shell` 仓库的文档入口和维护约定。
> 更新任何文档前，先阅读本页；目标是让"当前代码基线""最新已发布版本"和
> "历史记录"始终可区分、可追溯。

## 文档地图

| 文档 | 内容 | 维护时机 |
|---|---|---|
| `README.md` / `README.zh.md` | 面向用户：产品、下载、开发（官网为第一入口） | 功能、下载方式或开发流程变化时 |
| `HANDOFF.md` | **运维核心**：当前状态、发布流程、速查、版本记录 | 每次发布、镜像或官网调整后 |
| `docs/ARCHITECTURE.md` | 产品架构、源码职责、验证契约 | 架构或门禁变化时 |
| `docs/decisions/README.md` | ADR 索引 | 新增决策记录时 |
| `docs/test-hardening-plan.md` | 测试完善迭代规划（v0.1.1-rc.2.shell.2，P0/P1/P2 工作项） | 测试门禁变化或迭代推进时 |
| `docs/seo-follow-up.md` | 官网 SEO 后续路线、Search Console 验证和 30/60/90 天增长任务 | SEO 数据、收录状态或内容计划变化时 |
| `CONTEXT.md` | 领域词汇与单上下文入口（agent 快速对齐） | 术语或概念变化时 |
| `site/README.md` | 官网维护与部署 | 官网结构或部署方式变化时 |

## 版本术语

- **代码基线**：`package.json` 的 `version`，即当前 `main` 分支/最新提交对应的壳版本，可能尚未发布。
- **已发布版本**：GitHub Releases 中实际存在、且 `site/data/release.json` 已指向的 tag。
- 文档必须显式区分二者，避免把未发布的维护内容写成已发布内容，或把历史版本写成当前基线。

## 发布时文档更新清单

1. `node scripts/version.mjs bump shell` 后，同步更新：
   - `HANDOFF.md` 当前状态表中的"代码基线 / 最新已发布"。
2. Release 创建并完成 `Site Data Refresh` 后：
   - 将"代码基线"更新为"已发布"，回填 CI / Release / Refresh run、tag commit、镜像状态；
   - 确认 `site/data/release.json` 已指向新 tag。
3. 用户可见变化同步更新 `README.md` 和 `README.zh.md`。
4. 历史 ADR 不改写；新结论用新 ADR 记录。

## 一致性检查

- 所有 Markdown 本地链接有效。
- 全库搜索 `shell.<N>` 时，文档中的"当前 / 最新"只能有一个版本口径。
- 发布资产口径统一：GitHub 严格 8 个文件（三个安装包 + 三个 `.sha256` + `latest.yml` + `.exe.blockmap`）；GitCode 只镜像其中 6 个（三个安装包 + 三个 `.sha256`）。
- 不提交硬编码本机绝对路径（如 `/Users/...`）。
- 中英 README 的功能、下载、开发章节保持同步。

## 文档审查建议

每次 PR 若涉及文档，建议执行：

```sh
pnpm run site:check
```

并手动检查：

- `grep -RIn "shell\." --include='*.md' docs HANDOFF.md README.md README.zh.md`
- `HANDOFF.md` 是否记录了最新发布/待发布边界
