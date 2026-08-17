# HANDOFF 归档 — 历史版本记录

> 2026-08-17 整理。以下小节已从根目录 `HANDOFF.md` 移入本文件，
> 按 shell 编号严格递增排列。

---

## shell.10 发布内容与官网第二轮

- Electron Shell 已完成无可见标题栏的全高内容窗口（保留平台原生窗口按钮与
  透明拖拽区）、中英原生菜单、系统语言首次选择、Harness 语言/主题实时同步、
  About 可信链接、close-to-tray、可确认重启和渲染进程恢复。
- 官网在既有 DeepSeek 风格浅色蓝白体系上同步新增能力，仍显著标注"社区版 ·
  非官方"；`site:check` 当前验证 75 项双语键，1440 px 与 390 px 实机检查通过。
- CI/Release 候选门禁新增真实 Electron E2E 与三平台 packaged smoke。本机
  Apple Silicon 签名基线包通过严格 codesign；包含最终菜单的 `dist-review`
  审核包显式跳过重复签名，但已隔离启动自身 Harness 并保持运行供人工审核。
  未公证导致 `spctl` 拒绝是已知且预期的分发限制。
- shell.10 已按"主分支 CI → tag → 三平台 Release → Site Data Refresh"顺序
  发布，正式域名已验证返回本版本和 11 个资产。完整顺序与后续边界见
  `docs/plans/electron-shell-capabilities.md`。

---

## shell.11 已发布

- Release 从 11 个资产收敛为严格 6 个文件：只有 Apple Silicon DMG 与 Windows
  x64 EXE 两个大文件，各附一个 `.sha256`；另保留 Windows 已安装客户端所需的
  `latest.yml` 与 `.exe.blockmap`。官网与 GitCode 只面向用户展示/镜像前四项。
- 官网下载区只渲染两端安装包；SHA-256 不再在官网展示（见根 HANDOFF 二点五节人工审查调整），
  哈希继续随 Release 发布并保留在 release.json 数据中。
- macOS 侧栏增加 12 px 顶部安全间距，使交通灯与 DeepSeek 品牌区分离；帮助菜单
  删除与 About 重复的社区官网和 Harness 官方页，保留项目源码、反馈与 DeepSeek
  官网。
- GitHub 主分支 CI run `31893979444`、Release run `31894394693`、首次官网同步
  run `31894723515` 均成功；tag `v0.1.0-rc.6.shell.11` 精确指向
  `cca1a8277e962709b8ddabe80e9941f7135b00a5`。
- GitCode 国内发行版已发布，同一 tag / commit 下通过已登录浏览器会话只上传
  DMG、EXE 与两份 `.sha256`；四个稳定下载 URL 均以匿名
  `Range: bytes=0-0` 返回 HTTP 206。
- 国内镜像完成后再次执行 Site Data Refresh run `31898225900`，生成提交
  `74fc28e`；正式域名已验证只渲染两个安装包、两个哈希，并为两端同时展示
  GitCode / GitHub 下载源。Windows updater 所需 `latest.yml` 与 `.exe.blockmap`
  继续只保留在 GitHub Release，不进入官网公开资产卡和 GitCode 人工镜像。

---

## shell.12 已发布

- 新增"扩展 → 通过局域网连接手机 / 平板"：启动独立 mobile-shell Web 代理并显示
  一次性配对二维码；代理只转发到 loopback，主令牌不写入桌面设置。
- 构建与文档补齐 LAN Web 连接流程，固定消费 `dsh-mobile-shell/dist/web` 产物；
  同时加入 GitCode 发布技能与人工镜像工作流。
- macOS 增加 quarantine 解除说明、顶部拖拽区加高到 24px；官网完成浅色体系、
  明暗主题、纯文案 hero 与双平台下载收敛。
- `site/data/release.json` 已指向 `v0.1.0-rc.6.shell.12`；GitCode 镜像
  （`gitcode_ok`）尚未全部可用，需按流程补齐后刷新。

---

## shell.13 工程维护基线（已发布 2026-08-16）

