# 飞书消息降噪 / 卡片样式：待实施任务卡

补充日期：2026-10-11。状态：已并入[人工审查迭代计划](README.md)，尚未实施。
本次只记录需求，不修改产品配置或已发布使用指南，不声称新增测试已通过。

执行约定：按用户 2026-10-11 的最新要求，跳过 TDD，采用“先实现 → 验证 → 修复 → 再验证”的持续迭代流程。
此约定替代补充需求最初的“先写失败测试”，不取消任何测试覆盖或验收标准。

## 背景与边界

当前 [renderConnectToml()](../../../src/main/cc-connect-config.ts) 未生成 `[projects.display]`
或 `[stream_preview]`。固定子模块基线的 [配置类型](../../../third_party/cc-connect/config/config.go#L187)
已支持 full/compact/quiet、legacy/rich 和预览配置；[预览默认值](../../../third_party/cc-connect/core/streaming.go#L20)
是开启、1500ms、30 字符增量。壳默认应更安静，而非要求用户手改 TOML。

本任务仍生成一个项目、一个飞书平台和一个默认工作区，不改认证或生命周期逻辑。
不暴露多项目/多平台、按聊天切工作区、模型选择、`admin_from`、users/roles、bridge、
management、webhook 或自由文本 TOML 编辑器；不升级 cc-connect 或新增依赖。
后续保存多份应用配置不等于同时启动多份项目，本任务字段随应用记录迁移，不丢用户偏好。

## 1. 数据与兼容契约

在 `src/main/cc-connect-config.ts` 定义下列类型并扩展 `ConnectSettings`：

```ts
export type ConnectDetail = 'full' | 'compact' | 'quiet'
export type ConnectCardMode = 'legacy' | 'rich'
export type ConnectProgressStyle = 'legacy' | 'compact' | 'card'
```

| 字段 | 类型 / 合法值 | 新默认值 |
|---|---|---|
| `detail` | `ConnectDetail` | `'compact'` |
| `showStreamPreview` | boolean | `true` |
| `streamPreviewIntervalMs` | 有限整数毫秒，钳制到 500–30000 | `3000` |
| `cardMode` | `ConnectCardMode` | `'legacy'` |
| `progressStyle` | `ConnectProgressStyle` | `'legacy'` |

- `enabled`、`appId`、`workspace` 维持现有字段语义；新字段不包含任何 Secret。
- “可缺省”指持久文件与旧输入可以不带新字段；规范化后的 `ConnectSettings` 和返回的
  `ConnectState` 必须具有全部合法生效设置值。旧调用/渲染入口可用兼容输入类型，不强迫改所有夹具。
- `normalizeConnectSettings()` 对每个字段分别做类型/枚举校验；缺字段、错误类型、非法枚举
  回落默认值。间隔缺失、非有限或非整数回落 `3000`，合法整数越界则钳制，不接受数字字符串。
- IPC 对明确提供的非法类型/枚举及非有限/非整数间隔返回 `undefined`，沿用 `invalid-input`。
  有限整数越界通过规范化钳制；不把错误枚举当作“用户要默认值”静默保存。
- 首次读取旧 `settings.json` 即使用新默认值，无需手改文件或重写 Secret。
  已保存的合法显式偏好不能在后续编辑或二维码旧参数调用时被默认值覆盖。
- 默认统一为 **compact + 开启预览 + 3000ms + legacy 卡片 + legacy 进度**。
  原需求末尾的“quiet/compact”以明确数据模型中的 compact 为准，quiet 是用户可选档位。

## 2. TOML 生成契约

| `detail` | `mode` | `thinking_messages` | `tool_messages` |
|---|---|---|---|
| full | `"full"` | true | true |
| compact | `"compact"` | false | false |
| quiet | `"quiet"` | false | false |

字符串（包括受控枚举）仍走 `tomlString()`；布尔/整数先规范化再写 TOML 字面量，
不引用任意用户文本。`renderConnectToml()` 直接接收缺新字段的兼容输入也应得到相同默认输出。

生成结构节选（现有 agent、工作区和 Secret 占位符配置保持不变）：

```toml
[stream_preview]
enabled = true
interval_ms = 3000
min_delta_chars = 80

[[projects]]
name = "dsh-desktop"

[projects.display]
mode = "compact"
thinking_messages = false
tool_messages = false
card_mode = "legacy"

# 此处保留现有 projects.agent 及其 options/env
[[projects.platforms]]
type = "feishu"

[projects.platforms.options]
# 此处保留现有 app_id / app_secret 占位符 / allow_from
progress_style = "legacy"
enable_feishu_card = true
```

`[stream_preview]` 是全局表，只定义一次，优先放在 `[[projects]]` 之前；
`[projects.display]` 紧接项目名称，属于最后一个 `[[projects]]`。
必须用实际 TOML 解析/cc-connect 配置加载检查归属与类型，不能只匹配输出文本。
`min_delta_chars=80` 固定，不新增用户选项；Secret 仍只写环境占位符。

“静默”不是不回复：底层定义是隐藏思考/工具独立消息、将文本追加到同一卡片。
仍保留最终答复、错误和权限交互；富卡片/进度展示与详细度的组合需按实际行为验收，
不要承诺所有状态行都会消失或 Card 2.0 在任何权限条件下都可用。

## 3. 主进程、状态与生命周期

- `src/main/cc-connect-types.ts`：`ConnectSettingsInput` 新字段允许缺省以兼容旧调用，
  `ConnectState` 回传规范化设置用于回显，不回传 Secret。
- `src/main/index.ts`：扩展 `parseConnectSettingsInput()` 的白名单校验；
  `saveConnectSettings()` 合并当前已保存设置与合法输入的新字段，再 `writeConnectSettings()`。
  新字段省略表示保留当前值；没有当前值才补默认。原有空 Secret 保留行为不变。
- `connectStateFromRuntime()` 回传新设置；保存/重启失败仍反映真实 phase/error，
  不把“设置已保存”当作“运行中的 Sidecar 已生效”。
- 显示字段变化改变 TOML，按原有规则对已启用、已有 Supervisor 的连接触发
  `restartConnectForCurrentKernel()`；未启动、禁用或 Safe Mode 不因此隐式启动。
  `createConnectSupervisor()` 保留重新生成 TOML 的现有路径，无需新增启动分支。
- `src/preload/index.ts` 沿用 `getConnectState` / `saveConnectSettings`，不新增 IPC 通道，
  不放宽 sender guard。二维码创建、Secret 保存/清空、Safe Mode 和退出停止逻辑保持原契约。

## 4. 用户界面

`plugins/dsh-desktop-controls/lib/client.js` 手工维护，无构建步骤或新依赖。
在 `[data-dsh-connect-fields]` 的工作区字段之后追加：

1. **消息详细度**：完整 / 精简 / 静默。
2. **流式预览**：checkbox；**刷新间隔**：1.5s / 3s / 5s，关闭预览时禁用但保留已选值。
3. **卡片样式**：经典 / 富卡片（Card 2.0）。
4. **进度展示**：逐条 / 单消息更新 / 结构化卡片。

`connectForm` 初值、首次状态载入、保存回显均包含新字段；`refreshConnect()` 及原有轮询
不覆盖用户尚未保存的编辑。若已保存间隔是合法的非预设值（例如 8000ms），回显当前值，
不得无操作就把它改成 1500ms；可增加只用于回显的当前值选项，不提供自由文本输入。

复用 `[data-dsh-connect-field]` 和现有 CSS 变量，为 select 补背景、文字、边框、焦点与禁用样式。
zh/en 同时补齐 `connectDetailTitle`、`connectDetailFull/Compact/Quiet`、
`connectStreamPreview`、`connectStreamPreviewInterval`、卡片样式标题、
`connectCardModeLegacy/Rich`、进度标题与 `connectProgressStyleLegacy/Compact/Card` 等文案。
“静默”旁说明仍会回复最终结果；将来的应用管理窗口复用相同设置，不能维护另一组默认值。

## 5. 原子任务与实现后验证门禁

测试边界沿用本次需求明确的公开契约：设置读写/规范化与 TOML 输出、renderer 的
`saveConnectSettings` / `getConnectState` IPC、设置页用户操作。不要只给私有解析函数做源码正则断言。
每项先做最小实现，再补齐并执行对应测试；失败时定位、修复并重跑相关门禁，确认通过后才提交该项。
不要求实现前新增失败测试，不批量做完全部功能再补验证；现有测试与下列覆盖要求全部保留。

| ID | 允许的主要改动 | 实现后必须验证的行为 |
|---|---|---|
| MSG-01 | `src/main/cc-connect-config.ts`、`test/cc-connect-config.test.ts` | 旧文件/缺字段默认；三档映射（显式 quiet）；上下界与错误类型；非法枚举回落；解析后全局预览/项目显示归属；写入仍原子且无 Secret |
| MSG-02 | `src/main/cc-connect-types.ts`、`src/main/index.ts`、`test/cc-connect-ipc.test.ts`，必要时现有 lifecycle 测试与 `e2e/electron-shell.spec.ts` | 真实 save-settings 接受合法字段、拒绝非法值且不改变旧设置；旧 payload 保留偏好；保存/重读回显；新 TOML 生效、禁用/Safe Mode 不启动；Secret 不泄露 |
| MSG-03 | `plugins/dsh-desktop-controls/lib/client.js`、相关桌面控件测试与 `e2e/electron-shell.spec.ts` | 默认四组控件、双语、禁用间隔、合法非预设回显、保存/重开、轮询不覆盖编辑；不新增通道/依赖 |
| MSG-04 | `docs/cc-connect.md`、`test/cc-connect-docs.test.ts`、新增 ADR 及索引、该计划的验收记录 | 说明默认变更与选项含义；文档不宣称多项目/多平台；新增关键词检查和完整 verify 门禁 |

配置解析检查优先复用子模块已有 TOML/config loader（假 Secret），不改其生产行为。
UI/生命周期自动测试用临时 userData/DSH_HOME、假 Sidecar 和模拟 ACP，不调用真实飞书服务。
真实人工收发与消息数量/卡片行为合并到主计划 QA-01，不自动发送验收消息。

实现时更新 `docs/cc-connect.md` 的“设置页配置和生命周期”“已知限制”；
首版仍为固定单项目/单平台，但不再宣称显示配置完全不可选。旧用户默认行为改变属于明确取舍，
追加默认降噪行为 ADR，不改写历史 ADR，不提前把待实施功能写成已发布能力。

## 6. 完成标准

- `pnpm run verify` 全绿，配置、IPC 与 UI 行为有新增回归，失败不能靠跳过或减弱断言处理。
- 旧 `settings.json` 不改也能启动，规范化行为等同 compact/开启预览/3000ms/legacy/legacy。
- 新建连接与二维码旧调用使用相同默认值；默认不逐条发送思考/工具消息，最终答复不丢失。
- 用户显式选择 full、quiet、富卡片或其他进度样式可保存并生效；关闭预览不破坏最终消息与权限交互。
- Secret、Safe Mode、启停和崩溃重启预算不回归；后续应用配置迁移和管理窗口保留全部设置。

本次补充仅完成任务编排与契约核对；MSG-01～MSG-04 仍为待实施，不记为功能完成。
