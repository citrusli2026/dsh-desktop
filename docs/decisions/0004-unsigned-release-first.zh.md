# 0004:先以未签名(unsinged)形式发布,签名后补

- 日期:2026-02-09
- 状态:已接受

## 背景

代码签名影响三件事:macOS Gatekeeper 与公证(notarization)、
Windows SmartScreen 信誉、electron-updater 在 macOS 上的可用性
(mac 更新要求应用已签名)。证书涉及 Apple Developer 账号(99 美元/年)
与维护者私钥管理;本仓库建在个人 GitHub 账号下,起步阶段无证书。

## 决策

第一阶段按 **unsigned 发布**:

- CI 三平台构建产物直接发布到 GitHub Releases;
- macOS 用户首次启动需右键 → 打开(README 明确说明);
- 如果右键 → 打开仍未提供放行选项,README 提供可信来源前提下的应急命令:
  `xattr -dr com.apple.quarantine "/Applications/dsh-desktop.app"` 然后
  `open "/Applications/dsh-desktop.app"`;
- macOS 上自动更新暂不启用,Windows / Linux 的 electron-updater 正常工作;
- 仓库结构与 CI 预留签名位(证书走 CI secrets,签名步骤以后置开关开启),
  拿到证书后补上公证与 mac 自动更新,不改变其他设计。

## 后果

- 正面:最快让"下载即用"闭环;开源仓库无门槛(任何 fork 都能跑通发布流程);
- 负面:mac 用户有首次打开摩擦;SmartScreen 在 Windows 上对未签名 exe
  会提示"更多信息 → 仍要运行",文档需覆盖。

## 备选方案

- 一开始就申请 Apple Developer 并配置公证:拖慢首个版本,且个人账号
  证书管理成本高,推迟;
- 仅发 Windows/Linux:违背"三平台桌面应用"目标,否决。
