# dsh-desktop 后续迭代计划：可靠 Electron 壳 + 开箱即用

> 规划日期：2026-08-30。本文结合 Raycast、Alfred、VS Code、Claude Desktop 等行业产品的公开文档做了方法对标；只提取适合可靠桌面壳的做法，不承诺一次性实现所有候选项。
> 正式产品取舍见 [ADR 0030](decisions/0030-reliable-electron-shell-scope.zh.md)。

## 1. 产品定位

`dsh-desktop` 是社区维护的个人项目，定位固定为：**可靠的 Electron 壳，加上开箱即用的支持**。

它把官方 DeepSeek Harness WebUI 稳定地带到桌面，解决桌面用户最实际的问题：

- 不安装 Node 也能启动；
- 窗口、托盘、单实例和快捷入口符合桌面习惯；
- Harness 崩溃、插件损坏、更新失败时有明确的恢复路径；
- 安装、更新、诊断和反馈路径清楚；
- 社区插件可以发现，但必须由用户主动安装和选择。

壳不改变 Agent 行为，也不另做 Agent 工作台、聊天产品或第二套会话系统。

## 2. 行业对标：借鉴方法，不复制范围

| 对标产品 | 值得借鉴 | dsh-desktop 的取舍 |
|---|---|---|
| [Raycast](https://manual.raycast.com/quickstart) | 快速入口、统一的安装/卸载/配置路径、扩展详情和兼容性信息 | 保留并打磨全局唤起、扩展入口和手动插件安装；不做通用启动器或 AI 命令中心 |
| [Alfred](https://www.alfredapp.com/help/workflows/triggers/) | 热键冲突提示、清晰的触发方式、可搜索的帮助和故障排查 | 用于完善快捷键冲突、托盘/菜单回退和帮助文案；不引入 Workflow 自动化平台 |
| [VS Code](https://code.visualstudio.com/docs/configure/extensions/extension-marketplace) | 扩展的安装、禁用、更新、卸载、兼容性筛选，以及 Extension Bisect 式故障定位 | 强化社区插件生命周期和 Safe Mode/诊断；不建设 VS Code 式工作区和扩展平台 |
| [Claude Desktop](https://claude.com/download) | 下载后可用、桌面入口清晰、本地扩展有明确安装位置和设备边界 | 借鉴开箱即用与权限边界；不引入其 Cowork、Browser 或远程 Agent 工作台 |

对标结论只有四条：

1. **入口要快**：现有全局快捷键、托盘和菜单要稳定、可发现、可回退，不需要新增一个复杂工作台。
2. **安装要显式**：社区插件显示来源、版本、兼容性和动作状态，安装/更新/卸载都由用户主动触发。
3. **失败要可恢复**：插件或运行时出问题时，用户能进入安全模式、导出诊断并回到内置 Harness。
4. **支持要可自助**：安装指南、FAQ、日志路径、错误提示和版本信息应覆盖最常见的首次使用问题。

## 3. DSH 社区优秀案例：只吸收壳层经验

| 社区案例 | 已经吸收的能力 | 后续只做什么 | 明确不做什么 |
|---|---|---|---|
| [dataelement/dsh-desktop](https://github.com/dataelement/dsh-desktop) | Safe Mode、诊断、`.dshpreset`、移动配对思路 | 继续完善恢复提示、预设错误处理和配对边界 | 不复制其远程隧道和完整跨设备工作台 |
| [anywhere-labs/dsh-desktop](https://github.com/anywhere-labs/dsh-desktop) | 托盘、健康启动、恢复页、固定 Harness 运行 | 把启动阶段和最后一次失败原因展示得更清楚 | 不引入三种 UI 模式或新的 Agent 界面 |
| [dsh-tauri-desk](https://github.com/dsh-tauri-desk/deepseek-harness-desktop) | 内核多版本/健康检查的产品方向 | 打磨已有 kernel overlay 的检查、切换、失败和恢复状态 | 不做 worktree 工作区和 Skills/MCP 控制台 |
| [myYangyunfan/dsh_desktop](https://github.com/myYangyunfan/dsh_desktop) | 守护、自愈、托盘和运行环境处理 | 补齐进程、代理、PATH 和退出异常的可读反馈 | 不做桌宠、游戏化和多源功能堆叠 |
| [bruc3van/dsh-desktop](https://github.com/bruc3van/dsh-desktop) | 运行时来源透明、安装前安全提示 | 在诊断/About 中明确运行时、内核、数据目录和插件来源 | 不建设独立的插件审查市场 |
| [Minke](https://github.com/lencx/Minke) | 远程访问、浏览器接管的风险边界案例 | 仅维护现有 LAN QR 配对的安全和可恢复性 | 不做 Agent Browser、互联网远程 Agent 或本地模型平台 |

结论：社区案例中与本项目最匹配的是“启动健康、恢复、运行时透明、插件生命周期”；
其余增强型工作台能力即使成熟，也不改变本项目定位。

## 4. 硬约束

每个新需求先回答：“它是否直接改善可靠运行、安装体验、恢复能力或桌面使用体验？”
如果不能明确回答，就不进入当前迭代。

### 当前必须保持

- 官方 Harness WebUI 是主要产品界面；壳只提供必要的桌面外壳能力。
- 社区插件全部手动安装，不进入安装包，不在首次启动自动播种。
- 安全模式、诊断、日志和恢复操作不删除或静默改写用户数据。
- 默认本地运行、数据隔离、权限收敛和可验证发布链路。
- 先把已有承诺做完整、做稳定，再增加新能力。

### 当前明确不做

- Agent 工作台、独立聊天界面、多 Agent 编排；
- 文件/diff 工作区、复杂项目管理、会话级 worktree；
- Agent Browser、Vision、默认屏幕捕获；
- 本地模型平台、多模型聚合和模型生命周期管理；
- 互联网远程控制平台、默认隧道和复杂设备网络；
- 桌面宠物、游戏化和大规模主题系统；
- 社区插件预装、静默安装或把社区插件包装成官方功能。

签名和公证暂不列入当前迭代和发布门禁。主要功能完成后，再根据真实下载量、活跃使用量、
用户反馈和安装阻塞情况决定是否启动专项。

## 5. 已完成基线（不再列为待办）

以下能力已经落地，后续只做缺陷修复、边界补齐和文案优化，不重复立项：

| 能力 | 当前实现 |
|---|---|
| 开箱运行时 | bundled Node 22、固定 `@deepseek-ai/dsh` 闭包、无需 CLI/Node；默认独立 `~/.dsh-desktop` |
| 基础桌面壳 | 原生窗口、托盘、菜单、单实例、关闭收托盘、窗口几何恢复、开机启动和启动后隐藏 |
| 快速进入 | 可配置全局唤起快捷键、冲突不阻断启动、托盘/右键回退 |
| 守护与恢复 | 进程监督、退避重启、错误页重试、Safe Mode、恢复中心、插件嫌疑提示、诊断导出 |
| 更新与内核 | Windows 自动更新、macOS 检查更新、内核 overlay 安装/健康启动/失败回滚/恢复内置 |
| 社区插件 | 安装包不含社区插件；手动安装 `dsh-market`；安全模式隔离用户插件 |
| 用户资源 | `.dshpreset` 导入导出、冲突处理、信任提示；余额显示；opt-in 屏幕捕获工具 |
| 连接与通知 | LAN QR 配对、loopback 约束、完成/失败/待确认桌面通知、点击聚焦 |
| 发布与支持 | dmg/exe/deb、校验和、attestation、GitCode 镜像、官网自动同步 |

## 6. 历史迭代与下一步

### 6.1 shell.14 已完成：开箱即用收口（P0）

以下 A 组已随 `v0.1.1-rc.2.shell.14` 完成；这里只保留实现边界和验收标准，后续按缺陷修复处理，不再作为待办重复立项。

这组改动只修改已有入口和状态，不新建 Agent 工作台；后续只处理缺陷和边界补齐。

| ID | 功能点 | 修改方式 | 主要文件 | 验收 |
|---|---|---|---|---|
| A1 | 首次启动说明 | 在现有 `dsh-desktop-controls` 的「扩展设置」顶部增加三步状态：Harness 已就绪、数据目录、插件市场需手动安装；不增加弹窗向导 | `plugins/dsh-desktop-controls/lib/client.js`、`src/main/index.ts` | 新 profile 首次打开能看懂下一步；不会触发社区插件安装 |
| A2 | 插件市场状态 | 将只返回布尔值的 `desktop:bundled-plugins` 改成用户插件状态：`installed / missing / damaged / version`；UI 分别显示“安装”“已安装”“需要修复”和重试 | `src/main/profile.ts`、`src/main/index.ts`、`plugins/dsh-desktop-controls/lib/client.js` | manifest 有包但目录缺失时不再误显示已安装；重试不会重复并发安装 |
| A3 | 安装结果反馈 | `installDshMarket()` 从布尔返回改为结构化结果，区分下载失败、安装失败、重启失败、安装成功；保留 stderr 脱敏尾部供诊断，不把重启失败误报成网络失败 | `src/main/index.ts`、`src/preload/index.ts`、`test/profile.test.ts`、`test/desktop-controls.test.ts` | 四种结果有明确文案；安装成功但重启失败时可继续使用恢复页重试 |
| A4 | 开箱路径测试 | 增加全新 profile、已有 profile、共享 `DSH_HOME`、无网络、损坏 profile 五组夹具；其中断言安装包不含社区插件 | `test/profile.test.ts`、`e2e/electron-shell.spec.ts`、`scripts/smoke-packaged.mjs` | 新用户不需要 CLI；离线失败可解释；社区插件不被隐式添加 |

### 6.2 shell.14 已完成：桌面壳完整性（P0）

| ID | 功能点 | 修改方式 | 主要文件 | 验收 |
|---|---|---|---|---|
| B1 | 扩展设置分组 | 在现有设置页内按“桌面习惯 / 恢复 / 插件 / 可选工具”分组，保留现有动作和 IPC，不增加新产品面 | `plugins/dsh-desktop-controls/lib/client.js` | 用户能在一个页面找到快捷键、启动、通知、Safe Mode、插件市场、内核和预设 |
| B2 | 启动状态可读 | 将 `starting / ready / crashed` 与当前内核、Safe Mode、重启中状态在入口和托盘使用同一套文案 | `src/main/shell-app.ts`、`src/main/tray-status.ts`、`src/main/tray.ts`、`plugins/dsh-desktop-controls/lib/client.js` | 同一时刻托盘、入口和错误页不出现互相矛盾的状态 |
| B3 | 退出与重启反馈 | 对“重启 Harness”“停止 LAN”“退出应用”补忙碌、成功、失败和重复点击保护；不改变既有生命周期协议 | `src/main/process-lifecycle.ts`、`src/main/shell-app.ts`、`src/main/lan.ts`、`src/main/index.ts` | 重复点击不启动多个进程；失败后按钮可再次操作 |
| B4 | 桌面偏好回归 | 对开机启动、启动隐藏、快捷键冲突、通知开关做 macOS/Windows/Linux 能力矩阵；Linux 继续明确不提供开机启动 | `src/main/desktop-preferences.ts`、`src/main/global-shortcut.ts`、`test/desktop-preferences.test.ts`、`test/global-shortcut.test.ts` | 每个平台只展示实际可用开关；冲突保留旧快捷键 |

### 6.3 shell.14 已完成：恢复和插件生命周期收口（P1）

| ID | 功能点 | 修改方式 | 主要文件 | 验收 |
|---|---|---|---|---|
| C1 | 保留故障嫌疑 | Safe Mode 重启成功后暂不清空最近一次插件失败候选，直到用户退出 Safe Mode 或产生新的启动结果；增加显式清除时机 | `src/main/index.ts`、`src/main/safe-mode.ts`、`plugins/dsh-desktop-controls/lib/client.js` | 进入 Safe Mode 后仍能看到“疑似插件”；退出后状态归零 |
| C2 | 插件状态一致性 | 统一“profile manifest、node_modules、package.json、Safe Mode”四种状态；损坏包只提供诊断/卸载/重试，不自动修复用户文件 | `src/main/profile.ts`、`src/main/diagnostics.ts`、`src/main/safe-mode.ts` | 安装、卸载、禁用、Safe Mode 来回切换后显示一致；不删除用户 profile |
| C3 | 安装风险说明 | 在手动安装市场前明确网络安装、第三方代码和用户确认；安装完成后说明后续插件由 Harness 市场负责 | `plugins/dsh-desktop-controls/lib/client.js`、`site/assets/data-model.js`、`site/docs/faq/index.html` | 用户不会把市场或社区插件误解为官方内置能力 |
| C4 | 诊断可行动 | 诊断报告加入 market 状态、内核选择、Safe Mode 原因和建议动作；保留本地、脱敏、有界、不上传 | `src/main/diagnostics.ts`、`test/diagnostics.test.ts` | 用户把报告贴到 issue 后，维护者能判断运行时/插件/profile/网络四类问题 |

### 6.4 shell.14 已完成：运行时和更新体验（P1）

| ID | 功能点 | 修改方式 | 主要文件 | 验收 |
|---|---|---|---|---|
| D1 | 内核操作状态 | 为“检查新版 / 安装并切换 / 健康启动 / 自动回滚 / 恢复内置”定义统一状态，替换当前泛化的“操作未完成” | `src/main/kernel-manager.ts`、`src/main/index.ts`、`plugins/dsh-desktop-controls/lib/client.js` | 用户知道卡在网络、安装、启动还是回滚；内置内核始终可用 |
| D2 | 更新路径说明 | 统一 Windows 自动更新、macOS 手动下载、Linux 手动升级的提示；不新增 macOS 自动更新，也不改变现有 unsigned 现实 | `src/main/update-prompt.ts`、`src/main/locale.ts`、`site/assets/data-model.js` | 三个平台的更新按钮、文案和当前版本显示一致 |
| D3 | 更新回归门禁 | 给 overlay 切换失败、启动超时、恢复内置、更新源不可用增加模拟测试；发布继续执行真实打包 smoke | `test/kernel-manager.test.ts`、`test/update-check.test.ts`、`scripts/smoke-packaged.mjs` | 失败更新不会覆盖内置闭包；离线和重试行为可重复 |

### 6.5 shell.14 已完成并持续维护：LAN 与社区维护（P2）

| ID | 功能点 | 修改方式 | 主要文件 | 验收 |
|---|---|---|---|---|
| E1 | LAN 配对可理解 | 使用已有 `expiresInSeconds` 展示倒计时、过期后重新生成二维码；停止共享时清理 token 和窗口状态 | `src/main/lan.ts`、`src/main/lan-window.ts`、`src/main/index.ts`、`test/lan.test.ts` | 过期、重复扫码、停止、重启后不会复用旧二维码 |
| E2 | 社区支持入口 | 增加 issue 模板/支持文档，要求版本、平台、Harness 状态和诊断报告；明确禁止提交 API Key、日志原文和个人数据 | `.github/ISSUE_TEMPLATE/`、`docs/`、`site/docs/faq/` | 维护者能复现常见安装/启动问题；用户知道如何安全反馈 |
| E3 | 运行时安全更新 | 只跟进 Node/Electron/Harness 的必要安全更新；每次升级必须通过现有 verify、三平台 smoke 和安装态检查 | `manifest/`、`package.json`、`.github/workflows/` | 依赖升级不成为隐式产品扩张；升级有可回滚证据 |

任务依赖关系：`A1–A4 → B1–B4 → C1–C4 → D1–D3` 已完成；`E1–E3` 随社区反馈持续维护，不再阻塞后续官网工作。

每轮不以“功能数量”验收，而以一个完整用户路径验收：安装、启动、使用、出错、恢复、反馈。

### 6.6 shell.15：启动生命周期反馈与官网支持闭环（本轮）

本轮的主功能不是另做一套工作台，而是把“启动 → 就绪 → 重启 → 恢复暂停”这条已有生命周期变成用户看得懂、各入口一致的反馈；官网截图、双语和自动滚动是这项功能的发布配套。官网的首要任务仍是让用户在几秒内回答四个问题：这是什么、能得到什么、插件怎么处理、出错后怎么办。

| ID | 功能点 | 修改方式 | 主要文件 | 验收 |
|---|---|---|---|---|
| L1 | 启动阶段模型 | 在 `starting` 内增加 `launching / waiting-for-ready / retrying`；自动重试附带尝试次数和等待秒数；保留无阶段旧调用的兼容回退 | `src/main/supervisor.ts`、`src/main/shell-app.ts` | 真实监督器依次发出启动、等待就绪、就绪；意外退出进入退避重试，不误报为已崩溃 |
| L2 | 原生入口一致 | 托盘、菜单状态和启动状态 IPC 使用同一套阶段文案；手动重启仍显示“正在重启”，自动退避显示“正在重试” | `src/main/tray-status.ts`、`src/main/tray-template.ts`、`src/main/index.ts`、`src/preload/index.ts` | 同一状态下托盘与 `getStartupStatus()` 的 `statusLabel/harnessStage` 不矛盾；启动期间重启按钮保持禁用 |
| L3 | 控制面板实时反馈 | 设置页和悬浮扩展面板打开期间每秒刷新启动状态，用 `data-dsh-*-stage` 保留可测试的阶段标记；不新增页面或新的控制协议 | `plugins/dsh-desktop-controls/lib/client.js` | Harness 重启时不会继续显示旧的“运行中”；恢复到 ready 后状态与托盘一致 |
| L4 | 内置页与诊断 | 加载页显示启动/等待/重试及自动重试时间；诊断报告记录具体阶段；恢复暂停页继续保留现有重试、Safe Mode、日志和诊断动作 | `src/main/pages.ts`、`src/main/window.ts`、`src/main/diagnostics.ts` | 阶段变化不会泄露到 Harness 页面；失败后仍能回到恢复中心，且诊断可判断卡在哪一步 |

| 模块 | 本轮修改 | 验收 |
|---|---|---|
| 首页首屏与导航 | 将主叙事收敛为“可靠 Electron 壳 + 开箱即用支持”；导航按“定位 / 能力 / 插件市场 / 支持”组织，并明确不做 Agent 工作台 | 首屏不再把桌面壳描述成独立 Agent 产品；中英文均能直接跳到边界说明 |
| 下载与当前版本 | 在平台下载之后增加“当前版本重点”，说明状态一致性、直接恢复、插件手动安装和内核失败回退 | 发布版本变更时不写死下载链接；`release.json`、下载统计和当前版本仍由站点检查校验 |
| 能力模块 | 将原本平铺的功能卡分为“开箱即用 / 日常桌面体验 / 恢复与边界”，保留窗口、托盘、快捷键、通知、权限和诊断等已实现能力 | 不重复宣传同一功能；每组都能对应现有代码和用户动作 |
| 社区插件 | 首页、安装指南和 FAQ 统一说明：安装包不含社区插件，首次启动不静默播种，用户先手动安装 `dsh-market`，再手动选择其他插件 | 不出现“自带插件”“预装市场”等误导表述；第三方代码和构建脚本风险可见 |
| 支持路径 | 增加“首次安装 / 问题恢复 / 提交反馈”入口，安装文档和 FAQ 补齐 Retry、Safe Mode、日志和诊断导出路径 | 用户能从官网完成安装、恢复和反馈；诊断不上传、Safe Mode 不删除或移动用户文件 |
| 中英文与视觉 | 中文单页、英文说明页、安装页和 FAQ 同步核心定位；更新缓存版本并检查桌面/移动端模块密度 | `pnpm run site:check` 通过；桌面和 390px 窄屏无溢出、导航可用、段落层级清楚 |

本轮不改变下载、更新、签名、公证或插件安装实现；签名和公证仍按产品定位延后到真实使用量与反馈足够后再评估。

### 6.7 alpha.4.shell.2：插件安装与升级可靠性闭环（本轮）

本轮不增加新的插件管理平台，集中把现有「手动安装 dsh-market」和安装包升级路径做成可观察、可诊断、可回归的闭环；发版前发现上游 `@deepseek-ai/dsh` `0.1.2-alpha.4`，因此同步升级内核并将壳修订归零。

| ID | 功能点 | 修改方式 | 主要文件 | 验收 |
|---|---|---|---|---|
| M1 | 安装阶段反馈 | 将手动安装拆成准备、下载、验证、重启四阶段；按钮忙碌态不丢失，安装成功显示 profile 中的实际版本 | `src/main/market-install.ts`、`src/main/index.ts`、`src/preload/index.ts`、`plugins/dsh-desktop-controls/lib/client.js` | 中英文界面不以省略号代替状态；Harness 重载后仍能恢复本次结果 |
| M2 | 失败可行动 | 归类网络、代理、超时、profile、安装脚本和随包工具故障；合并 dsh/pnpm stdout/stderr，技术详情先脱敏再展示/复制并进入诊断报告 | `src/main/market-install.ts`、`src/main/diagnostics.ts`、`plugins/dsh-desktop-controls/lib/client.js` | 失败不会误显示已安装；用户能直接重试；`DSH_HOME`、令牌和用户路径不泄露 |
| M3 | 真实插件 E2E | 离线用例隔离 registry、store 和包名，验证失败恢复；真实用例在中文、暗色、960×640 和中文空格路径中实际安装 dshmarket 并核对版本 | `e2e/market-install.spec.ts`、`scripts/e2e-market.mjs` | 离线和真实安装各自通过；设置卡片无横向溢出；社区插件仍不进入发布闭包 |
| M4 | 跨版本升级门禁 | 从当前站点数据定位上一公开版本，下载对应平台安装包并校验 SHA-256；三平台覆盖安装后逐文件核对 Harness 配置、壳偏好、用户标记和插件夹具 | `scripts/download-previous-release.mjs`、`scripts/smoke-upgrade.mjs`、`.github/workflows/release.yml` | dmg、NSIS、deb 都证明升级前后 7 个用户文件未变化，Safe Mode 仍能隔离坏插件并启动 |
| M5 | 内核同步 | 锁定 alpha.4 闭包，同步 release-age 排除清单并执行 frozen bootstrap 和 peer 审计 | `package.json`、`manifest/harness/` | `version.mjs show/check` 一致；内置 CLI 报告 `0.1.2-alpha.4`；完整本地与发布门禁通过 |

明确边界：真实市场安装只在本地发布前执行，避免 CI 依赖社区 registry；CI 保留确定性离线链路。真实 API Key 对话、代码签名和公证仍不在本轮范围内。

## 7. 延后评估：签名与公证

这不是当前迭代任务，也不阻塞上述功能完成。达到以下任一信号后再重新评估：

- 下载和活跃使用量足以覆盖证书与维护成本；
- 用户反馈明确把 SmartScreen/Gatekeeper 作为主要流失原因；
- 有稳定的发布预算、证书主体和可持续的 CI 签名环境。

重新评估时单独建立发布基础设施计划，不把签名工作偷偷混入功能迭代。

## 8. 每轮完成标准

- 功能有单测；涉及主进程和真实窗口的路径有 E2E 或打包 smoke；
- 新增用户可见行为同步到中英文 README、官网 FAQ 和发布说明；
- 不扩大 `DSH_HOME`、插件安装和权限边界；
- `pnpm run verify`、打包门禁和发布资产校验通过；
- HANDOFF 记录实际发布结果、已知限制和用户反馈；
- 若无法证明对可靠壳或开箱即用有直接价值，则明确放弃或延后。
