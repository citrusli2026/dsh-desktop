# 官方桌面端与 dsh-desktop 社区版：实现对比及后续路线

调研日期：2026-09-29。本文是建议稿，不替代现有 ADR，也不表示已经决定迁移架构或调整发布承诺。

## 1. 结论

**建议保留社区版，收窄投入，同时逐步把通用能力贡献给官方或做成可选工具。暂不整仓 fork 官方桌面端，也不立即停止维护。**

官方已经覆盖“下载安装即可使用 Harness”的基本需求，并开始提供桌面专属的账号、浏览器、Office 运行环境和任务感知更新。继续以“把 dsh web 装进 Electron”为主要卖点，空间会持续缩小。

社区版更合适的方向是：**经过验证的 Harness 社区发行版，重点解决运行可靠性、升级可控性、故障恢复和特定平台支持。** 这些价值需要真实故障闭环和兼容性记录支撑，不能仅靠功能清单。

短期采用“现有壳维护 + 通用能力逐步上游化”；用两轮真实发布和用户反馈判断，后续是否值得转向“基于官方桌面端的少量补丁”，或逐步成为官方版的配套工具。

## 2. 调研基线与证据边界

| 对象 | 本次基线 |
|---|---|
| 用户指定仓库 | `citrusli2026/deepseek-harness`，已独立 shallow clone；未操作原有 Harness checkout |
| fork 与官方关系 | 克隆 HEAD 为 `639ed015397290b3745d163aafe02ffee4aa3f84`，与查询时 `deepseek-ai/deepseek-harness` 的 master 完全相同 |
| 官方源码版本 | `apps/desktop/package.json` 为 `0.2.0-rc.2` |
| 官方在线交付 | macOS arm64/x64 DMG、Windows x64 EXE 固定下载地址均返回 HTTP 200；macOS arm64 和 Windows 更新 feed 均为 `0.2.0-rc.2` |
| 社区版提交基线 | `01d8135`；已提交和最新公开 Release 为 `0.2.0-rc.1.shell.0` |
| 社区版工作区 | 调研开始时已有三个未提交文件，正在将内核版本调整到 `0.2.0-rc.2`；调研期间另有并发改动，本次均未触碰 |
| 方法 | 阅读实际源码、配置、测试和发布脚本；查询 GitHub Release 元数据；对官方 CDN 做 HEAD 和更新 feed GET |
| 未做 | 未安装或启动官方二进制；未验证实际签名、公证、账号登录、完整升级；未测启动时间、内存、CPU 或 Agent 成功率 |

官方 GitHub Release 未附安装包，**不能据此判断官方尚未发布桌面端**。仓库的上传脚本使用 DeepSeek CDN，实际地址可访问：

