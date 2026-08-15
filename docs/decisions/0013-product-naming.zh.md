# 0013:产品命名——应用与安装包用 `dsh-desktop`,仓库保持 `dsh-electron-shell`

- 日期:2026-08-15
- 状态:已接受
- English:[0013](0013-product-naming.md)

## 背景

项目一直背着两个名字:仓库名(`dsh-electron-shell`)和产品名
(`DSH Electron Shell` 应用、`dsh-electron-shell-*` 安装包)。长名字
读起来像描述而不是产品;业主要求统一为一个短产品名,同时保持仓库名
不变(链接、R2 桶、GitCode 镜像、appId 都派生自它)。

## 决策

- **产品名:`dsh-desktop`**——`package.json` 的 `name`、
  electron-builder 的 `productName`(.app 文件名、菜单栏名称、DMG
  卷名)、安装包名(`dsh-desktop-<版本>-arm64-mac.dmg`、
  `dsh-desktop-setup-<版本>.exe` 等)、托盘/菜单/关于面板文案、壳页面
  标题、日志前缀。加载完成后窗口标题仍由 harness UI 自己的
  "DeepSeek Harness" 接管——壳的界面叫 `dsh-desktop`,harness 的界面
  维持上游原样。
- **保持不变**:GitHub 仓库 `citrusli2026/dsh-electron-shell`(及所有
  指向它的 URL)、`appId`(`io.github.citrusli2026.dsh-electron-shell`,
  已安装用户的更新/身份连续性)、R2 桶与镜像路径、历史决策记录。

## 后果

- 正面:应用、安装包、网站文案、release 标题统一为一个短产品名;
  仓库链接与镜像不受影响;
- 负面:打包版的 `userData` 目录跟随应用名,从
  `~/Library/Application Support/dsh-electron-shell` 变为
  `…/dsh-desktop`——旧构建的日志与窗口几何状态留在旧目录(都是可丢弃
  的小状态;harness 数据家目录按 0012 是 `~/.dsh-desktop`,不受影响);
- 单实例锁以 `userData` 为键,改名期间新旧两个构建可以同时运行——
  仅在过渡期出现一次。

## 备选方案

- 连仓库一起改名:所有已发布链接、R2 镜像路径、appId 连续性都会断,
  用户侧收益几乎为零——否决;
- 用带空格大写的 `DSH Desktop`:安装包名带空格已被 0008 否决
  (upload-artifact 会把空格改写成点,electron-updater 会找不到文件)——否决。
