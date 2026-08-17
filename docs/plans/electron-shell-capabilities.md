# Electron Shell 能力规划

> 状态：shell.15 代码基线（最新已发布 shell.14）；双端 packaged smoke、严格 Release 门与官网刷新沿用既有发布链路，签名/公证仍不在本轮范围。
> 原则：原生能力只解决桌面生命周期与可信交付，不复制 Harness 已有业务功能。

## 1. 产品约定

- 首次启动按操作系统首选语言选择中文或英文；不支持的语言收敛为英文。
- Shell 与 Harness 共用 `$DSH_HOME/settings.yaml` 中的
  `locale.preference` 和 `ui-theme.preference`，内部切换后无需重启即可同步。
- 主窗口隐藏操作系统标题栏，让 Harness 使用完整内容高度；macOS 保留交通灯，
  并为侧栏品牌区保留 12 px 安全上边距；Windows/Linux 保留透明覆盖式窗口按钮，
  同时提供不遮挡控件的透明拖拽区。
- 所有原生界面必须同时具有完整中英文文案；若某项无法可靠同步，英文是唯一
  允许的回退，不能出现同一菜单中中英混杂。
- 窗口标题与 About 持续明确“社区维护、非官方”；About 提供社区官网、项目源码、
  Harness 官方页和 DeepSeek 官网。帮助菜单只保留项目源码、问题反馈与 DeepSeek
  官网，避免重复。

## 2. 原生菜单合同

| 菜单 | macOS | Windows / Linux | 用户目的 |
|---|---|---|---|
| 应用 | About、检查更新、服务、隐藏、退出 | — | 确认版本与来源，控制应用生命周期 |
| 文件 | 关闭窗口 | 关闭窗口、退出 | 区分“隐藏到托盘”和“完全退出” |
| 编辑 | 撤销/重做、剪切/复制/粘贴、删除、全选 | 同左 | 保留系统熟悉的文本操作 |
| 视图 | 缩放、全屏；开发包额外提供刷新/开发者工具 | 同左 | 阅读与排障；正式包不暴露开发入口 |
| 窗口 | 最小化、缩放、全部置前 | 最小化、最大化/还原 | 使用平台原生窗口习惯 |
| 帮助 | 重启 Harness、日志、诊断、项目源码/反馈、DeepSeek 官网 | 同左并包含更新与 About | 形成恢复、支持与来源验证闭环，重复来源说明集中到 About |

页面右键菜单只按上下文显示编辑、复制、打开链接和复制链接。托盘只保留高频
生命周期动作：显示/隐藏、状态、启动/重启、日志、诊断、更新、退出。

## 3. 生命周期与安全能力

1. 启动：先初始化语言/主题、窗口、菜单和托盘，再启动内置 Harness；加载页和
   错误页使用同一语言和主题。
2. 运行：无可见标题栏但保留原生窗口按钮和拖拽能力；单实例；第二次启动恢复
   已有窗口；关闭窗口默认驻留托盘并只提示一次。
3. 恢复：Harness 有预算的指数退避；用户可确认后安全重启；渲染进程在五分钟
   窗口内最多自动恢复两次，随后进入可诊断的错误页。
4. 退出：停止 Harness 并等待日志写入完成；Windows 还需终止子进程树。
5. 安全：渲染器保持 sandbox/contextIsolation，关闭 Node integration，导航与
   新窗口转外部浏览器，额外 Web 权限默认拒绝。
6. 支持：日志运行期轮换；诊断报告本地导出、限制大小、遮罩常见凭据且不上传。

## 4. 最小持续交付门禁

- 每次提交：typecheck、Node 单测、官网双语/资产检查、主进程构建。
- Linux CI：三条 Harness xvfb 冒烟，加真实 Electron E2E（菜单、语言同步、
  close-to-tray、第二实例恢复）；失败上传 trace、截图与报告。
- tag Release：重复 E2E；macOS / Windows 打包后必须从 unpacked 产物启动内置
  Harness；再严格校验两个安装包、两个哈希与 Windows 的两个更新侧文件，全部
  通过才创建 Release。
- 发版顺序：人工审核本机候选 → bump shell 版本 → 完整门禁 → 提交/push →
  推 `v${package.version}` tag → Release 完成 → 官网 release 数据自动刷新。

## 5. 后续小步迭代

1. shell.10：交付双语菜单、系统首选语言、主题同步、About 可信链接、托盘与重启
   生命周期、真实 Electron/打包产物测试。（已发布）
2. shell.11：发布两个大体积安装包与 checksum，保留 Windows updater 所需小文件；
   修正 macOS 交通灯安全间距并精简重复帮助项。（已发布）
3. shell.12：新增 LAN 手机/平板连接、mobile-shell Web 代理、GitCode 发布技能与
   官网下载/明暗主题收尾。（已发布）
4. shell.13：完成发布可复现性收敛、LAN/监督器生命周期竞态保护、严格 updater
   元数据校验、依赖与安装脚本加固；mobile-shell 固定为 `v1.0.0`，pnpm 11.8，
   `verify` 统一门禁。（已发布 2026-08-16）
5. shell.14：代码审查后的针对性加固——LAN Windows 进程树清理、pairing URL
   host 校验、spawn `windowsHide`、supervisor 显式 cwd、IPC 校验抽函数注释、
   macOS 更新检查可选 token、`before-quit` 绝对超时兜底。（已发布 2026-08-17）
6. shell.15：redactDiagnosticsLog 边界测试加固、LAN 端到端测试（stub proxy
   覆盖 start/restart/stop + 外域 pairing URL 拒绝）、GitCode 发布 checklist。
   `LanServiceOptions.lanAddress` 测试钩子。（当前代码基线，待发布）
7. 后续：补平台级进程树退出断言、资产 provenance/SBOM；签名/公证另立阶段。

不在近期范围：把 Harness 设置或业务页面重做成 Electron 原生 UI、自动上传日志、
放宽渲染器权限，或从本仓库直接生成 iOS 包（当前没有 iOS/Xcode 工程）。