- [官方 macOS arm64 安装包](https://download.deepseek.com/desktop/dsh-latest-macos-arm64.dmg)
- [官方 macOS x64 安装包](https://download.deepseek.com/desktop/dsh-latest-macos-x64.dmg)
- [官方 Windows x64 安装包](https://download.deepseek.com/desktop/dsh-latest-windows-x64.exe)
- [官方 macOS arm64 更新 feed](https://download.deepseek.com/dsh-desk/feeds/mac-arm64/nightly-mac.yml)
- [官方 Windows 更新 feed](https://download.deepseek.com/dsh-desk/feeds/win-x64/nightly.yml)
- [社区版本次公开 Release](https://github.com/citrusli2026/dsh-desktop/releases/tag/v0.2.0-rc.1.shell.0)

固定下载地址和 feed 会变化；以上是调研当时的在线结果。源码中的能力也不能直接等同于安装包所有路径均已实测通过。

## 3. 两种实现的核心差别

### 官方：与 Harness 同仓、同版本的桌面应用

```text
Electron 主进程
  ├─ dsh-app://app/：随包 Web 静态页面、受约束的 preload
  ├─ 原生窗口、账号视图、浏览器 guest、快捷键、更新与恢复
  └─ Electron RunAsNode 子进程
       └─ 私有 desktop-host → 共享 runProfile → desktop profile
            ├─ Harness Agent / 会话 / 工具 / 插件
            ├─ 已认证 HTTP / WebSocket
            ├─ IPC ready / shutdown / 任务检查
            └─ Office skills + 独立 Python / Node / pnpm payload
```

关键事实：

- Host 使用 Electron 的 Node 模式；不是将 `dsh web` 作为普通外部 CLI 仅靠日志托管。启动、退出、更新任务检查有专用 IPC。
- Web 文档由 `dsh-app://app/` 先加载；主进程持有 Host 认证信息并转发 API，避免在启动时把整个文档切换到新的 HTTP 页面。
- shell 与内核按同一发布版本验证，不支持独立切换内核。收益是减少未经验证的组合；代价是升级粒度固定。
- 默认与 CLI 共享 `DSH_HOME` 下的会话、设置等产品数据，但独占 `profiles/desktop` 的插件启用清单和包管理状态。
- Host 本身复用 Electron 的 Node，但 Office payload **仍携带独立 Node**，不能理解为整个安装包完全没有第二套运行时。

源码：[Host 进程](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/apps/desktop/src/host-process.ts#L186)、[桌面 Host](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/apps/desktop-host/src/index.ts)、[本地文档与认证代理](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/apps/desktop/src/web-document.ts)、[运行时决策](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/.agents/notes/implemented/architecture/2026-09-11-desktop-electron-node-runtime.md)。

### 社区：独立 Node 托管公开 Web profile

```text
Electron 主进程
  ├─ 窗口 / 托盘 / 全局快捷键 / 更新 / 诊断 / LAN 代理
  ├─ preload ↔ dsh-desktop-controls 插件
  └─ HarnessSupervisor
       └─ 随包 Node 24.21.0 → 公开 dsh --profile web --port 0
            ├─ 官方 WebUI / Agent / 会话 / 工具
            ├─ shell controls patch / Safe Mode overlay / trash hook
            └─ 内置内核或 userData 中独立安装的 kernel overlay
```

关键事实：

- 不维护 Agent 内核 fork，消费公开 npm 包；保持普通 Node 运行环境，减少与 Electron 特有 Node ABI 的绑定。
- 通过 stdout 的 `dsh web: http://127.0.0.1:...` 协议判断就绪，窗口再加载 Web 地址。日志格式、profile 解析和插件 API 变化都需要适配。
- 默认独立 `~/.dsh-desktop`，避免日常操作影响 CLI；用户也可显式设置 `DSH_HOME` 共享。
- 主进程有有界退避重启、启动超时、渲染器恢复、错误页、局域网代理及内核切换。
- 控件通过插件和 overlay 接入官方 UI，是合理的扩展方式，但并非零维护：profile 模块解析和桌面 bridge 都有版本耦合。

源码：[supervisor](../src/main/supervisor.ts)、[就绪与重启策略](../src/main/restart-policy.ts)、[controls 挂载](../src/main/desktop-controls.ts)、[内核管理](../src/main/kernel-manager.ts)、[Node 实际锁定版本](../manifest/node-runtime.json)。部分 README/CONTEXT 仍写 Node 22，本次以 manifest 为准。

## 4. 功能和交付对照

| 维度 | 官方桌面端 | 社区版 | 判断 |
|---|---|---|---|
| Agent、会话、终端、插件核心 | 与内核共同开发 | 使用同一官方内核/WebUI | 同版本同配置下，不应宣称社区 Agent 更强 |
| 零 Node 安装 | 内置 Electron Node、pnpm、完整应用包 | 内置独立 Node、pnpm、依赖闭包 | 已是共同基础能力 |
| 平台交付 | macOS arm64/x64、Windows x64；明确不支持 Linux Release | macOS arm64、Windows x64、Linux amd64 deb | 官方覆盖 Intel Mac；社区有 Linux 交付优势 |
| 运行时与版本组合 | shell、内核、客户端整体发布 | shell 与 kernel overlay 可独立更新 | 官方更一致；社区更灵活，也承担更多组合风险 |
| 故障恢复 | 原生 Exit / Restart / 禁用第三方插件并备份 patch；保存 crash report | 自动退避重启、错误页、疑似插件升级/禁用、安全模式、体检、导出报告 | 双方都有；社区的用户自助处理路径更丰富 |
| Safe Mode 语义 | 恢复动作会禁用第三方 bundle，备份并重建 profile patch | 临时 disable overlay，不改原始 profile；显式退出安全模式 | 社区更便于临时排障；对彻底损坏的 patch，官方重置方式有其价值 |
| 退出与升级任务保护 | 查询 active/queued/jobs/已加载会话提醒；更新前锁住新请求、排空、复查并等待正常退出 | 手动重启有确认；退出主要负责停子进程；Windows 自动下载、退出安装 | 官方的任务感知和更新事务更完整 |
| 原生桌面操作 | 原生目录选择、应用内快捷键及 chord、dsh 协议、可选 CLI 命令注册 | 托盘、全局唤起、开机启动、启动隐藏、状态通知 | 各有强项；系统全局唤起与应用内快捷键不是同一能力 |
| 托盘 | Windows 有；macOS 明确无菜单栏图标 | 跨平台托盘及状态入口 | 社区在常驻使用上有小幅优势，容易被补齐 |
| 账号与平台页面 | 浏览器登录/PKCE、API Key onboarding、账户状态、嵌入 Usage/Top-up | 主要沿用 WebUI；另有 API 余额显示 | 官方集成更深入；本次未实测线上登录 |
| 浏览器 | 桌面默认启用 Electron webview，带导航历史、受控 guest、页面保留 | 普通 Web profile 默认不启用；未实现官方 native bridge | 官方有明显桌面体验优势；这不是自动操控浏览器的同义词 |
| 文档/表格/幻灯片运行环境 | 自带 Python/常用库、Office skills 和转换引擎接线 | 未提供同等桌面专用离线 Python payload | 官方对非开发者任务更开箱即用；不代表社区不能执行此类任务 |
| 麦克风 | 主应用音频请求有原生许可路径 | Web 权限默认全部拒绝 | 官方支持更广；社区更保守，但会限制语音功能 |
| 内核恢复 | 整体应用版本更新，没有社区式 kernel overlay | 内核安装、启动检查、失败回退、恢复内置 | 真实差异，但需要补数据兼容边界 |
| 数据保护扩展 | 已有核心数据机制，本次未发现同类 shell 垃圾桶 | 会话/预设/退役内核垃圾桶、Agent 删除拦截 | 有用的附加能力，同时涉及持久化格式和工具行为耦合 |
| 手机连接 | 本次桌面源码中未发现社区同类配对入口 | LAN 配对、独立 mobile-shell、配对状态持久化 | 社区当前差异；不据此断言整个上游生态没有远程能力 |
| 产品分析 | desktop profile 默认开启产品事件，可通过配置关闭；文档明确无面向用户的开关 | 默认 web profile，不挂载这组 desktop-only 产品分析 | 社区可强调透明可控；不能扩大为“完全零遥测”承诺 |
| 签名、公证与更新信任 | 包装流程包含 Windows EV、macOS 签名公证、发布者检查和更新校验 | 当前未做受信任发行签名；有 sha256、GitHub attestation、发布门禁 | 官方发布信任设计占优；本次未验证二进制证书 |
| 下载渠道 | DeepSeek 自有 CDN，安装包已可访问 | GitHub + GitCode 镜像 + 官网 | 国内下载已非社区独有，社区优势是可选来源和支持经验 |
| 发布验证 | 广泛的源码和更新测试，签名及安装态验证脚本；文档仍列出若干未完成现场验证 | 三平台安装包、真实 Harness、升级/残留矩阵、插件市场、校验和/attestation 门禁 | 不凭脚本数量判“谁更稳定”；社区的具体交付门禁值得保留 |

浏览器、Office、分析配置的直接证据：[Browser](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/client/ui-sidebar-browser/README.md)、[Office 接线](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/apps/desktop-host/src/office.ts)、[desktop-only 配置](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/bundle/web-app/cordis.patch.yml)、[产品事件政策](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/client/product-analytics/README.md)。

任务退出和更新证据：[官方任务控制](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/apps/desktop-host/src/update-tasks.ts)、[官方退出检查](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/apps/desktop-host/src/quit-inspection.ts)、[社区更新](../src/main/update-prompt.ts)、[社区退出接线](../src/main/index.ts)。

## 5. 优势的持续性

### 官方更有持续性的优势

1. **同仓协同。** 新能力可以同时修改 Host、客户端、preload 和打包，不必等待公开接口或外部插件适配。
2. **账号和平台整合。** 登录、用量、充值、发布渠道和签名基础设施不是独立壳容易长期追平的部分。
3. **完整新用户体验。** API Key onboarding、Office 运行环境、原生目录选择等能减少真实任务前的配置工作。
4. **版本组合更可预测。** 整体发布减少 shell/kernel/client 之间的随机组合，但不保证每个版本无缺陷。

### 社区值得保留的优势

1. **故障恢复和自助支持。** 体检 → 原因提示 → 插件升级/禁用 → 临时安全模式 → 正确重装包 → 再检查，形成实际闭环。
2. **用户可控的版本策略。** 独立内核可用于回归定位、暂缓升级、插件兼容。但应演进为“验证过的组合”，不能只提供任意切换。
3. **Linux 与特定环境支持。** 已有 deb、安装态门禁和国产 Linux 桌面的适配经验；需列清实际验证的发行版和架构，不能把全部国产系统等同于已支持。
4. **默认数据隔离。** 对同时使用 CLI、插件试验和桌面版的人有用。代价是需要更好的导入/迁移说明。
5. **已有用户与支持经验。** Windows 安装残留、原生依赖、代理、镜像故障等案例，是可积累的维护资产。

全局快捷键、托盘、余额、二维码、预设导出属于有用但容易被补齐的功能。它们适合维护，不足以单独支撑长期独立产品。

### 两个量化观察

- GitHub 全部可见 Release 的安装包下载统计：Windows **3,630**，macOS **579**，Linux **454**，合计 **4,663**；Windows 约 **77.8%**。这包括升级、重复下载和自动化访问，不包括 GitCode，也不是独立用户数。它支持继续重视 Windows，不能证明 78% 的活跃用户使用 Windows。
- 本次下载大小：官方 arm64 DMG 约 **370 MB**、Windows EXE **289 MB**；社区当前公开版约 **274 MB / 250 MB**，Linux deb **218 MB**。双方版本分别为 rc.2 与 rc.1，功能载荷不同，未控制压缩因素；只能说明当前安装包大小，不能推导内存、速度或能耗优势。

## 6. 必须先修正的判断和风险

**“回滚内核”不能等价于“完整回到升级前”。** 当前社区实现主要切换 `active.json`、检查启动就绪、失败后回退内置内核；未见在该链路配套持久化数据快照和恢复。新版可能已执行会话、配置或数据库迁移，旧版未必能读回。官方也明确记录了持久化版本和单向迁移规则。建议把启动恢复与数据恢复拆开描述，并为兼容组合、快照和降级拒绝增加验证。

**Windows 当前会自动下载并在退出时安装更新。** 因而“完全由用户手动控制所有升级”不是现状。若“升级可控”成为定位，需要显式的下载/安装偏好、任务状态保护及版本策略；不能仅改宣传。

**官方 README 有过时条目。** Known limitations 写 Sign in 按钮禁用，但当前 `WelcomePage.tsx` 的按钮调用 `start()`，Host 已接入账号授权。结论应写“代码已有登录链路，线上闭环待实测”，而不是照抄“不能登录”。社区文档的 Node 22 与实际 Node 24.21.0 也有类似漂移。

**我们的壳已经涉及部分内核相关行为。** 会话垃圾桶直接处理持久化数据，删除拦截经 PreToolUse 改变删除执行路径，插件恢复会修改启用状态。因此“完全不改变任何 Agent 行为”需要更准确地限定，继续增加这类能力会扩大维护责任。

**换成官方 desktop profile 不是一行配置。** 官方依赖私有 desktop-host、boot injections、主进程账号/浏览器 bridge、运行时解析、Office payload 和任务 IPC。不能把现有启动参数从 `web` 改为 `desktop` 就期待获得所有官方功能。

## 7. 四种可选路线

| 方案 | 适用目标 | 收益 | 成本与风险 | 建议 |
|---|---|---|---|---|
| A. 保留当前壳，做可靠的社区发行版 | 照顾现有用户、Linux、插件试验及可控升级 | 改动最小，保留现有发布和恢复能力 | 继续承担 Web API/profile 变化；官方专属能力存在差距 | **近期开主线** |
| B. 基于官方桌面端维护少量补丁 | 希望继承官方账号/浏览器/Office，同时保留社区特性 | 减少未来原生集成的重复实现 | monorepo 构建更重；需要替换发布身份/更新策略；Linux 发布缺口仍需自建 | 仅做限时验证，不立即切换 |
| C. 转为官方版的可选插件、诊断工具和上游贡献 | 希望长期降低整应用维护成本 | 用户跟随官方，社区保留有价值的工具 | 部分能力无可用 native API，无法纯插件化；分发和兼容仍需维护 | **与 A 并行推进** |
| D. 社区壳进入维护期并最终迁移 | 独立价值和使用量不足以支撑成本 | 停止重复维护，集中精力贡献上游 | 需要迁移、备份、旧版本和下载链接的过渡安排 | 保留为有条件的退出路线 |

### A：具体怎样做

对用户的描述从“功能等价 dsh web 的桌面壳”升级为“经过验证、可诊断、可恢复的社区发行版”。不承诺比官方 Agent 更强，也不以每次最快同步 npm 为目标。

- 默认推荐一个经过本项目验证的 kernel/plugin 组合；保留试验版本选择，并明确兼容状态和失败原因。
- 继续 Windows、macOS arm64、Linux deb 的现有承诺；把 Linux 看作差异方向，但不骤然放弃 Windows。
- 维护现有 LAN、垃圾桶、预设等能力，不把它们扩张为第二套工作台或跨设备云平台。
- 当用户只需要官方账号、Office 或浏览器体验时，明确推荐官方，提供安全迁移方式。

### B：验证条件

只在独立原型中验证以下问题；任何一项都不能用“MIT 开源，所以直接 fork 即可”替代：

1. 能否不依赖官方内部部署环境构建和启动，且使用社区自己的产品身份、更新来源、配置政策？
2. Linux 相关运行时和转换引擎是否具备可用目标，安装/升级门禁能否复用？
3. 现有 controls、诊断、LAN 能否通过明确适配层接入，避免广泛修改 `main.ts`？
4. 连续跟进两次上游更新后，补丁量和合并成本是否明显小于当前壳的兼容成本？

如果只是把当前壳的所有功能重新接一遍，再背上官方应用的发布环境，就没有完成降本。社区构建也不能继承官方签名和官方服务身份。

### C：哪些东西适合抽出来

| 能力 | 更合适的载体 | 前提 |
|---|---|---|
| 插件兼容说明、故障归因 | 可选插件 / 兼容性数据 / 文档 | 使用公开版本和插件元数据，避免声称仅靠 peer range 就能保证兼容 |
| `.dshpreset` 导入导出 | 可选插件或上游功能 | 跟随官方预设格式与信任提示 |
| 诊断脱敏、日志归类 | 通用库 / 独立诊断工具 / 上游贡献 | 对各种敏感字段做测试，并明确仍是 best effort |
| 安装升级残留门禁 | 上游测试和安装器改进 | 与官方安装布局适配，不能直接照搬路径 |
| 安全模式、运行时校验 | 以贡献上游为主 | Host 启动前可能不可用，不能只放在 Web 插件内 |
| 全局快捷键、托盘、LAN 生命周期 | 原生适配层或上游扩展接口 | 官方提供所需 Electron/Host 接口；普通插件没有无限主进程权限 |
| 内核 overlay | 暂留社区壳 | 与官方整体版本发布策略冲突，不强行移植 |

## 8. 建议的下一轮工作

以下为建议顺序和验收，尚未创建 Issue 或开始实现。

| 优先级 | 工作 | 验收标准 |
|---|---|---|
| P0 | 修正文档和功能矩阵 | 区分官方桌面专属能力与共同内核能力；Node/版本口径与实际一致；明确内核回退边界 |
| P0 | 数据兼容与回退验证 | 在临时数据副本测试“旧 → 新 → 旧”；不兼容时拒绝危险回退或提供经过验证的快照恢复；不能只检测 HTTP ready |
| P0 | 任务感知退出/更新 | 普通退出、重启、内核切换和安装更新有一致行为；运行任务/等待确认/排队消息受保护；取消退出保留状态 |
| P0 | 官方版并存/迁移方案 | 两边都退出后操作数据副本；按格式导入会话/预设；插件重装而非复制 node_modules；凭证另行显式选择；失败保留原数据 |
| P1 | 把现有健康检查和 Windows 恢复链打磨完 | 每类高频失败能定位到可执行动作；从损坏安装恢复后重新通过完整性检查 |
| P1 | 验证过的内核与插件组合 | 至少覆盖启动、插件加载、会话读取和一条真实交互链；明确支持窗口、已知不兼容和跳过原因 |
| P1 | 抽取一个通用能力 | 优先诊断脱敏或预设导出；在官方版证明安装、卸载和升级不需持久修改其主进程 |
| P2 | Linux/国产桌面的支持清单 | 以真实使用需求选择测试目标，明确 distro/架构；不以“Linux”笼统承诺所有系统 |
| 决策项 | 签名、公证重新评估 | 先看安装拦截反馈和长期 Windows 支持预算，再决定投入；单独建立发布基础设施计划 |

暂缓：重做聊天 UI、Agent 编排、worktree 工作台、复制官方账号和浏览器、无需求扩平台、为竞品功能数量而扩张垃圾桶/LAN 范围。

## 9. 观察窗口与决策触发条件

建议用两轮发布、约 6–8 周观察，不承诺这个窗口内完成全部 P0/P1。记录真实反馈和维护工时即可，不为此新增默认上传的遥测。

- 用户留下来的原因是否集中在至少一项具体差异：Linux、兼容版本、故障恢复、LAN 等？
- 每轮上游适配和发布消耗多少时间？重复处理相同安装故障的比例是否下降？
- 现有 Windows 用户需要的是我们的恢复能力，还是只是不知道已有官方桌面版？
- 官方是否已经覆盖我们的关键需求？相关修复能否直接进入上游？
- 独立壳是否能持续提供经验证的版本，而不是仅把测试通过的最新版重新打包？

若差异需求持续存在且维护可控，继续 A；若需求存在但重复维护太重，验证 B；若大多数需求可由官方加工具满足，增加 C；若连续两轮反馈都表明独立壳已无清晰价值，则启动 D，提供公告、迁移说明和约定的维护过渡期，而非突然删除下载或停更。

## 10. 与现有决策的关系

- A 的可靠性、开箱体验和有限范围与 [ADR 0030](decisions/0030-reliable-electron-shell-scope.zh.md) 一致。
- 可选插件继续遵守 [ADR 0029](decisions/0029-manual-community-plugin-install.zh.md)，不增加静默安装或社区插件预装。
- B 若采用官方 Host，将重新审议 [ADR 0001](decisions/0001-electron-shell-around-published-dsh.zh.md) 的公开 npm 壳架构，以及 [ADR 0026](decisions/0026-kernel-overlay-second-update-chain.zh.md) 的独立内核更新链；需新 ADR，不改写历史。
- 签名和公证保持 ADR 0030 的单独决策原则；本报告提出重新评估的理由，不将其偷偷加入当前发布门禁。

## 11. 复核入口

官方源码均固定在 `639ed015397290b3745d163aafe02ffee4aa3f84`，本地 clone 可直接阅读：

- [桌面说明与发布矩阵](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/apps/desktop/README.md)
- [发布与签名配置](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/apps/desktop/scripts/electron-builder-config.mjs)
- [CDN 与更新目标](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/apps/desktop/scripts/desktop-auto-update-environment.mjs)
- [恢复与 profile 管理](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/apps/desktop/src/project-manager.ts)
- [原生权限](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/apps/desktop/src/microphone-permissions.ts)
- [更新验证及已知证据限制](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/apps/desktop/tests/README.md)
- [持久化数据版本规则](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/docs/session-format-status.md)

社区实现复核入口：[架构](ARCHITECTURE.md)、[Safe Mode](../src/main/safe-mode.ts)、[体检](../src/main/health-check.ts)、[诊断](../src/main/diagnostics.ts)、[桌面偏好](../src/main/desktop-preferences.ts)、[LAN](../src/main/lan.ts)、[垃圾桶](../src/main/trash.ts)、[发布门禁](../.github/workflows/release.yml)。
