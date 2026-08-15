# 0010:macOS 仅检查式更新提示

- 日期:2026-08-15
- 状态:已接受
- English:[0010](0010-macos-check-only-update.md)

## 背景

决策 0004 采用无签名发布,而 electron-updater 在没有 Apple 签名的情况下
无法在 macOS 上安装更新——因此 macOS 用户完全收不到更新信号,会无声地
停留在旧版本,而 Windows/Linux 正常自动更新。复合版本号(0009)把
"有没有更新的版本"归结为运行版本与 GitHub 最新 release 标签之间的
semver 比较,做这件事不需要 updater 机制。

## 决策

- macOS 采用**仅检查式提示**:从 GitHub Releases API 获取 release 列表,
  纳入非草稿的 prerelease,从可解析版本中选择最高版本再与运行版本比较
  (`src/main/update-check.ts` 的 `latestPublishedVersion` /
  `isNewerVersion`,纯函数模块、有单元测试;无法解析的标签会被忽略——
  发布源是不可信输入)。发现新版本时弹出对话框,主按钮打开
  releases 页面,由用户手动下载并覆盖安装。
- 每次启动自动检查一次,延迟 15 秒以避开启动期的网络高峰;自动检查
  失败保持静默。托盘菜单项(检查更新…)手动触发同一检查并告知结果,
  包括"已是最新"和失败对话框。
- Windows/Linux 不变:继续走 electron-updater 的 `autoDownload` 通道。
- GitHub Releases API 是唯一检查源。GitCode 镜像(0008)不参与轮询
  ——单一权威来源让比较逻辑和失败模式都保持简单。

## 后果

- 正面:macOS 用户无需任何签名设施就能得知新版本;手动覆盖安装与
  本就手动的首次安装(右键 → 打开)体验一致。
- 负面:未认证的 GitHub API 有速率限制(每 IP 每小时 60 次)——由
  "每次启动一次 + 手动点击"天然限流,且检查本身就是尽力而为。
- 两个平台的更新代码路径分叉(提示 vs 自动安装);两者都挂在同一个
  托盘菜单项后面,用户面对的入口是统一的。

## 备选方案

- 用 ad-hoc/自签名跑 electron-updater:macOS 自动更新要求 Apple
  Developer ID 签名,ad-hoc 不合格——否决。
- 在签名落地(0004 的后续阶段)之前 macOS 不给任何更新信号:用户会
  困在旧版本且无从得知——否决。
- 应用内下载并原地替换(Sparkle 式):把"无签名安装"问题换成更难
  的"替换正在运行的 app bundle"问题——推迟到签名落地后再议。
