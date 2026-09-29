# B 路线任务卡

先读 [README](README.md)。每张卡只处理一项；只有“验收”全部满足才修改 [progress](progress.md)。预计规模用小/中/大表示，不把估算当承诺。下面源码路径均相对于锁定的官方 checkout，管理层路径以 `official-desktop/` 开头。

## B00 — 固定实验基线与决策（小）

**依赖：** 无。**允许修改：** 本路线文档和 `official-desktop/evidence/baseline.md`；此任务不改业务代码。

步骤：

1. 执行 `git status --short`、`git branch --show-current`、`git rev-parse HEAD`；必须在实验分支。记录预先存在的改动。
2. 读取社区 `AGENTS.md`、`CONTEXT.md`、ADR 0001/0026/0030；再读上游 AGENTS、desktop README、desktop-host 入口、构建脚本。只记录相关约束。
3. 确认上游完整 SHA、版本、packageManager 与本计划一致；源 SHA 可访问即可，不擅自追 master。
4. 在 baseline 中写实验决策：保留官方主体、补丁预算、与主干隔离、初版禁自动更新、不迁内核 overlay；标注与现有 ADR 的实验范围差异。

**验收：** 记录可复现定位；明确两套 pnpm 和数据目录；没有误称现有根项目已经采用官方实现。

**失败处理：** 分支错误先定位正确 Worktree；SHA 不可取记录网络/权限事实，不换一个近似提交。

## B01 — 固定源码与补丁重放管理（中）

**依赖：** B00。**允许修改：** `official-desktop/upstream.lock.json`、`patches/series.json`、`scripts/prepare.mjs`、`test/prepare.test.mjs`、根 `.gitignore` 的两个实验目录条目。

步骤：

1. lock 只含公开 repo、完整 SHA、版本、Node 主版本和 pnpm 精确版本。series 初始为空。
2. `prepare.mjs` 在 `.cache/official-desktop/source` 建独立 clone，检出 lock SHA；确认 remote 和 SHA。不使用主干的 `resources/harness`。
3. 每个 patch 有 id/file/sha256/reason/tests/retireWhen；按顺序验证 hash、`git apply --check`、应用。产物外写入 base SHA 和所有 patch hash。
4. 重复调用：如果源码恰好等于已记录 patch 状态，直接复用；有任何额外修改就拒绝，提示先导出 diff。脚本不自动丢弃源码修改。
5. 增加显式的 `--fresh` 路径：只有缓存为可验证的基线/已知补丁状态才允许重建；未记录变化仍拒绝。不能用“缓存可删”当作覆盖未知修改的理由。
6. 管理层直接使用 Node 内置模块和 `spawn` 参数数组，不依赖根 pnpm 安装；不实现通用补丁框架。

**验收命令（由本任务创建后可用）：** `node --test official-desktop/test/prepare.test.mjs`，`node official-desktop/scripts/prepare.mjs`。

**必须覆盖：** 干净 checkout、重复运行、错误 SHA、被改过的 patch、冲突补丁、缓存额外编辑、带空格路径。测试用临时本地 Git 仓库；单测不下载 14,000 文件的真实上游。

**失败处理：** 拒绝继续 build；不使用 `git apply --reject` 或字符串替换“修好”冲突。

## B02 — 未改产品代码的构建基线（中，可能下载较多）

**依赖：** B01。**允许修改：** 本任务 evidence、管理层局部工具链调用。上游源码此时无 patch。

步骤：

1. 记录 `node --version`；使用 Node 24。将 `pnpm@11.7.0` 安装/解包到实验局部工具目录，或用已可用的精确版本；记录实际执行文件。禁止改全局 pnpm。
2. 在官方源码根用该 pnpm 执行 `install --frozen-lockfile`，记录退出码。不要使用社区主项目的锁文件。
3. 执行上游 `pnpm run build`；该命令会构建 native-system、Host、Client 和 Web。禁止只执行 desktop bundle 然后假定完整运行时已构建。
4. 执行聚焦基线 `pnpm exec vitest run apps/desktop/tests/runtime-tree.spec.ts apps/desktop/tests/web-document.spec.ts`；先确认文件存在，不存在时按实际文件清单选对应 owner-local 测试并记录替代。
5. **不执行 dev/start，不打开生成的 .app**。未隔离的上游 launcher 会注册官方 URL handler。
6. 在 `evidence/build-baseline.md` 写工具版本、耗时、磁盘占用、失败项、源码是否仍干净。

