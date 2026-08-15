# 交接文档 / Handoff — dsh-desktop

> English abstract: dsh-desktop is the unofficial Electron desktop shell for
> DeepSeek Harness. This file records the shipped product state, verification
> contract, and next iteration boundary. Website and mirror operations live in
> the root `HANDOFF.md`.

最后更新:2026-08-15 · 已发布版本 `0.1.0-rc.6.shell.10`

## 1. 当前结果

`dsh-desktop` 自带 Node 22 与完整 `@deepseek-ai/dsh` 依赖闭包,提供原生窗口、
托盘、菜单、单实例、进程监督、更新与本地诊断,不改变 Agent 行为。默认使用
`~/.dsh-desktop`,与 CLI 数据隔离;渲染器保持沙箱、上下文隔离、关闭 Node
集成、限制导航并默认拒绝额外 Web 权限。

shell.9 以三轮迭代完成:

1. **结构与测试基线**:`index.ts` 从 485 行拆到约 150 行;窗口、托盘、更新、
   smoke 分模块。`HarnessSupervisor` 支持 command/args/logDir/env/timeout 注入,
   用真实 fixture 子进程测试就绪、提前退出、超时与 stop。
2. **故障恢复与产品叙事**:`harness.log` 超过 5 MiB 轮转并保留三代;帮助菜单、
   托盘、错误页可导出最多 256 KiB 的本地诊断报告,遮罩常见凭据和主目录,
   不自动上传(ADR 0015)。官网明确区分壳新增能力与未改变的 Harness 行为。
3. **设计与持续交付**:加载/错误页与官网统一近黑 + 信号绿视觉;官网能力改为
   可扫读矩阵并补无障碍/窄屏;Release 增加版本与 11 资产/updater 元数据门禁。

### 官网浅色体系(2026-08-15 已提交部署,无新 tag)

- 官网已改为参考 DeepSeek 官网设计令牌的浅色蓝白体系(DM Sans / Host
  Grotesk、`#f9f8f8`、`#1e232c`、`#4d6bfe`、16/24 px 圆角);社区身份声明
  经人工审核后精简为“社区出品 / 非官方”,正式免责句式只留页脚一处。
- 本地站点宽屏/390 px 窄屏、中英切换、5 个下载入口和控制台已验证;38 项应用
  测试仍全部通过。
- Apple Silicon DMG/ZIP 已在本机生成;`.app` 使用本机 Apple Development 身份
  签名并通过 `codesign --verify --deep --strict`,但没有 notarization,不能据此
  宣称公开 Release 已完成签名/公证。
- 当前代码库没有 iOS/Xcode 工程,现有 Electron 打包只能产出 macOS 而非 iOS。

## 2. 架构速览

```text
src/main/index.ts           Electron 生命周期与模块装配
src/main/window.ts          窗口、状态持久化、导航守卫、hide-on-close
src/main/tray.ts            托盘状态与生命周期入口
src/main/update-prompt.ts   跨平台更新与 macOS check-only 提示
src/main/smoke.ts           CI 冒烟断言与退出约定
src/main/supervisor.ts      Harness 子进程生命周期与退避重启
src/main/diagnostics.ts     日志轮转、遮罩、报告格式与导出
src/main/restart-policy.ts  就绪协议、退避与重启预算纯函数
src/main/window-state.ts    窗口几何校验纯函数
src/main/permissions.ts     Electron 会话权限默认拒绝
src/main/menu.ts            应用菜单、About、诊断入口
src/main/pages.ts           有 CSP 的加载页与错误恢复页
src/preload/index.ts        仅暴露 retry 与诊断导出两项窄桥
```

## 3. 当前验证契约

每次主分支 CI 执行:

1. TypeScript typecheck;
2. 55 个 `node:test` 单测;
3. `site:check`(双端 release 数据、双语键与静态资源);
4. 主进程/预加载构建;
5. Harness 闭包与内置 Node bootstrap;
6. 三条 xvfb 冒烟:正常启动、错误页重试成功、强制重试失败后按钮恢复;
7. 真实 Electron E2E:无标题栏拖拽区、语言同步、沙箱、close-to-tray 与
   第二实例恢复。

shell.11 起,tag Release 在上述基础上再执行质量门禁,并强制:

- tag 等于 `v${package.version}`;
- macOS / Windows 从 unpacked 产物启动内置 Harness 并通过 smoke;
- 只有 Apple Silicon DMG 与 Windows x64 EXE 两个大体积安装包;
- 两个安装包的 SHA-256 实算匹配,且 Windows `latest.yml` 与 `.exe.blockmap`
  齐全并引用本次 EXE;严格拒绝其余 Release 文件。

