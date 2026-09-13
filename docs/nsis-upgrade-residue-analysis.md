# NSIS 升级残留分析（Windows 安装器）

最后更新: 2026-09-13 · 背景: Issue #39（升级后内置 `node.exe` 损坏 → `spawn EFTYPE`）

## 1. 问题回顾

#39 中用户升级后运行 Harness 报 `spawn EFTYPE`：健康检查与代码签名级校验均指向
`resources\harness\node\node.exe` 内容损坏（PE 头不再是 `MZ`）。CI 打包产物本身校验
正常（打包冒烟 + 资产校验都过），因此损坏发生在**用户机的升级/落盘环节**，而非构建环节。
本版（shell.5）已交付：健康检查校验可执行文件魔数、错误页与诊断报告给出"完整重装"指引。
本文分析残留如何在 NSIS 升级路径上产生，并给出待真机验证的测试矩阵与候选修复。

## 2. 我们 Windows 安装/升级的实际机制

`electron-builder.yml` 关键配置：

- `win.target: nsis`，`nsis.oneClick: false`，`allowToChangeInstallationDirectory: true`
  → 协助式（assisted）安装器，允许自定义目录。
- Harness 全部在 **asar 之外**（`extraResources: resources/harness/**`、`mobile-shell`、
  `agent-trash-hook`），因为原生模块与子进程 spawn 需要真实路径。
- 增量更新由 electron-updater 完成：读 `latest.yml` + `.blockmap`（仅加速下载），
  实际执行仍是**完整 NSIS 安装器**；旧版本卸载器先以静默方式运行，再落新文件。

### 残留如何产生（按可能性排序）

1. **升级中断导致半写文件**：NSIS 复制 `resources\harness\node\**` 是按文件覆盖。
   断电/强制重启/安装器被杀在写 `node.exe` 中途 → 留下截断文件；下一次升级**会**
   再次覆盖同名文件，所以"残留"要成为持续故障，必须叠加 2 或 3。
2. **文件被占用/锁定**：杀毒软件（含 Windows Defender 实时扫描、第三方 AV 静默隔离）
   或残留的 node 子进程持有 `node.exe` 句柄。NSIS 复制失败时协助式安装器通常弹重试/忽略，
   用户点忽略即跳过该文件 → 旧损坏文件留下，且新版本不再触碰（文件时间戳"已新"）。
3. **AV 隔离/替换写入**：AV 把刚写入的可执行文件隔离或"修复"，写回损坏内容。
   这解释了 #39 中"CI 产物正常、用户机损坏、且无升级中断记录"的组合。
4. **旧版本文件不再被新版本清单覆盖**：`extraResources` 是按文件复制，不做"先清空"。
   老内核 closure 里存在、新 closure 移除的包会残留在
   `resources\harness\node_modules\`（对运行无直接危害，但会占空间并干扰排障）。
5. **userData 有意保留**（`%APPDATA%\dsh-desktop`：日志、dsh home、内核 overlay、
   safe-mode 记录）。这不是缺陷，但排障时要知道它**不随升级清理**。

asar 内的 `lib/**` 由安装器整体替换，风险最低；deb 升级由 dpkg 全量替换包内文件，
没有同类按文件残留问题；macOS dmg 拖拽安装是整目录替换，同样不受影响。

## 3. 已交付的缓解（本版起生效）

- 健康检查对内置 node 可执行文件做魔数校验（PE `MZ` / Mach-O / ELF），损坏即"失败"
  并给出"重新下载安装包完整重装"指引（zh/en 同文案）。
- `spawn EFTYPE/ENOENT` 归类为运行时损坏：内建错误页显示 `page.runtimeHint`，
  诊断报告追加 `# Runtime spawn` 小节。
- 打包冒烟崩溃时输出 harness 日志尾部（SMOKE_TEST），为下一次复现留现场。

## 4. 候选修复（未实施，按收益排序）

1. **安装前清空 Harness 目录**：自定义 NSIS include（`nsisInclude`）在复制前执行
   `RMDir /r "$INSTDIR\resources\harness"`。一次性消除 1/2/4 的残留面；
   需要处理"清空后复制中途失败"的窗口（先删后拷比原地覆盖更糟的时长约数秒）。
2. **启动时清单校验 + 自修复**：打包时生成 `resources/harness/manifest.json`
   （路径→sha256），启动校验失败时从安装器内嵌副本恢复或引导重装。
   已有健康检查魔数校验是该方案的弱化版，升级为全量哈希成本可控。
3. **升级前检测 node 占用**：安装器启动时尝试以独占方式打开 `node.exe`，
   占用即提示"关闭 Harness/终端后重试"，把"忽略"式静默损坏变成显式失败。

## 5. 真机测试矩阵（待执行；当前无 Windows 真机/VM 在环）

| 编号 | 场景 | 步骤 | 期望 |
| --- | --- | --- | --- |
| T1 | 基线升级 | 旧版安装 → 官网新版安装器升级 | 升级后 `node.exe` sha256 与发布 pin 一致，应用可启动 |
| T2 | 预置损坏 | 安装后手写 16B 垃圾进 `node.exe` → 关闭应用 → 升级 | 新文件覆盖损坏文件；健康检查 ok |
| T3 | 句柄占用 | 从安装目录启动一个 node 进程保持运行 → 升级 | 安装器应报占用/重试；若点忽略，健康检查应报"失败 + 重装指引" |
| T4 | 只读属性 | 将 `node.exe` 设为只读 → 升级 | NSIS 复制成功或显式失败；不得静默留旧 |
| T5 | 卸载重装 | 卸载（保留 AppData）→ 重装 | userData 保留；健康检查全绿 |
| T6 | AV 干扰 | 开启 Defender 实时扫描 + 第三方 AV → 反复升级 3 次 | 无损坏；若复现 `EFTYPE`，记录 AV 名称与行为 |

执行环境要求：Windows 10/11 x64 实机或快照 VM；执行后把结果回填本表并在
HANDOFF 记录。若 T3/T4/T6 出现静默残留，优先实施 §4.1（清空式升级）。