**验收：** 构建成功、所选测试通过、源码无意外变更、未使用官方私有环境配置。已有 upstream failure 与我们的补丁失败分开记录。

**失败处理：** 安装网络失败可按同一命令重试一次；出现相同失败两次后定位具体依赖/进程，不循环重装。缺工具链则记录所缺组件。确需修改上游才能编译时，先形成最小修复证据，不能混入 P01。

## B03 — P01 身份、数据与系统入口隔离（中）

**依赖：** B02。**阅读：** `src/main.ts`、`src/single-instance.ts`、`scripts/dev.ts`、`scripts/development-app.ts`、`scripts/electron-builder-config.mjs`、`src/command-management.ts`（均在 `apps/desktop`）。

**允许修改：** 一个社区实验配置模块及必要接线、相关测试、P01 patch；管理层 `product.json`、`scripts/launch.mjs`。不替换整个 main.ts。

步骤：

1. 以构建 metadata 明确实验模式。开发运行可由 launcher 显式注入；打包运行只信随包 metadata，避免用户 env 意外把官方应用改成另一种发布模式。
2. 使用 README 的 appId、显示名、产物名；在首次 userData/profile 访问前确定专用路径。开发/打包路径都测，不只给开发命令加环境变量。
3. 去掉实验构建 Info.plist/installer 中外部 `dsh` 协议声明，以及运行时 `setAsDefaultProtocolClient('dsh')`；保留内部 `dsh-app`。实验菜单不注册系统 `dsh` CLI。
4. 单实例锁以实验身份/独立 userData 生效；官方或现有壳存在时也能并存。
5. launch 使用实验数据根、无真实凭证；过滤继承的 `DSH_HOME`、主干相关环境和发布密钥，明确传所需字段。不要打印环境值。记录明确的临时运行路径。
6. 按支持的 profile 配置处理 Host 端口冲突；验证 port 0 能力后使用。未确认前不修改 Host 核心来猜测支持。
7. 导出 P01，更新 series hash。重建干净源码重放 P01，确认没有仅留在缓存的修改。

**验收：** identity/path/protocol 测试；检查生成 plist/installer 配置无官方 `dsh` 注册；真实数据目录哨兵测试（使用合成 home fixture）零写入；官方默认构建路径原行为仍通过测试。

**停止条件：** 需要全局改包名、修改内部 origin、移动用户已有数据才能启动——停止并记录原因，不继续扩大。

## B04 — P02/P04 实验发布与产品分析策略（中）

**依赖：** B03。**阅读：** `desktop-policy-environment.mjs`、`desktop-auto-update-environment.mjs`、`desktop-package-environment.mjs`、`src/main.ts`、`src/update-coordinator.ts`、`packages/bundle/web-app/cordis.patch.yml`。

**允许修改：** 社区实验配置和最少打包/main 接线、相关测试、P02/P04。避免改 updater 状态机内部。

步骤：

1. 为实验构建显式表达 `updates: disabled`。打包不要求 mandatory-policy/COS 配置；运行不创建 updater/policy 轮询器。菜单给出实验版无自动更新的准确状态。
2. 缺官方配置时，官方模式仍按原逻辑报错。严禁把生产模式的校验全删掉，或遇到异常就一律默认为成功。
3. 不填写虚构 HTTPS origin、不复用官方 feed、不把下载失败包装成“无更新”。
4. 使用实验 profile 配置关闭 `product-analytics.enabled`，优先官方配置注入能力；不用删除 telemetry 包来抑制事件。其他反馈/模型请求的政策不混为一谈。
5. 账号登录服务保持原授权流程。实验不自动登录，也不修改 token/证书/服务端限制以“保证登录”。线上登录未验证就保留未验证状态。
6. 集成测试记录 updater/policy/analytics 的受控请求，证明实验模式不发出这些请求。不能靠全局断网掩盖意外访问。

**验收：** 官方模式配置负例仍失败；实验模式无发布密钥可构建配置；定时器、菜单点击、resume 都不发更新请求；普通业务能力未被整体禁网；analytics policy 为 false。

**停止条件：** 需要伪造官方服务配置、绕过业务身份验证或移除 TLS 检查——停止该路径。

## B05 — 首次真实开发启动（中）

**依赖：** B03、B04。**允许修改：** launcher、启动 smoke 和 evidence；修复必须归入其责任 patch。

