# 项目文档索引与治理

> 本文档是 `dsh-desktop` / `dsh-electron-shell` 仓库的文档入口和维护约定。
> 更新任何文档前，先阅读本页；目标是让“当前代码基线”“最新已发布版本”和
> “历史记录”始终可区分、可追溯。

## 文档地图

| 文档 | 内容 | 维护时机 |
|---|---|---|
| `README.md` / `README.zh.md` | 面向用户：特性、下载、开发、镜像 | 功能、下载方式或开发流程变化时 |
| `HANDOFF.md` | 官网、发布、镜像、运维的当前事实 | 每次发布、镜像或官网调整后 |
| `docs/HANDOFF.md` | 产品架构、验证契约、版本交接 | 每次代码基线或验证门禁变化后 |
| `docs/decisions/README.md` | ADR 索引 | 新增决策记录时 |
| `docs/plans/*.md` | 迭代计划 / 历史输入 | 计划完成或调整时更新状态 |
| `site/README.md` | 官网维护与部署 | 官网结构或部署方式变化时 |
| `docs/rename-to-dsh-electron-shell.md` | 历史改名计划 | 只读历史，不重写 |

## 版本术语

- **代码基线**：`package.json` 的 `version`，即当前 `main` 分支/最新提交对应的壳版本，可能尚未发布。
- **已发布版本**：GitHub Releases 中实际存在、且 `site/data/release.json` 已指向的 tag。
- 文档必须显式区分二者，避免把未发布的维护内容写成已发布内容，或把历史版本写成当前基线。

## 发布时文档更新清单

1. `node scripts/version.mjs bump shell` 后，同步更新：
   - `HANDOFF.md` 当前状态表中的“代码基线 / 最新已发布”；
   - `docs/HANDOFF.md` 头部和对应 shell 小节；
   - `docs/plans/electron-shell-capabilities.md` 的状态与迭代列表。
2. Release 创建并完成 `Site Data Refresh` 后：
   - 将“代码基线”更新为“已发布”，回填 CI / Release / Refresh run、tag commit、镜像状态；
   - 确认 `site/data/release.json` 已指向新 tag。
3. 用户可见变化同步更新 `README.md` 和 `README.zh.md`。
4. 历史 ADR 与历史计划不改写；新结论用新 ADR 或新计划记录。

## 一致性检查

- 所有 Markdown 本地链接有效。
- 全库搜索 `shell.<N>` 时，文档中的“当前 / 最新”只能有一个版本口径。
- 发布资产口径统一：GitHub 严格 6 个文件（两个安装包 + 两个 `.sha256` + `latest.yml` + `.exe.blockmap`）；GitCode 只镜像前 4 个。
- 不提交硬编码本机绝对路径（如 `/Users/...`）。
- 中英 README 的功能、下载、开发章节保持同步。

## 文档审查建议

每次 PR 若涉及文档，建议执行：

```sh
pnpm run site:check
```

并手动检查：

- `grep -RIn "shell\." --include='*.md' docs HANDOFF.md README.md README.zh.md`
- `docs/plans/electron-shell-capabilities.md` 的状态是否为当前基线
- `HANDOFF.md` 与 `docs/HANDOFF.md` 是否记录了最新发布/待发布边界
