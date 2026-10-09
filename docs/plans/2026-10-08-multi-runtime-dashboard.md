# 多版本 dsh Dashboard 产品计划

日期：2026-10-08  
状态：MVP 已落地，后续阶段待执行

## 1. 产品定义

这个 Dashboard 不是第二套 Agent 工作台，而是 dsh 生态的本机目录与运行控制面：

- 收录官方 dsh runtime、官方桌面发行版和经过审查的社区桌面发行版；
- 提供版本发现、下载、安装、启动、停止、卸载和诊断入口；
- 允许多个版本并存，并把“安装目录”“运行环境”“会话数据”分开管理；
- 对社区发行版明确显示来源、校验、权限和隔离等级，不把社区项目伪装成官方能力。

核心术语：

| 概念 | 含义 | 示例 |
|---|---|---|
| Edition | 一个可被 Dashboard 收录的桌面发行版或 runtime 来源 | Official dsh、dsh-tauri、EAC |
| Runtime | 实际被启动的 `@deepseek-ai/dsh` 版本 | `0.1.1-rc.3` |
| Environment | 绑定一个 Runtime 的独立数据与进程实例 | Alpha、Beta |
| Install | 磁盘上的应用/runtime 文件，不等于用户数据 | `userData/kernels/<version>` |

Edition 与 Runtime 必须分层。社区 Electron/Tauri 应用不能被误当作一个 npm
runtime；它们需要自己的安装、启动和卸载适配器。

## 2. 调研结论

现有项目的实现重点并不相同：

