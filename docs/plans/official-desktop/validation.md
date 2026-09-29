# B 路线验证规范

本文件供 [任务卡](tasks.md) 引用。所列管理层脚本由对应任务创建；本计划交付时尚不存在。上游命令必须在 `.cache/official-desktop/source` 内、通过该 checkout 锁定的 pnpm 执行。

## 1. 分层验证

| 层 | 时机 | 命令/方法 | 不能证明什么 |
|---|---|---|---|
| V0 文档/patch 清单 | 每任务 | `git diff --check`；series hash、上游 SHA、变更范围检查 | 不能证明应用能运行 |
| V1 管理脚本 | 修改 prepare/launch/package | `node --test official-desktop/test/*.test.mjs`，由 Node 或跨平台 runner 展开文件 | 伪进程不证明真实 Electron 行为 |
| V2 上游聚焦单测 | 每个产品补丁 | `pnpm exec vitest run <相关 apps/desktop/tests 文件>` | 单测不证明打包资源齐全 |
| V3 上游完整构建 | 首基线及补丁里程碑 | `pnpm run build` | 构建成功不证明 Host/Office 能启动 |
| V4 开发真实启动 | B05 和新增 native 功能 | 受控 launcher → 实际 Host → WebUI；fixture 数据 | 不证明离开源码后可运行 |
| V5 独立产物 | B06/B07 | 源码目录外启动，检查 runtime inventory、插件、原生模块与退出 | 未签名产物不证明受信任发行 |
| V6 安装升级 | B07/后续发行 | 同实验 appId 的两版安装、覆盖、退出、卸载 | 不代表第三方 AV 和所有用户环境 |

不要每改一行都跑上游全库 `test:coverage`。聚焦测试通过后，仅在里程碑跑 `pnpm exec vitest run apps/desktop/tests apps/desktop-host/tests` 和完整 build。改共享 package 时另补其 owner-local tests；新增产品可见行为遵守上游自己的 snapshot 要求。

根社区项目的 `pnpm run verify` 验证旧壳，**不能用它给实验官方应用背书**。两者日志和结果必须分开。

## 2. 功能矩阵

| ID | 场景 | 必须观察的结果 | 最低证据 |
|---|---|---|---|
| F01 | 全新临时 home，无 Key | welcome 可用，“稍后设置”后进主工作区；无误读真实凭证 | 真实 Electron smoke |
| F02 | 原生目录选择，取消后重试 | 指向 fixture 目录；取消无状态污染，重试成功 | native 集成/人工记录 |
| F03 | 浏览器打开受控 loopback 页面 | 导航/返回/刷新；切换任务后保留页面；不开放 Node/下载/任意权限 | 上游 browser tests + Electron fixture |
| F04 | Office runtime | Python/库可解析；离线首次物化；docx/xlsx/pptx 创建后重开检查 | runtime-payload smoke 或独立本地脚本 |
| F05 | 插件 | 临时 registry/本地 fixture 安装、启用、禁用；坏插件进入官方恢复 | Host 集成 + 单测；不装未知第三方包 |
| F06 | 运行任务时退出 | active/queued/job fixture 触发确认；取消后任务仍存；确认只退出本应用 | 官方 quit/update tests + native fixture |
| F07 | 崩溃/启动失败 | 原生恢复对话框，重启有效；禁用插件前正常停 Host、保留备份 | 故障注入，不在真实 profile 上造坏插件 |
| F08 | 独立数据与并存 | 既有社区/官方路径哨兵未变；实验重复实例只唤起实验窗口 | 合成 home + 两个受控 app/配置证明 |
| F09 | 发布隔离 | 无官方 feed/policy 请求、无默认 analytics；无 dsh scheme/CLI 注册 | 请求记录 + plist/manifest/配置测试 |
| F10 | 应用重启后状态 | fixture 会话/设置可读，浏览器遵守官方手动恢复语义 | 冷启动，不能只 hide/show |
| F11 | 原生权限与 preload | Node integration 关闭、sandbox/contextIsolation 保持；非 owned frame 拒绝桥接 | 相关上游 tests + 配置断言 |
| F12 | 用户主动 API Key/账号登录 | 独立测试用户可完成请求/登录；失败不绕过认证 | 需要凭证的人工实测，缺少即 not-run |

F01–F11 里必要平台项目应完成后再称“核心能力保留”。F12 未执行可以交付内部实验版，但不得宣称账号/模型线上闭环全部通过。浏览器 UI 保留不等于 Agent 已能操控任意浏览器。

## 3. 补丁差异校验

`verify.mjs` 至少执行以下事实检查，具体代码由 B10 完成：

1. 当前源码 HEAD 等于 lock SHA；working diff 正好来自 series，没有多余文件。
2. 重放前后 patch hash 一致。构建记录绑定 source SHA + patch hashes，不仅绑定版本号。
3. 上游 runtime/shell 版本关系保留；patch revision 不改写全部 workspace 包版本。
4. patch 路径落在申明范围；生产补丁数量/文件/行数分开统计并检查预算。
5. package 产物是 experimental appId/名称，内部 dsh-app origin 未被替换。
6. 没有把输出的 lockfile、node_modules、`.env`、运行时二进制装进 patch。
7. patch 中新增的密钥/私人域名/本机绝对路径检查；保留官方源码中合法的上游文档 URL，不做粗暴全局替换。

## 4. 证据文件模板

```markdown
# Bxx / 场景标题
- 日期、平台/架构：
- 社区提交 / 上游完整 SHA / patch hashes：
- 工具版本：
- 命令（工作目录明确，密钥值不记录）：
- 退出码 / passed、failed、skipped 数量：
- 真实产物路径和 SHA256（本机路径留本地日志；提交摘要用相对路径）：
- 数据 fixture 和清理边界：
- 测试结果：pass / fail / blocked / not-run / intentional-off
- 未覆盖项：
- 下一步：
```

## 5. 故障处理表

| 症状 | 首查 | 不得采取的捷径 |
|---|---|---|
| pnpm frozen lock 失败 | 工具是否为 11.7.0，源 SHA 是否对，网络/registry 日志 | 删锁文件、换最新版 pnpm |
| 缺 primary runtime | 对应平台 prepare 输出及 lock artifacts | 创建空文件夹、移除校验、删 Office 接线 |
| mac 打包索要证书/内部 origin | 是否进入显式实验入口，B04/P03 是否生效 | 填假 Team ID、借用官方密钥、禁 TLS |
| Host port 被占用 | fixture 是否残留、实际 port 配置入口 | 杀全部 Node/Electron 或关用户正式应用 |
| 页面空白 | preload、Host ready、boot injection、真实 console 错误 | 开 nodeIntegration、关 sandbox |
| 版本 mismatch | shell/runtime/package set 是否来自同一基线 | 全局替换版本字符串 |
| 更新菜单仍访问 CDN | experimental metadata 和初始化分支 | 防火墙挡住请求后宣称功能关闭 |
| patch apply 冲突 | 上游 SHA、之前 patch 顺序和 hash | `--reject`、忽略失败、手工改完不导出 |
| Windows 无环境 | 可用 runner、工作流执行权限 | 把 lint 或 macOS 结果标为 Windows 已通过 |

常见失败同样命令重试两次无新信息时，先写复现和最小问题，再决定修复或 blocked。blocked 只阻塞依赖该能力的任务，不阻止其他可独立验证的工作。