shell.9:CI run `31870759765`;Release run `31870835413`;11 个资产发布成功。
shell.10:CI run `31889803242`;Release run `31889903318`;Site Data Refresh run
`31890214574`;11 个资产发布并同步官网成功。

## 4. shell.10 发布后的最小迭代

下一轮继续保持小步、可验证,不要再次把职责塞回 `index.ts`:

1. **诊断体验补强**:报告问题前可复制/预览诊断摘要;继续扩充遮罩测试,但不要
   引入自动上传或收集完整会话目录。
2. **平台收尾**:评估 Linux deb 更新提示、Windows 进程树退出的真实平台断言;
   macOS 签名/公证仍是启用原地更新的前置条件。
3. **发布可复现性**:为发布资产增加 checksum 清单与验证,再考虑 provenance/
   SBOM;保持镜像与核心发布解耦。
4. **官网证据层**:加入短 changelog/决策记录入口,让版本能力和限制可直接追溯,
   但不要增加重型前端框架。

参考规划 `docs/plans/next-iteration-refactor-tests.md` 的重构项已在 shell.9
完成;该文件可保留为历史输入,不应再按“未执行”状态重复实施。

### shell.10 发布内容

- 首次启动根据 `app.getPreferredSystemLanguages()` 写入缺失的
  `locale.preference`;支持中文/英文,其他语言回退英文。写入保留 YAML 注释与
  其他配置,使用跨进程锁和同目录原子替换。
- 菜单、托盘、About、加载/错误页、更新与诊断对话框完整双语,并监听 Harness
  的 `locale.preference` / `ui-theme.preference` 实时同步。About 与帮助菜单同时
  标明社区非官方身份并提供社区、源代码、Harness 官方和 DeepSeek 官网链接。
- 主窗口已隐藏原生标题栏并使用完整内容高度：macOS 保留交通灯，Windows/Linux
  使用透明窗口控件覆盖层；preload 只增加 12 px 透明拖拽区，不创建可见假标题栏。
- 完成 close-to-tray 首次解释、单飞重启确认、第二实例恢复窗口、渲染进程有界
  恢复、运行期日志轮换和精确 Release URL 校验。
- 单测增至 53 项；真实 Electron E2E 覆盖无标题栏/拖拽区、原生菜单/标题元数据、
  语言热切换、沙箱、close-to-tray 和第二实例恢复，关键场景连续五轮共 10 次
  通过。CI/Release 已
  加入 E2E，三平台打包后从 unpacked 产物启动 Harness。
- Apple Silicon 签名基线包已用本机 Apple Development 身份通过
  `codesign --verify --deep --strict`；包含最终菜单的 `dist-review` 审核包为节省
  重复签名时间显式跳过签名，但已用隔离 user-data 启动自身 Harness 并保持运行。
  仍未公证，`spctl` 拒绝符合预期，不能作为公开分发签名宣传。
- 官网第二轮内容已同步上述能力，宽屏和 390 px 窄屏无横向溢出、控制台无告警。
  shell.10 已在主分支 CI 通过后发布，站点刷新工作流已将 11 个下载资产同步到
  正式域名。

完整菜单合同与后续小步路线见 `docs/plans/electron-shell-capabilities.md`。

### shell.11 候选内容（发布完成后回填运行记录）

- 发布面收敛为两个大体积安装包:Apple Silicon DMG 与 Windows x64 EXE;
  每个安装包附标准 `.sha256`,Windows 自动更新继续保留 `latest.yml` 与
  `.exe.blockmap`,官网只展示用户需要的双端下载与校验信息。
- macOS 无标题栏侧栏增加 12 px 安全上边距,使交通灯与 DeepSeek 品牌区保持
  清晰间隔;仍不引入可见假标题栏。
- 帮助菜单移除与 About 重复的“社区官网”和“Harness 官方页”,保留项目源代码、
  问题反馈与 DeepSeek 官方网站;About 继续承担完整社区身份与来源说明。

## 5. 已知限制

- 公开 macOS Release 仍未完成分发签名/公证,只能检查更新并引导下载;本机审核包
  的 Apple Development 签名不等价于 Developer ID 分发签名或 notarization;
- 诊断遮罩为尽力而为,界面已要求用户分享前自行检查;
- GitCode 发行版资产为人工镜像渠道:跨境自动推送/拉取方案均已否决(0008
  第二修订),发版后由维护者从国内网络手动上传 dmg/exe 与校验文件并触发
  Site Data Refresh;
