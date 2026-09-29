# B 路线：基于官方桌面版维护少量补丁

状态：执行计划，尚未实现。分支：`codex/official-desktop-patches`。先读[双路线入口](../2026-09-29-dual-track.md)，再读[任务拆分](tasks.md)、[验证规范](validation.md)、[进度](progress.md)。

## 1. 最终交付物

从固定版本的官方 `deepseek-harness` 构建一个可与现有社区版并存的实验应用。官方继续拥有 Agent、Host、WebUI、浏览器、Office、账号和正常退出逻辑。我们只维护产品隔离、实验发布设置和至多一个小型诊断扩展。

第一阶段完成的含义：

- 从干净目录按锁定 SHA 和补丁顺序可重复构建；没有未记录的手工源码改动。
- macOS arm64 的开发启动和独立 `.app`、Windows x64 未签名安装器有实际验证记录；未取得 Windows runner 前该项保持 blocked，不以 macOS 通过替代。
- 保留官方核心界面、原生目录、浏览器、Office runtime、插件管理和退出任务保护。
- 实验应用不覆盖现有社区版/官方版，不占用官方 `dsh://` 或系统 `dsh` 命令，不读写真实 `~/.dsh` 或 `~/.dsh-desktop`。
- 不连接官方更新发布、强制更新测试平台，不要求官方签名/COS/飞书配置；模型 API 和用户主动账号操作仍是独立功能。
- 发布侧当前仅生成本地产物或手动 CI artifacts；默认无自动更新、无默认产品事件采集。保持模型/账号授权和渲染器安全校验。
- 补丁规模可测，能在另一个明确的上游提交上重放并记录成本。

不把线上登录、签名、公证、Linux 安装包列为本阶段已保证能力；其状态必须在验收表中单列。

## 2. 固定架构选择

当前 Worktree 保留社区仓库作为补丁和构建脚本的管理层。官方源码检出到独立、被忽略的缓存，不把官方 monorepo 整体复制进本仓库历史，也不让根 `package.json` 变成官方 monorepo。

计划目录（待 B01 创建）：

```text
official-desktop/
  upstream.lock.json        # repo、完整 SHA、上游版本、Node 主版本、pnpm 精确版本
  product.json              # 实验身份与固定策略；无密钥
  patches/series.json       # 有序补丁、sha256、理由、对应测试、退役条件
  patches/0001-*.patch
  scripts/prepare.mjs       # 校验来源、准备干净源码并重放补丁
  scripts/verify.mjs        # 补丁边界 + 应用配置检查，分层调用上游测试
  scripts/launch.mjs        # 受控环境、临时数据根和开发启动
  scripts/package.mjs       # 显式平台目标，社区实验打包入口
  test/*.test.mjs           # 管理层测试；使用临时 Git 仓库和伪工具
  evidence/*.md             # 精简、脱敏、可提交的验证报告
.cache/official-desktop/    # 源码 clone / 本地包管理器工具，被忽略
.artifacts/official-desktop/ # 日志、应用和 smoke 数据，被忽略
```

根项目仍按 `pnpm@10.33.2` 工作；官方源码按其锁定的 `pnpm@11.7.0` 工作。分别运行，不修改用户全局 pnpm，不把社区仓库的 pnpm 11 禁用经验直接变成改写上游锁文件的理由。

上游首次锁定：

```text
repo    https://github.com/deepseek-ai/deepseek-harness.git
commit  639ed015397290b3745d163aafe02ffee4aa3f84
version 0.2.0-rc.2
Node    24（具体版本在 B02 记录）
pnpm    11.7.0
```

源码目录使用独立 Git 仓库。每个补丁是普通 `git diff --binary`，按 series 顺序 `git apply --check` 后应用；运行前确认完整 SHA、干净基线和补丁 hash。应用失败即停止，禁止 `--reject`、模糊查找替换和忽略失败后继续构建。重建缓存前检查没有未导出的手工修改；不得无条件 `reset --hard`/`clean -fdx`。

原有研究 clone 只作为只读参考，不能作为隐式构建依赖。可复现构建必须仅依赖 lock、patches、公开上游、记录的工具链。

## 3. 产品身份和数据约定

| 项 | 实验值/策略 |
|---|---|
| 应用显示名 | `dsh-desktop Experimental`；显式标注社区构建 |
| appId | `io.github.citrusli2026.dsh-desktop.experimental`，仅实验应用使用 |
| 内部 Web origin | 保留官方 `dsh-app://app`，不全局替换，避免破坏认证/preload 判断 |
| 外部 URL scheme | 初版不注册，不响应官方 `dsh://open`；登录完成后可手动回窗口 |
| CLI 命令注册 | 实验模式不提供 Install/Repair/Remove 系统 `dsh` 的入口 |
| `DSH_HOME` | 每次 smoke 的专用临时目录；交互实验使用独立实验目录 |
| Electron userData | 独立于官方/现有壳；打包态也必须有效，不能只依赖 dev 启动参数 |
| 随包版本 | 保留上游 shell/kernel 版本一致性；另用 metadata 记录 community patch revision |
| 产物名 | 必须含 `experimental`、平台、架构、上游版本及 patch revision |
| 更新策略 | 本阶段禁用检查/下载/安装及 mandatory-policy 轮询，显示“实验版手动获取构建” |
| 产品分析 | 实验配置默认关闭 product analytics；不据此宣称全部网络访问都被禁用 |
| 用户凭证 | 不自动读取/复制现有凭证，不扫描真实 DSH_HOME；交互用户自行配置 |

