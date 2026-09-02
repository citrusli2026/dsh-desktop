# dsh-desktop — 测试完善迭代规划 (v0.1.1-rc.2.shell.2: Test Hardening)

**制定日期**: 2026-08-22
**前置**: 打包质量审查报告已产出（对话内，2026-08-22）；HANDOFF.md 当前基线 `0.1.1-rc.2.shell.1` 已发布（shell.0 同日发布）
**核心判断**: 发布链路（打包产物 smoke → 资产校验 → attestation）已扎实，短板集中在**验证密度**：E2E 仅 2 用例且跑在 stub harness 上、打包产物只有启动级冒烟、安装态与故障注入在打包产物上无验证。下一迭代**不新增产品功能**，专攻测试覆盖。

---

## 0. 迭代定位

| 项 | 内容 |
|---|---|
| 版本 | **v0.1.1-rc.2.shell.2 — Test Hardening（测试加固）** |
| 口号 | "让打包后的东西接受与源码态同等密度的验证" |
| 目标 | 消除审查结论全部 4 项 P 级短板，发布验证矩阵从「unpacked 启动冒烟×1」扩展到「UI 级 E2E + 故障注入 + 安装态」 |
| 不做 | 不新增产品功能、不改 UI、不动发布格式与决策 0004（仍不签名；注：原稿误引 0016，0016 为"最小双端发布面"且其"不上传 deb"已被 4bf502f 实际推翻） |
| 验收 | 下次 release 的 build job 验证矩阵全部通过；E2E 用例 2 → ≥6；CI 全绿 |

> 理由：上一轮审查确认发布安全网（provenance 链）是强项，但"发布后第一次真实使用"是自动化最薄弱的环节。测试是纯增量、零产品风险，适合作为独立迭代快速合入。

---

## 1. P0 工作项（发布安全，随下次发版生效）

### P0-1 打包产物 UI 级 E2E
**现状**: `e2e/electron-shell.spec.ts:34` 用 `electron.launch({ args: ['.'] })` 启动 dev 构建；打包产物只跑启动级 smoke（`scripts/smoke-packaged.mjs`，release.yml:111-116），asar 内容缺失、资源路径错位等 UI 级回归只能在用户手里暴露。
**改动**:
- `e2e/` fixture 支持环境变量 `DSH_E2E_PACKAGED=1`：此时 `electron.launch` 改用 `executablePath` 指向 `smoke-packaged.mjs` 同款定位逻辑找到的 unpacked 可执行文件（mac: `*.app/Contents/MacOS/dsh-desktop`；win: `win-unpacked/dsh-desktop.exe`；linux: `linux-unpacked/dsh-desktop`，逻辑可抽到共享模块 `e2e/locate-packaged.mjs`），`args` 去掉 `.`，DSH_HOME/userData 隔离方式不变
- Linux 下附加 `--no-sandbox`（unpacked 无 SUID helper，与现有 smoke-packaged.mjs:38-39 一致）
- `.github/workflows/release.yml` build job 在现有 "Smoke packaged app" 步骤后新增一步 `pnpm run test:e2e:packaged`（新 script：`playwright test` + 上述 env），仅限 build 矩阵各平台
**验收**: 三平台 release 时，打包产物跑通现有全部 E2E 用例（原生菜单/locale 同步/关闭到托盘/单实例）才进入 publish；本地 `pnpm run dist:dir && DSH_E2E_PACKAGED=1 pnpm run test:e2e` 可复现。

### P0-2 Linux deb 安装态冒烟
**现状**: Linux 冒烟因 unpacked 无 SUID chrome-sandbox 被迫 `--no-sandbox`（smoke-packaged.mjs:38-39），与真实用户安装后运行环境不一致；deb postinst（设置 SUID）从未被验证。
**改动**:
- 新增 `scripts/smoke-installed.mjs`：接受安装方式参数（当前实现 `dpkg`），用 `dpkg -i` 安装 `dist/*.deb` 后，从系统路径（`/opt/dsh-desktop/` 或 `dpkg -L` 解析）启动二进制，**不带** `--no-sandbox`，复用 smoke-protocol 的退出码与超时
- `.github/workflows/release.yml` ubuntu build job 在打包后新增一步（runner 有 sudo），与 P0-3 的故障注入变体合并为一个矩阵步骤
- 本地可跑：`sudo dpkg -i dist/*.deb && node scripts/smoke-installed.mjs`
**验收**: deb 安装后带 Chromium sandbox 正常 boot；若 postinst SUID 失效，CI 必须失败。