- mobile-shell Web 产物固定来自上游 `v1.0.0` tag；CI 与 Release 均使用 frozen lockfile，
  不再从 `main` 或维护者本机路径取依赖。
- pnpm 固定为 `11.8.0`；`verify` 统一执行 typecheck、63 项测试、覆盖率门槛、
  `site:check` 与构建；CI 增加官方 npm registry 的依赖安全审计。
- LAN 代理和 Harness Supervisor 对重复启动、停止中启动、失败清理做单飞保护，菜单在
  操作进行中禁用重复入口；当前本地测试为 63 项。
- 发布资产校验器除严格六文件、SHA-256 和 blockmap 外，还解析 `latest.yml` 的版本、
  Windows 路径、hashed files entry 与顶层 sha512；并修复 Release 校验依赖安装。
- 构建与运行时依赖加固：移除不再使用的 `extract-zip`，将 `yaml` 改为生产依赖，
  更新 Electron/Node 安装脚本。

---

## shell.14 已发布（2026-08-17）

本轮为代码审查后的针对性加固，不引入新功能，全部向后兼容：

1. **LAN 代理 Windows 进程树清理**（`src/main/lan.ts`）：`stopInternal` 在 Windows
   上额外 `taskkill /T /F`，与 Harness Supervisor 一致，避免 mobile-shell 启动的
   launcher 孙进程在 app 退出后残留并占用端口。
2. **LAN pairing URL host 校验**（`src/main/lan.ts`）：mobile-shell 返回的
   `pairingUrls` 视为不可信，只接受 origin 与代理监听地址一致的条目，防止被攻陷
   或异常的代理把 QR 码指向其他主机。
3. **LAN 子进程输出按行拆分**（`src/main/lan.ts`）：用 `readline.createInterface`
   替代 `data` 事件直接 trim，与 Supervisor 一致，保留日志行结构。
4. **LAN/supervisor spawn 加 `windowsHide`**：避免 Windows 上启动子进程时控制台
   窗口闪现。
5. **supervisor spawn 显式 `cwd`**：默认为 `harnessRoot()`，让 dsh 自身的
   cwd-relative 查找落在 bundled closure 内；测试环境无 Electron app 时回退到
   继承父进程 cwd，保持 fixture 行为不变。
6. **IPC senderFrame 校验抽出 `isShellOwnedFrame`**（`src/main/index.ts`）：原本
   `url.startsWith('data:') !== true` 的隐式约束现在有命名与注释，说明只允许壳自有
   data: URL 页面调用 retry/diagnostics/close-lan-pairing。
7. **macOS 更新检查支持可选 GitHub token**（`src/main/update-prompt.ts`）：通过
   `DSH_DESKTOP_GH_TOKEN` 环境变量注入 fine-grained PAT，缓解共享 NAT 下 60/小时
   rate limit；不写入设置，不外发。
8. **`before-quit` 绝对超时兜底**（`src/main/index.ts`）：在 `supervisor.stop()` 与
   `lanService.stop()` 之外加 8s `setTimeout` 强制 `app.quit()`，防止极端情况下
   promise 不 resolve 导致 app 卡死。
9. **`page-title-updated` 加注释**（`src/main/window.ts`）：说明为何屏蔽 harness 的
   标题更新（保留壳标题的 "Community" 后缀）。

本地门禁全绿：typecheck、63 项单测、覆盖率（lines 80.17% / branches 79.00% /
functions 74.68%）、`site:check`、`build`。无新 ADR：本轮为既有决策的工程加固，
不改变任何边界。

发布元数据：
- CI run `31991608477`（成功）；Release run `31991741108`（成功）；
- tag `v0.1.0-rc.6.shell.14` 精确指向 `7e26d6888bb8a214b5b2d0305145f8b38a1e37ed`；
- Site Data Refresh run `31992088063`（成功），官网数据提交 `ea4ea05`，正式域名
  已指向 shell.14 的两个安装包与哈希。
- GitCode 国内镜像待维护者从国内网络手动上传 dmg/exe 与 `.sha256`，再触发一次
  Site Data Refresh 让官网识别镜像源。