步骤：

1. 重新 prepare/replay，精确 pnpm install/build；构建产物必须来自同一 patch 集。
2. 在源码根通过上游 `pnpm run start:desktop` 路径启动；管理层负责显式临时 home/userData/独立调试端口。首次会准备 primary runtime，等待完成，不伪造目录。
3. 无 API Key 进入 welcome，使用“稍后设置”进入工作区；测试不调用付费模型。确认真实 Host ready、主文档无插件加载错误。
4. 关闭窗口、再次显示、正常退出；确认只清理本次 PID 树，Host 不残留。禁止 `pkill Electron`/`killall node`。
5. 验证系统默认 dsh handler 未被改写、真实用户目录未触碰；通过合成 home 和配置检查证明，避免读取真实凭证内容。

**验收：** 记录主页面和 welcome 截图、启动/退出状态、patch hash、临时根；实际有 Host 和完整 WebUI。空白窗口或仅 renderer fixture 不算成功。

**失败处理：** 核心加载失败先对照 B02；禁止通过关闭 sandbox、开启 nodeIntegration、删 Office 插件来绕过。

## B06 — P03 macOS arm64 独立实验应用（大）

**依赖：** B05。**阅读：** `scripts/package-target.ts`、`package-macos.ts`、`macos-runtime.ts`、`electron-builder-config.mjs`、`prepare-primary-runtime.ts` 和有关签名测试。

步骤：

1. 新增明确的 community-experimental 打包入口，复用官方准备依赖、runtime inventory、ASAR/unpack 和 smoke 流程；不把根社区 `electron-builder.yml` 套在官方 app 上。
2. 对实验模式允许本地 ad-hoc signing、无 notarization；上游正常发行仍要求 Developer ID/公证。保持运行时必要 entitlements、二进制架构和哈希校验。
3. 先 `--dir` 生成独立 .app，确认仅依赖随包资源，再考虑 DMG。必须在源码目录之外、临时 DSH_HOME 下启动，防止用源码/本机 node_modules 补漏。
4. 实际解析应用 metadata：实验 appId/名称、内部上游版本一致、patch revision、无官方 updater feed、无官方外部 scheme。
5. 断开 npm/registry 网络后启动；不要求断网后模型调用成功。Office payload 首次物化不得下载 Python 包。

**验收：** 独立 .app 正常加载/退出；无源码路径依赖；inventory/原生模块 smoke 通过；产物及证据明确“实验、ad-hoc、未公证”。验证不以 Finder 的成功打开代替权限/资源检查。

**停止条件：** 为无证书启动需要重写整套官方打包链或超过补丁预算，记录差距，停止扩展并进入 B12 中期复审。

## B07 — Windows x64 未签名实验安装器（大）

**依赖：** B06 的打包策略；实际 Windows x64 环境。**允许修改：** P03 的平台分支、Windows 聚焦测试/手动 CI。

步骤：

1. 使用官方已有 unsigned 路径，接入实验身份和无 updater 策略；不要触发硬件 token、官方 COS 或 EV 校验入口。
2. 在 Windows runner 真实构建 x64 EXE，安装到本次临时目录；不将 macOS 交叉编译成功当 Windows 验证。
3. 启动到主界面；覆盖路径含空格/中文、重复启动单实例、关闭到托盘、退出无残留。
4. 同一实验产品版本修订做覆盖安装，确认合成会话/配置保留；卸载只影响实验应用和其文档规定的数据范围。
5. 校验 installer 产品 ID/注册项与稳定社区版不同；用合成注册表/安装 fixture 及实际 runner 检查，不安装/卸载用户本机正式版。

**验收：** EXE、sha256、安装/覆盖/卸载 evidence 完整，明确未签名。记录不能覆盖的 AV/SmartScreen 真机体验。

**阻塞：** 没有 runner 时保持 blocked，给出可运行脚本和所缺环境；其他独立任务可继续。

## B08 — 官方核心能力保留矩阵（中）

**依赖：** B05/B06；Windows 行依赖 B07。**允许修改：** 测试、evidence、对应 patch 缺陷修复。

执行 [validation](validation.md) 的 F01–F12。必须覆盖原生目录、browser guest、Office 运行环境、插件安装/禁用/失败恢复、退出检查、重启数据保留。优先复用上游 tests，不重写测试框架。

