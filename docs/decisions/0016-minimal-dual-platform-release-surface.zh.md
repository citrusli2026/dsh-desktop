# 0016:最小双端发布面

- 日期:2026-08-15
- 状态:已接受
- English:[0016](0016-minimal-dual-platform-release-surface.md)

## 背景

此前 Release 同时暴露 macOS、Windows、Linux 共 11 个文件:多种安装格式、
blockmap 与 electron-updater 元数据。其中大部分服务于边缘平台或内部更新机制,
而不是两个主要桌面下载,导致发布、镜像、官网与支持说明都更难审计。

## 决策

- 公开发布只支持两个桌面目标:Apple Silicon macOS 与 x64 Windows。
- 每版严格只有两个大体积安装包:
  `dsh-desktop-<版本>-arm64-mac.dmg`、
  `dsh-desktop-setup-<版本>.exe`。每个安装包旁边提供一个标准 sha256sum 文件
  (`<安装包>.sha256`),面向用户且可验证的资产最多四个。
- 不上传 ZIP、AppImage、deb、macOS updater 元数据与次要安装格式。只保留
  Windows 已安装客户端原地更新必需的小型 `latest.yml` 与
  `dsh-desktop-setup-<版本>.exe.blockmap`。
- 发布校验器既拒绝缺少文件,也拒绝额外文件,并在发布前核验 checksum、更新
  引用与严格六文件 Release。
- 两个平台的打包应用仍必须在 CI 中实际启动内置 Harness。Linux 继续作为
  源码级 Electron E2E 与 Harness smoke 的 CI 宿主,但不再是打包分发目标。
- Windows 保留 `electron-updater`;未签名的 macOS 延续决策 0010 的仅检查
  GitHub Releases 流程。
- 官网数据只保存和渲染两个安装包及其可选 checksum 记录。没有 checksum 的
  历史版本仍展示两个主安装包;新版本必须通过严格六文件发布门。

## 后果

- 每个平台只有一个明确的大体积下载,更新侧文件保持小型且不在官网展示;
- Release 存储、镜像工作、官网逻辑与支持分支显著收敛,面向用户的资产最多
  四个、大文件固定两个;
- Linux 包、Intel macOS 与 macOS ZIP 明确不在范围内。其他平台
  用户可使用上游 `npx @deepseek-ai/dsh web`;
- Windows 保留现有更新便利,同时不重新扩大安装包矩阵。未来 macOS 签名/公证
  完成后可以重新评估,但不能静默扩大大文件矩阵。

## 备选方案

- 只发两个安装包、不带哈希:数量最少,但用户无法独立验证大体积未签名下载,否决;
- 删除所有 updater 元数据:Release 最小,但会破坏已安装 Windows 客户端的有用
  更新能力,否决;
- 继续发布 Linux 与 macOS 次要格式:对边缘用户有用,但违背明确的双端聚焦,否决。