### P0-3 打包产物故障注入冒烟
**现状**: 故障注入场景（harness 启动失败→错误页重试往返、重试失败→按钮恢复，src/main/smoke.ts:36-76）只在 ci.yml 源码态跑（ci.yml:55-69），打包产物无此验证；`smoke-packaged.mjs` 不接收任何透传 env。
**改动**:
- `scripts/smoke-packaged.mjs` 增加环境变量透传能力（如 `DSH_SMOKE_EXTRA_ENV` 或直接读 `process.env` 中 `DSH_DESKTOP_TEST_*` 并透传给子进程，改动最小）
- `.github/workflows/release.yml` build job 对三平台打包产物各追加两个变体步骤：`DSH_DESKTOP_TEST_FAIL_HARNESS=1` 与 `DSH_DESKTOP_TEST_FAIL_HARNESS=1 DSH_DESKTOP_TEST_RETRY_FAIL=1`（Linux 用 xvfb，其余平台直接跑）
**验收**: 打包产物的错误页与重试恢复链路在三平台验证通过；失败即阻断 publish。

---

## 2. P1 工作项（覆盖面）

### P1-1 真实 harness E2E
**现状**: 全部 E2E 使用 stub HTTP server（electron-shell.spec.ts:23-26），真实 DeepSeek Harness 闭包只在 smoke 中验证了 `__DSH_BOOT__` 标记（smoke.ts:23），真实页面元素零 UI 级验证。
**改动**:
- 新增 `e2e/real-harness.spec.ts`：fixture 不再起 stub server，而是在 `pnpm run bootstrap` 之后（resources/harness 已就位）以真实配置启动，DSH_HOME 用临时目录隔离
- 用例 ①：真实 boot 后主界面出现 harness 侧栏与输入区（**警示：断言须先实测真实 DOM**——已核查 resources/harness 内 `@deepseek-ai/dsh-web-frontend` 与 `dsh-client-ui-*`，**不存在** `data-slot="sidebar"`（stub fixture 自造标记）；真实 renderer 只有 `data-slot: "root"` 与 `data-slot-error`，dsh-client-ui-sidebar 零 data-slot。断言应改用 role/text 稳定特征，或先本地跑真 harness 抓 DOM 再定）；用例 ②：打开设置面板并保存一项偏好，断言持久化到临时 DSH_HOME 的 settings.yaml
- 接入 `package.json` 新增 `test:e2e:real`，`ci.yml` 在现有 E2E 步骤后追加（bootstrap 已在该 workflow 存在，ci.yml:33）
- 稳定性：该 spec 标记 `@slow`，沿用现有 CI retry=1（playwright.config.ts:9）
**验收**: 真实 harness 下 2 个核心用例通过；与 stub 用例并存、互不污染；本地 `pnpm run bootstrap && pnpm run test:e2e:real` 可复现。

### P1-2 E2E 用例扩展（stub 层）
**现状**: 仅 2 用例（electron-shell.spec.ts），设置面板、更新检查、诊断导出、窗口状态恢复等主进程逻辑（test/ 单测覆盖）无 UI 级回归。
**改动**（每个用例一个独立 spec，全部基于现有 stub fixture）:
- 设置面板：打开 → 改 locale/主题 → 断言 settings.yaml 落盘与菜单即时切换
- 更新检查：`DSH_DESKTOP_DEV_UPDATE_URL` 指向本地 mock 更新服务器（复用 update-check 单测的响应样本），断言提示文案与"检查更新"按钮状态
- 诊断导出：触发导出 → 断言产物文件存在于 DSH_HOME
- 窗口状态：改变尺寸/位置 → 重启 → 恢复
**验收**: E2E 用例总数 2 → ≥6（stub 4 + 真实 2）；CI 全绿。

### P1-3 Windows NSIS 安装态冒烟
**现状**: 只有 unpacked smoke；NSIS 安装器行为（/S 静默安装、开始菜单项、卸载）无验证。
**改动**: windows build job 打包后 `dist/*-setup-*.exe /S` 静默安装到临时目录 → 从安装路径启动（复用 smoke-protocol）→ 验证 boot；卸载 `/S` 后目录清理校验（可选）。
**验收**: Windows 安装态 boot 通过；安装/卸载无残留错误。
> 注：Windows runner 可跑 GUI（无 xvfb 需求），风险低；若 runner 环境异常导致不稳定，降级为 P2 手工 checklist。

---

## 3. P2 工作项（可选/评估后决定）

- **P2-1 macOS dmg 挂载冒烟**: macos runner 上 `hdiutil attach` dmg → 启动 .app → smoke。mac 已有 unpacked smoke，优先级低；若 P0-1 落地后 dmg 内部结构风险显著降低，可跳过。
- **P2-2 本地一键完整门禁**: 新增 `verify:full` = verify + smoke×3 + test:e2e + dist:dir + packaged smoke（本地完整复现 CI），方便发版前自查。工作量小，建议顺手做。
- **P2-3 E2E 覆盖率统计**: Playwright + Electron 的 v8 coverage 集成成本较高、收益有限（E2E 的定位是路径回归而非覆盖率），评估后大概率不做，明确记录结论即可。