模型/账号凭证不是无 key 测试前置。真实账号、真实模型调用单列人工测试，缺凭证写 not-run，不从“UI 有按钮”推导成功。

**验收：** 每行有平台、测试类型、证据、结果；行为被有意关闭的系统 CLI/协议/更新，记 intentional-off 而不是 fail；unexpected regressions 必须修复。

## B09 — P05 一个只读诊断导出入口（中，可明确延后）

**依赖：** B08、预算尚有空间。**范围：** 原生 Help/帮助菜单的一项，保存诊断文本。没有新的设置工作台。

步骤：

1. 提取/复用社区诊断脱敏的纯函数，不导入 `src/main/index.ts`、旧 IPC、旧 controls 插件或整套 supervisor。
2. 导出上游版本、patch revision、平台、启动阶段、经过脱敏的有限错误尾部、是否运行实验构建；不导出环境全集、会话正文、凭证文件或未经脱敏的官方 crash report 原文。
3. 用用户显式选择路径保存；取消无副作用、写失败可重试；只读操作不重启/禁用插件。
4. 保留官方 fatal recovery 和 crash-report，不建立第二个崩溃状态机。

**验收：** bearer/API key/token、Windows/Unix home 路径脱敏 fixtures；取消/失败测试；在独立打包应用操作一次。预算不足时在 progress 明确 deferred 和理由，不为完成此项超过补丁上限。

## B10 — 最小 CI 与产物审计（中）

**依赖：** B06/B07 的可用平台流程。**允许修改：** 新 `official-desktop-experimental.yml`、管理层 verify、evidence。

步骤：

1. 新工作流仅手动触发；运行 lint/patch 检查、平台 build、smoke、sha256、artifact upload。初版无 release/tag/site/GitCode/COS 写入。
2. 不调用现有稳定发布工作流，不复制整个上游 CI；按补丁触及面执行 tests，里程碑运行 desktop/desktop-host 聚焦套件。
3. 缓存 key 包含上游 SHA、patch hash、平台/架构、pnpm、Node；用过期缓存不得跳过校验。
4. artifact 包含 build-info（上游 SHA、上游版本、patch revision/hashes、工具版本、平台和 unsigned/ad-hoc 状态）。保留原 LICENSE 和第三方 notices。
5. verify 拒绝超预算、超范围、未记录变化、误用稳定 appId、含官方更新 feed 的实验产物。

**验收：** 一次实际 dispatch 完成对应平台；无可用 CI 权限则本地等价命令验证并将“云端运行”列 blocked。没有成功 run 不标 CI 已通过。

## B11 — 上游更新重放演练（中）

**依赖：** B10。**允许修改：** 新锁定版本、必要 patch 更新和 evidence，不顺带加功能。

1. 先封存当前可复现结果。选择与当前 SHA 不同且可明确验证的官方发布 tag；有后继版本优先后继，无后继则使用前一已发布基线演练，明确它不证明未来更新兼容。
2. 开独立临时实验 checkout，更新 lock 并严格重放；不破坏已验证缓存和基线。
3. 逐 patch 记录 clean apply/冲突、涉及文件、修复耗时、是否能删除已被官方实现的补丁。
4. 至少完成该基线的 build、desktop 聚焦回归和一平台独立产物 smoke。

**验收：** 两个不同上游 SHA 的记录；所有冲突解决可追踪。应用失败仍是有价值的结果，但结果应为“重放成本过高/阻塞”，不是通过。

## B12 — 阶段复审和后续计划（小）

**依赖：** 已完成项或明确的阶段阻塞证据。**只写 evidence/decision.md，不修改主干架构。**

逐项回答：

- 补丁数量、生产变更行、文件数是否达预算？最频繁冲突在哪里？
- 两个平台能否独立构建和运行？账号线上成功、签名、真正升级分别是什么证据等级？
- 与 A 相比，减少了哪些重复维护，又增加了哪些工具链成本？不能只比功能数量。
- Linux 需要补哪些 runtime/Office target、installer、signing 条件？先用源码和 target matrix 给可行性，不直接开始完整移植。
- LAN、垃圾桶、内核 overlay 缺失是否影响目标用户？是否可以继续由 A 服务这些用户？
- 建议继续实验、缩小范围、或进入受控公开预览；公开发布/数据迁移另开计划。

**验收：** 有可执行下一步和剩余阻塞；不把“做完计划”当成产品验证完成。