现有主干 appId 不变；这是隔离实验应用的新身份，不是重命名现有产品。

## 4. 补丁预算

以 `git diff <upstream SHA>` 的实际变化计算；同一文件拆成多个补丁不会减少统计值。

| 编号 | 唯一职责 | 首轮目标 |
|---|---|---|
| P01 | 实验身份、路径、协议/CLI 注册隔离 | 必需 |
| P02 | 实验模式无远程更新/mandatory policy，默认官方模式保持原行为 | 必需 |
| P03 | 独立实验打包入口，macOS ad-hoc/Windows unsigned | 必需 |
| P04 | 实验产品分析默认关闭；若 P01 的配置注入即可完成则不新增补丁 | 必需但可合并配置 |
| P05 | 只读诊断导出，至多一个原生菜单入口 | 后置；超预算则延后 |

审查阈值：最多 5 个生产补丁；修改已有上游生产文件不超过 15 个；净计新增+删除生产行不超过 800 行。测试、文档和新增配置单独报告，不用来隐藏生产代码。新建生产文件计入 800 行预算。这里是触发复审的工程预算，不是质量评分；超过时先写原因，不压缩代码或取消测试来达标。

初版禁止修改 `packages/core`、Agent loop、会话持久化、默认工具行为、模型供应商授权；不迁入 kernel overlay、垃圾桶/删除钩子、LAN/mobile-shell、独立插件市场、旧 controls 大面板。共享业务代码有必要修改时，先记录具体阻塞证据，停止该扩展，不让小补丁演化为内核 fork。

## 5. 阶段顺序

```text
B00 基线与约束
  → B01 源码/补丁管理
  → B02 原样构建（不启动 GUI）
  → B03 身份/数据/协议隔离
  → B04 社区实验发布策略
  → B05 第一次真实开发启动
  → B06 macOS 独立实验应用
  → B07 Windows 实验安装器
  → B08 核心功能回归
  → B09 小型诊断扩展（预算允许）
  → B10 最小 CI 与产物审计
  → B11 上游补丁重放演练
  → B12 是否继续与下一阶段建议
```

B07 缺 Windows 环境时，可以继续不依赖它的诊断设计、补丁统计、Linux 可行性记录；不得把整个 MVP 标为完成。B09 可以以“因预算明确延后”结束，但不得声称功能已交付。

## 6. 已知工程障碍

- 上游 macOS 开发 launcher 会生成 `.app` 并注册 `dsh://`。因此 B02 只能 build，首次 GUI 启动必须等 B03 完成。
- 上游打包器在准备阶段也要求 mandatory-policy origin；macOS `--dir` 同样可能先校验签名/公证环境。不能靠填写假生产地址或假证书解决。
- 上游开发与打包运行时均需要 primary runtime，包含 Python/Node/Office 资源。不能为了先启动而删掉校验或 stub 掉整个 Office 功能。
- `DSH_DESKTOP_USER_DATA_DIR` 在 dev launcher 被转为 `--user-data-dir`；不能假设打包应用会自动消费相同环境变量。
- 新应用必须保留 `dsh-app://app` 和 Host 认证流程；外部 `dsh://` 与内部应用 origin 是两件事。
- 官方 Host 默认端口为 19387。实验启动通过支持的配置选择独立端口（优先端口 0）；验证实际能力，不杀掉其他 DSH 进程抢端口。
- 官方构建/发布参数存在来自 `.env.macos`/`.env.windows` 的读取逻辑；管理层生成最小实验配置，不读取用户私有官方配置，也不打印全量环境变量。

## 7. 阶段终点

MVP 是“官方主体可重复构建 + 少量补丁 + 并存隔离 + 两个平台证据”。不是立刻取代社区主干。

B12 必须明确列出：补丁行数、触及文件、构建耗时/缓存大小、平台实测结果、登录与 Office 的真实覆盖、尚未实现的旧版特性、Linux 成本，以及一次上游更新重放成本。只有这些结果支持维护优势时，才提出后续迁移/发布计划。

现有 ADR 0001/0026 仍适用于 A 路线。B00 写独立实验决策，说明这个实验允许采用官方原生能力、但不扩展 A 的功能范围；不改历史 ADR。