---

## 4. 依赖与里程碑

```text
P0-1 ─┬─ P0-3（复用 smoke-packaged 定位逻辑 + env 透传）
      └─ P1-2（共享 fixture 改造）
P0-2（独立）        P1-1（依赖 bootstrap，不依赖 P0）
P1-3（独立）
```

- **M1（P0 全部完成）**: 打包产物获得 UI 级 E2E + 故障注入 + Linux 安装态验证 ——
  **2026-08-23 全部合入并随 shell.2 首次全量执行，全绿**（见 HANDOFF 二十节）
- **M2（P1 完成）**: E2E 覆盖密度达标（≥6 用例，含真实 harness）——已达成
  （dev E2E 9 用例 + 打包 E2E 2 用例）
- **M3（P2 视情）**: verify:full 落地——`pnpm run verify:full` 已添加；
  P2-1 评估后跳过（见 §8 第 5 条）

## 5. 风险与回退

| 风险 | 等级 | 缓解 |
|---|---|---|
| Playwright 对打包产物启动不稳定（路径/权限差异） | 中 | 复用 smoke-packaged.mjs 已验证的定位逻辑；失败有 trace/screenshot 诊断（playwright.config.ts:16-17） |
| 真实 harness E2E 受外部闭包影响变慢/抖动 | 中 | bootstrap 已在 CI 固化；@slow + retry=1；回退为仅 CI 跑、本地可选 |
| Linux dpkg 安装需要 root | 低 | ubuntu runner 自带 sudo，无额外权限问题 |
| 迭代周期拉长延误发布 | 低 | 测试代码不触碰产品代码，可独立合入；本迭代已随 shell.2（2026-08-23）发布 |

## 6. 验收矩阵（现在 vs 目标）

| 验证项 | 当前 | 目标 |
|---|---|---|
| 源码态单测（覆盖率 80/75/70） | ✅ | ✅ 不变 |
| 源码态 smoke（正常+故障注入×2） | ✅ ci.yml | ✅ 不变 |
| E2E（stub） | 2 用例 | ≥6 用例 |
| E2E（真实 harness） | ❌ | ✅ 2 用例 |
| 打包产物启动冒烟 | ✅ 3 平台 | ✅ 不变 |
| 打包产物 UI 级 E2E | ❌ | ✅ 3 平台 |
| 打包产物故障注入 | ❌ | ✅ 3 平台 |
| Linux 安装态（sandbox 生效） | ❌ | ✅ |
| Windows 安装态 | ❌ | ✅（或降级 P2） |
| 发布资产校验 + attestation | ✅ | ✅ 不变 |

---

## 7. 测试成本护栏（2026-08-22 审查补充）

| 护栏 | 规则 |
|---|---|
| 发布门禁预算 | 每次 release 因本迭代新增的 CI 时间 ≤ 10 分钟；超出项一律放 ci.yml（PR 跑） |
| 打包门禁范围 | release.yml 打包 E2E 只跑 `@smoke @critical` 子集（现有 2 用例均已打标），完整套件留给 ci.yml 的 `test:e2e` |
| @slow 隔离 | 真实 harness 类用例只进 ci.yml（可 retry=1），**永不进** release 打包门禁（boot 30s+×2，且上游 DOM 变动是天然 flake 源） |
| 断言原则 | 打包/真实 harness 断言只用 role/text 稳定特征或已验证的 data-*；新增断言前先在本地跑一次真实 DOM 侦察 |
| 新增步骤上限 | 每个平台最多 +2 个 smoke 变体；如果某变体连续 2 次 release 失败，先降级为手工 checklist 再排障 |

## 8. 执行顺序建议（成本分档，修订版）

1. **S1（轻量，发布前必做；~0.5 天）**：P0-1（fixture 改造 + release.yml，门禁只跑 @smoke 子集）→ P0-3（env 透传，5 行级）→ P2-2（`verify:full` 一键本地门禁，写测试时顺手验证）
2. **S2（中量；~0.5 天）**：P0-2（`smoke-installed.mjs` + ubuntu 一步；注意 electron-builder deb 的 SUID postinst 是默认行为，本仓库无自配 postinst，以实测为准）→ P1-3（NSIS `/S`，失败则降级 P2 手工清单）
3. **S3（作者成本主力，~1 天）**：P1-2 stub 4 用例扩展（设置面板/更新检查/诊断导出/窗口状态）
4. **S4（谨慎，先侦察再立项）**：P1-1 真实 harness——先本地跑真 harness 抓 DOM 定断言（data-slot 已证伪），只做 1 个 @slow 用例（boot + root slot + 输入区）；若上游 DOM 不稳直接放弃，把"首屏文本 + boot 标记"并入 smoke 而非 E2E
5. **P2-1 结论**：P0-1 生效后 dmg 内部结构风险已由打包 E2E 覆盖，**跳过**并在此记录。
6. 全部合入后 `version.mjs bump shell` → shell.2：2026-08-23 发布，验证矩阵全绿
   （run 32613297135，11m13s）。

