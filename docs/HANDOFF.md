# 交接文档 / Handoff — dsh-desktop

> English abstract: dsh-desktop is the unofficial Electron desktop shell for
> DeepSeek Harness (repo keeps the old name `dsh-electron-shell`). This file
> records the 2026-08-15 state: what's shipped, how to build/release, the
> operational gotchas hit on this machine, and what's next. Details live in
> `docs/decisions/` (ADR 0001–0013).

最后更新:2026-08-15 · 版本 `0.1.0-rc.6.shell.7`

## 1. 项目一句话

`dsh-desktop` 是 DeepSeek Harness 的非官方 Electron 桌面壳:自带 Node 22
运行时 + 完整依赖闭包,下载即用,功能等同 `npx @deepseek-ai/dsh web`;壳只
管窗口、进程监督、托盘、菜单、更新,不改 agent 行为。

**命名规则(ADR 0013)**:应用/安装包/壳文案 = `dsh-desktop`;GitHub 仓库
与 URL、appId、R2 桶、GitCode 镜像 = `dsh-electron-shell`(不变);harness
界面文案 = 上游的 "DeepSeek Harness"。

## 2. 当前状态快照(2026-08-15)

今日落地的变更(按提交):

| 提交 | 内容 |
|---|---|
| `996fe28` + `6a72bfd` | P0 修复:错误页重试失败不再卡死;窗口状态持久化;托盘菜单(状态/重启/日志/检查更新);macOS 只检查不安装的更新提示(ADR 0010) |
| `4daba32` | ADR 0011(重试恢复/窗口状态/托盘)+ README 更新 |
| `9d1d534` | 品牌化:中文应用菜单(含帮助链接)、About 面板(复合版本 + 内置 dsh 版本 + 官网链接)、新图标(品牌蓝 DSH + `>_`) |
| `6691bcf` | 数据目录隔离:默认 `DSH_HOME=~/.dsh-desktop`,不再共享 CLI 的 `~/.dsh`(ADR 0012,取代 0003);逃生舱 `DSH_HOME=~/.dsh` |
| `47bcef2` | 产品改名 `dsh-desktop`(ADR 0013) |

- **发布中**:tag `v0.1.0-rc.6.shell.7` 已推送,release 工作流正在构建
  (run 31867605207)——完成后需核对 release 页资产是 `dsh-desktop-*`
  命名且带 `latest*.yml`。
- 测试:24/24 单测 + typecheck + build + 三条 smoke 链路全绿。
- 本机正在运行 `dist/mac-arm64/dsh-desktop.app`(shell.7)。

## 3. 架构速览

```
src/main/index.ts         主进程:窗口、托盘、状态应用、smoke、更新检查调度
src/main/supervisor.ts    harness 子进程生命周期(就绪行协议、退避重启、优雅停止)
src/main/restart-policy.ts 纯函数:退避/预算决策(单测)
src/main/window-state.ts  纯函数:窗口几何校验(单测)
src/main/update-check.ts  纯函数:semver 比较 + 复合版本拆分(单测)
src/main/dsh-home.ts      纯函数:DSH_HOME 解析(默认 ~/.dsh-desktop)(单测)
src/main/menu.ts          应用菜单 + About 面板/对话框
src/main/pages.ts         加载页/错误页(data: URL)
src/main/paths.ts         打包/开发态资源路径
src/preload/index.ts      唯一桥:harness:retry
```

约定:凡含规则的逻辑都抽成无 I/O 纯函数进 `test/`(`node --test`);
CI 跑 typecheck → 单测 → build → bootstrap → 三路 smoke(正常/重试成功/
重试失败恢复,后者由 `DSH_DESKTOP_TEST_RETRY_FAIL=1` 触发)。

常用命令:`pnpm run bootstrap`(备料)→ `pnpm run dev` / `smoke` /
`dist`;版本只经 `node scripts/version.mjs`(show/check/bump)写入。

## 4. 发布流程

1. 提交后 `git tag -a v<version> -m ... && git push origin v<version>`;
2. release.yml 三平台构建 → 建 release(标题 `dsh-desktop $TAG`)→ 传资产
   (含 `latest*.yml` + blockmap)→ R2/GitCode 镜像(配置后自动);
3. `dsh-watch` 每日盯上游 npm,有新 dsh 版本自动开 bump PR(ADR 0009)。

## 5. 本机运维事项与踩过的坑

- **本地 `pnpm run dist` 会超 300s 命令上限**:UDBZ dmg 压缩慢;`.app`
  本体约 5 分钟内完成,超时被杀只影响 dmg 收尾。正式资产交给 CI;
  本地验证用 `dist:dir` 并先备份旧 .app。
- **单实例锁按 userData 计**:本机调试与正在运行的实例冲突时用
  `--user-data-dir=$(mktemp -d)` 绕行。
- **macOS 自动化**:osascript 无辅助功能权限(-1719),System Events
  点菜单不可用;`screencapture -x` 可用(截屏验证 UI)。
- **EACCES 事件(已修)**:`~/.dsh` 某会话目录曾被建成 `drw-------`
  (600,缺 x 位)→ 目录下 open() 全部 EACCES。已 chmod 700 并全量扫描
  无同类。若复发即为上游 dsh bug,可考虑壳内启动自检(扫描修复会话目录权限)。
- **外部插件已清**:`~/.dsh` 里的 `@linxin666` 全家桶(11 包)已删
  (profiles/web 的 package.json/patch/lock 已还原);备份在
  `~/dsh-linxin666-backup-20260815.tar.gz`,确认无问题后可删。

## 6. 并行协作约定(重要)

本仓库有另一个会话在并行工作(负责 `site/` 官网 + GitCode 镜像 backfill
等)。规则:

- 提交前 `git status`,**只 `git add` 自己改的文件**,不碰对方未提交内容;
- 推送前 `git pull --rebase`;树脏时先确认脏文件归属;
- 自己引入的格式错误可能被对方顺手修掉(如 6a72bfd 修了 pages.ts 模板串
  反引号)——以磁盘内容为准,Edit 前必读。

## 7. 待办/下一步

近期:
- [ ] 确认 release `v0.1.0-rc.6.shell.7` 资产齐全(dmg/zip/exe/AppImage/deb + latest*.yml)
- [ ] 确认官网下载卡片随新包名正常(读 release API,应自动跟随)

审查清单中仍未做(按优先级):
- [ ] 日志轮转(harness.log 无封顶)
- [ ] 渲染层权限收紧 `ses.setPermissionRequestHandler` 默认拒绝
- [ ] Windows 优雅退出 `GenerateConsoleCtrlEvent`(ADR 0006 deferred)
- [ ] 诊断导出(打包 logs + 版本信息)
- [ ] Linux deb 无自动更新的提示
- [ ] macOS 签名/公证(ADR 0004,解锁自动更新 + 消除 Gatekeeper 警告)
- [ ] 壳文案 i18n(当前全中文,README 双语)
