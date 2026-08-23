# 0017:Linux 发布唯一格式 deb

- 日期:2026-08-23(该变更本身随 v0.1.1-rc.2.shell.1 于 2026-08-22 发布,今日补记)
- 状态:已接受——部分取代 0016 中"排除 Linux"的结论
- [EN](0017-linux-deb-sole-format.md)

## 背景

决策 0016(2026-08-15)刻意把 Linux 排除在发布面之外:"Linux 仍担任 CI
宿主……但不再是打包分发目标"、不发布 deb。现实跑在了决策前面:项目受众中
相当一部分使用国产 Linux 桌面(Debian/Ubuntu 衍生、UOS、Deepin、麒麟),
对他们而言唯一的替代方案是 `npx @deepseek-ai/dsh web`——需要 Node 加 npm
网络,门槛远高于双击安装。构建矩阵因此增加了 Linux 目标(ubuntu-24.04)
产出单一 `.deb`;但决策记录从未更新,文档、流水线与 release 校验契约
长期不一致。

## 决策

- 每个 Release 恰好携带三个安装包:macOS `dsh-desktop-<版本>-arm64-mac.dmg`、
  Windows `dsh-desktop-setup-<版本>.exe`(NSIS)、Linux
  `dsh-desktop-<版本>-amd64.deb`。
- deb 是 **唯一** Linux 格式。不发布 AppImage、snap、flatpak 或 RPM。
  一个包双击安装覆盖 Debian/Ubuntu/UOS/Deepin/麒麟;deb 声明运行时依赖
  (`libnotify4`、`libsecret-1-0`、`libappindicator3-1`),极简系统用
  `sudo apt-get install -y ./dsh-desktop-<版本>-amd64.deb` 而非裸 `dpkg -i` 解析。
- Release 仍为严格 8 个文件:三个安装包 + 三个 `.sha256` + `latest.yml` +
  `.exe.blockmap`;校验器拒绝缺失或多余的文件。
- deb 在 ubuntu-24.04 runner 上构建(electron-builder 的 deb 需要 Linux
  宿主,electronDist 是平台相关本地 Electron);chrome-sandbox SUID 来自
  electron-builder 默认 postinst。

## 后果

- 每个支持桌面平台仍只有一个明显的大体积下载;8 文件契约保持可审计
  (三种安装包,无 ZIP/元数据扩散)。
- Linux 目标在发布前经 CI 全量验证:打包 smoke 链(基本、S2.5 渲染、
  S1 故障注入)、打包 E2E、以及 deb 安装态冒烟(真实 SUID sandbox,
  安装/重装/卸载语义)——见 docs/ARCHITECTURE.md 第 3 节与
  docs/test-hardening-plan.md。
- 0016 中与之冲突的表述被取代("Linux……不再是打包分发目标"、不发布
  deb);0016 其余内容仍然有效。

## 备选方案

- 维持 0016 的双端发布面:最简,但排除项目面向的国产 Linux 桌面——因受众被拒。
- AppImage:便携通用,但在 Debian/Ubuntu/UOS/Deepin/麒麟上双击安装体验
  远不及 deb,且给发布契约增加第二个 Linux 文件——被拒。
- 不重打包只给 `npx` 指引:用户机器需自装 Node/npm,违背壳的零配置承诺——被拒。