## 9. 执行状态（2026-08-22）

| 项 | 状态 | 备注 |
|---|---|---|
| S1-P0-1 打包 E2E | ✅ 已实现并本地验证 | `DSH_E2E_PACKAGED=1`（fixture 直接启动 unpacked 二进制，真实 Harness 渲染，跳过 stub-only 断言）；`scripts/e2e-packaged.mjs` 跨平台设置 env；release.yml 门禁只跑 `@smoke`（2 用例均已打标）；mac 本地 2/2 通过 |
| S1-P0-3 故障注入 | ✅ 已实现并本地验证 | `smoke-packaged.mjs` 原已透传 env（spawn 全量 process.env），release.yml 增加 2 变体 × 3 平台步骤；mac 本地 fail-harness 与 retry-recovery 均 OK |
| S1-P2-2 verify:full | ✅ 已添加 | `pnpm run verify:full` = verify + dev E2E + dist:dir + 两种打包 smoke |
| S2-P0-2 deb 安装态 | ✅ 实测通过 | `scripts/smoke-installed.mjs dpkg`（真实 sandbox，不带 --no-sandbox）+ release.yml ubuntu 步骤；shell.2 全量执行通过（apt 装依赖、首装+重装双冒烟） |
| S2-P1-3 NSIS 安装态 | ✅ | `scripts/smoke-installed.mjs nsis dist`（/S 静默安装 → smoke → 卸载）；shell.2 实测通过；同版本覆盖见 A-3 已知边界 |
| S2.5 打包产物真实 Harness 首屏渲染 | ✅ 已实现并本地验证 | `--smoke-ui` 旗标 + `smokeUiRender`（boot 覆层消失 + 无 "Failed to load plugins" + 存在表单控件 + 失败截图）；mac 打包产物实测 `smoke-ui: OK — real Harness UI rendered` |

> shell.2（2026-08-23）已由 release.yml 全量执行并全部通过。实测中遇到并已
> 修复：deb 依赖需 `apt-get install`（裸 runner 缺 libnotify4/libsecret-1-0）、
> `dpkg -L` 输出超 execFile 默认 1MB 缓冲、`dpkg -L` 目录候选先于二进制
> （EACCES）、NSIS 同版本覆盖安装确定性挂死（降级为已知边界）。后续新增
> 同类安装态步骤时注意这四处；完整波折与耗时见 HANDOFF 二十节。

### A 组（验证缺口补漏，2026-08-22 完成）

| 项 | 状态 | 备注 |
|---|---|---|
| P1-2 设置面板 UI 级 | ✅ | stub 页面提供 locale/theme 选择 → Apply → POST /settings → 写 settings.yaml → 菜单/标题/主题即时切换，且落盘内容断言 |
| P1-2 更新检查 UI 级 | ✅ | dev 模式点击"Check for Updates…" → 注入式捕获 dialog → 断言 dev 构建提示文案（无网络、Hermetic） |
| P1-2 诊断导出 UI 级 | ✅ | 菜单点击 → patch showSaveDialog → 断言报告文件生成且包含版本与品牌（版本号动态取值，不再硬编码） |
| P1-2 窗口状态恢复 | ✅ | setBounds(1180×640，尊重 MIN 960×640) → 重启 → 几何还原断言 |
| A-2 真实第二进程单实例 | ✅ | spawn 真实第二实例（同 userData）→ 原窗口从托盘恢复 + 第二实例自行退出 |
| A-3 覆盖安装 | ✅(deb)/⚠️(NSIS) | `smoke-installed.mjs --reinstall`：deb `dpkg -i` 重装后再 smoke（实测通过，覆盖同版本 overwrite 逻辑）；NSIS 同版本 `/S` 覆盖安装在 CI runner 上确定性挂死（shell.2 A8/A9 两次：150s/300s 超时、零输出，首次安装仅需 4s），故 Windows 保留 安装→smoke→卸载 全流程，覆盖安装交由 deb 代表，NSIS 覆盖画入已知边界 |
| A-4 特殊路径 | ✅ | 中文+空格路径（DSH_HOME 与 userData）启动、读英文档可切换中文；只读 DSH_HOME 以默认值启动 |
| 回归 | ✅ | dev E2E 9/9、packaged E2E @smoke 2/2、107 单测、typecheck 全绿；mac 本地全套通过 |
| 已知边界 | 记录 | 真实对话闭环（API key）、OS 版本矩阵声明对齐 — 保持文档记录，不做；跨版本升级已由 alpha.4.shell.1 的三平台发布门禁覆盖 |
