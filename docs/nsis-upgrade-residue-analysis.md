# NSIS 升级残留分析（Windows 安装器）

最后更新: 2026-09-14（shell.8 实施矩阵与安装器加固）· 背景: Issue #39（升级后内置 `node.exe` 损坏 → `spawn EFTYPE`）

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

## 4. 修复实施状态（2026-09-14，shell.8）

先核对 electron-builder 26.15.3 模板事实（`templates/nsis/`）：

- **auto-update 路径**（electron-updater 带 `--updated` 旗标）：卸载器先把整个
  `$INSTDIR` 原子改名到 `$PLUGINSDIR\old-install`（busy 时还原并中止），
  已天然免疫按文件残留。
- **手动双击升级**（无 `--updated`）：走逐文件 `RMDir /r`，readonly/hidden/
  system/locked 文件被**静默跳过**——残留主战场。
- 安装路径没有 pre-copy 用户钩子（`customInstall` 在复制之后）；
  `customRemoveFiles` 属于卸载器，定义它会替换掉上述原子逻辑，故不使用。

据此交付（全部在 `build/installer.nsh`，随新安装器生效，任何旧基线升级即受益）：

1. **属性清理**（`customInit`，对应候选 §4.1 的安全变体）：安装一开始以
   `attrib -R -H -S ... /S /D` 清除旧安装 `resources\*` 的只读/隐藏/系统位，
   让旧卸载器的 `RMDir /r` 能真正删净；改动可取消（用户中止只丢只读位）。
2. **占用预检**（`customInit`，对应候选 §4.3）：独占打开旧
   `resources\harness\node\node.exe`，被占用即弹双语「关闭后重试」；
   **静默安装退出码 5**（CI 与 electron-updater 得到显式失败而非静默坏升级）。
3. **清单校验**（候选 §4.2 检测半）：`resources/manifest.json`（sha256）随包
   生成（macOS 在签名后 seal），健康检查/诊断/启动闭包冒烟比对全量文件；
   残留由「不可见」变为「带具体文件路径的失败 + 重装指引」。
   自修复不做：与决策 0031（不自动改写文件）一致，指引重装。

## 5. 测试矩阵状态

| 编号 | 场景 | 状态 | 自动化 |
| --- | --- | --- | --- |
| T1 | 基线升级 | ✅ CI 既有 `smoke-upgrade.mjs nsis`（含 7 用户文件断言） | release.yml Windows |
| T2 | 预置损坏（+未来 mtime）后升级 | ✅ CI `smoke-nsis-residue.mjs` S1：升级后 node.exe sha256 必须等于包内清单 | release.yml Windows |
| T3 | 句柄占用 | ✅ CI S3：锁定的 node.exe 在静默升级中**显式退出码 5**；释放后重装成功且清单一致 | release.yml Windows |
| T4 | 只读属性 | ✅ CI S2：属性清理 + 升级后 node.exe 与清单一致（静默不残留） | release.yml Windows |
| T5 | 卸载重装保留 userData | ✅ CI `smoke-upgrade.mjs`（卸载→重装，userData 逐文件断言） | release.yml 三平台 |
| T6 | 第三方 AV 干扰反复升级 | ⏸ 人工项（无 Windows 真机/可控第三方 AV）；GitHub runner 只有 Defender | 待 Windows 硬件 |

执行环境要求：T6 需 Windows 10/11 x64 实机或快照 VM + 可控第三方 AV；执行后把
结果回填本表并在 HANDOFF 记录。闭包清单的篡改检测另有三平台打包冒烟
（`DSH_SMOKE_CLOSURE=1`：干净树 status=ok + 篡改后 status=changed）。