| 项目/方向 | 可借鉴实现 | 对 Dashboard 的启示 |
|---|---|---|
| [官方 Harness Desktop](https://github.com/deepseek-ai/deepseek-harness/tree/master/apps/desktop) | 官方 Web Harness 与桌面壳边界 | Dashboard 应尊重官方 Harness 作为行为权威 |
| [qufei1993/dsh-desktop](https://github.com/qufei1993/dsh-desktop) | 保留、安装、切换官方 dsh 版本 | Runtime catalog 与健康切换是最小闭环 |
| [dsh-tauri-desk](https://github.com/dsh-tauri-desk/deepseek-harness-desktop) | 内核多版本、profile、插件和数据迁移 | Edition 需要声明 profile/data 兼容性 |
| [Deepseek Harness EAC](https://github.com/zouyuxuan122/Deepseek-Harness-EAC) | 渠道目录、双更新链、启动前体检与回滚 | 安装、更新、恢复应是事务，而不是简单解压 |
| [Minke](https://github.com/lencx/Minke) | 多种远程接入与 Host 管理 | 未来可把远程 Host 作为另一种 Adapter，不混入本地安装 |
| [dsh-desktop-hub](https://github.com/FlashingChen/dsh-desktop-hub) | 管理多个 Harness/Plugin/MCP/Skills 的控制台形态 | Dashboard 应以“目录 + 我的安装 + 环境”组织，而不是堆设置项 |

已有社区调研详见 [community-dsh-desktop-research.md](../community-dsh-desktop-research.md)
和 [community-dsh-desktop-gap-analysis.md](../community-dsh-desktop-gap-analysis.md)。
本计划编写时重新核验了上游仓库的 [`apps/desktop/README.md`](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/desktop/README.md)：官方仓库当前确实包含官方 Desktop 应用，因此目录可以把它作为官方 Edition；历史调研文档中的“尚无官方桌面产品”只代表其 2026-08-28 的采样结论，不作为当前事实。

## 3. 产品信息架构

Dashboard 首页分为四个区域：

1. **目录**：官方、社区、已添加本地来源；展示来源、版本、更新时间、许可证、校验和与风险等级。
2. **我的安装**：已下载的 Edition/Runtime、磁盘占用、当前是否被环境使用、更新与卸载入口。
3. **运行环境**：环境名称、绑定版本、独立 DSH_HOME、workspace、端口、运行状态和最近错误。
4. **活动与诊断**：下载进度、安装日志、启动失败原因、恢复/重试、导出诊断。

用户的主路径应是：

```text
目录 → 查看来源与风险 → 下载校验 → 安装 → 创建环境 → 启动窗口
                                      ↓
                            停止环境 → 卸载安装 → 保留数据
```

## 4. 隔离模型

隔离必须分级展示，不能只写“安全隔离”：

| 等级 | 当前/计划行为 | 保护对象 |
|---|---|---|
| L1 数据隔离 | 每个环境独立 `DSH_HOME`、profile、session 和 workspace | 防止版本间数据串扰 |
| L2 进程隔离 | 每个环境独立 Node 子进程、端口和窗口 | 防止生命周期互相影响 |
| L3 安装隔离 | 每个 Edition/runtime 有独立安装根与卸载记录 | 防止卸载误删其他版本 |
| L4 OS 安全隔离 | sandbox、容器或独立 OS 用户 | 防御恶意社区代码，后续专项 |

MVP 只承诺 L1–L3。L4 未实现时，社区版本必须显示警告；不能把独立目录描述为安全沙箱。

## 5. 来源与信任模型

### 官方来源

- npm `@deepseek-ai/dsh`：版本来自 registry，安装包由现有 pnpm 链路安装；
- 官方 GitHub release：用于官方桌面 Edition，必须有 release 资产和校验信息；
- 内置 bundled runtime：只读、不可卸载，是恢复底座。

### 社区来源

- 只收录有明确仓库、许可证、发布页和维护者信息的项目；
- 默认展示“社区维护、非官方”标签；
- 下载必须记录 URL、版本、SHA-256/SHA-512、时间和用户确认；
- 没有校验和的二进制只能“本地导入”，不能进入自动更新；
- 社区代码安装脚本和权限说明必须在确认页明确展示。

信任等级：`official-verified`、`community-verified`、`community-unverified`、`local-import`。
目录数据可以远程更新，但安装动作不能被目录静默触发。

## 6. 版本与卸载规则

- 同一版本只下载一次，多个环境共享安装文件；
- 只有没有运行中的环境引用某 runtime 时才允许卸载；
- 卸载 runtime 永远不删除环境目录、会话和 workspace；
- 被当前主壳 `active.json` 使用的 runtime 不能直接卸载；
- runtime 被卸载后，环境保留为 `missing-runtime`，重新安装同版本即可恢复；
- 删除 Edition 应先停止它的所有环境，并显示将删除的安装范围；
- 失败安装要清理临时目录，失败卸载要保留可恢复记录。

## 7. 迭代计划

### P0：当前 MVP（已完成）

- 官方 runtime 按精确版本安装；
- 多环境注册与持久化；
- 独立 DSH_HOME/workspace；
- 同时启动多个环境；
- 独立窗口、停止、runtime 卸载；
- 单元/进程测试证明数据互不影响。

### P1：官方 runtime 管理收口

- registry 版本列表与 dist-tag；
- 下载进度、取消、断点和失败重试；
- 安装前空间检查、安装后 bin/manifest 校验；
- 环境重命名、删除、默认 workspace 和日志入口；
- bundled runtime 与已安装 runtime 的统一卡片。

### P2：Edition catalog

- 建立签名版本的内置目录 schema；
- 首批收录官方桌面版、qufei、dsh-tauri、EAC 等社区 Edition；
- 为 portable、installer、npm runtime、remote host 分别实现 Adapter；
- 展示许可证、维护者、来源、支持平台和隔离等级；
- 允许添加本地 manifest，但不默认信任。

### P3：社区 Edition 生命周期

- 下载/校验/安装/启动/停止/卸载事务；
- 升级前快照，失败自动回滚；
- 社区 Edition 与官方 runtime 的兼容性提示；
- 版本健康检查、崩溃记录和一键导出诊断。

### P4：强隔离专项

- macOS sandbox、Windows restricted token、Linux bubblewrap 或容器路线调研；
- 权限预览与工作区 allowlist；
- 不把“能启动”误标成“安全”。

## 8. MVP 验收标准

- 安装官方 `dsh` 的两个不同版本；
- 创建 Alpha/Beta 两个环境并分别绑定版本；
- 两个环境同时运行，端口、PID、DSH_HOME 和 workspace 均不同；
- 停止 Alpha 并卸载其 runtime 后，Beta 继续运行；
- Alpha/Beta 的 marker/session/workspace 数据仍完整；
- 重新安装 Alpha 的 runtime 后，Alpha 环境可以恢复启动；
- 非官方 Edition 明确显示来源和隔离等级；
- 任意下载、安装、卸载失败都不会静默删除用户数据。

## 9. 非目标

- 不重写官方 Harness 的 Agent、会话、工具或模型逻辑；
- 不把所有社区桌面端代码复制进本仓库；
- 不自动安装或静默更新社区 Edition；
- 不把 L1–L3 目录/进程隔离宣传为恶意代码防护；
- 不在本期实现远程云端应用商店或账号同步。
