# 0008:体积优化与国内下载通道

- 日期:2026-02-09
- 状态:已接受
- English:[0008](0008-size-and-cn-download-channels.md)

## 背景

v0.1.0-pre.0 发布后暴露两个发布质量问题:安装包偏大(dmg 236MB /
zip 259MB / exe 184MB / AppImage 248MB / deb 178MB);且国内大量用户无法
稳定访问 github.com,直接影响"下载即用"的目标。

## 决策

**体积(不删任何功能)**:

- 部署脚本裁剪闭包中与运行时无关的内容:node-pty 的异平台 prebuilds(58MB,
  其 loader 使用 `prebuilds/<平台>-<架构>`,已在内置 Node 下实测可用)、
  node-pty 构建期源码、全部 `*.map`(19MB)、全部 `*.d.ts`(13MB)、
  `@types/`(2.8MB);许可证文件一律不动。闭包 349MB → 188MB;
  实测 dmg 237MB → 209MB、zip 259MB → 223MB(压缩参数不变);
- NSIS 改为最高压缩;dmg 镜像由 UDZO(zlib)改为 UDBZ(bzip2),
  以发布构建的一次性时间换体积;
- Electron 本体、内置 Node、以及所有 agent 能力一概不动——
  "靠砍功能瘦身"被明确排除。

**国内下载通道**:

- README(中英)写明社区加速前缀用法,给出当前可用的候选
  (`ghproxy.net` 于 2026-08 实测可用;备选 `gh-proxy.com`、`ghfast.top`),
  并明确声明这些镜像由社区免费运营、可用性会波动;
- release 流水线新增可选任务 `mirror-r2`:把全部资产上传到 Cloudflare R2
  (10GB 免费存储、出口流量免费),前缀 `dsh-desktop/<tag>/`,
  由仓库 secrets `R2_ACCOUNT_ID` / `R2_API_TOKEN` 开关——未配置时静默跳过,
  fork 与 CI 不受影响。

## 后果

- 正面:安装包缩小约 15-20% 且零功能损失;配置 secrets 后拥有稳定、免费、
  可自动化的镜像通道,当下也有零配置的加速前缀可用;
- 负面:UDBZ 拉长 macOS 发布腿耗时(每版一次);社区代理天然不稳定,
  README 已如实说明并列出备选。

## 备选方案

- 通过删除能力(sharp / pi-ai / otel 供应商)瘦身:违背"功能保持不变",否决;
- 自建 CDN(OSS/COS/又拍云):持续成本与实名合规,不免费,暂缓;
- Gitee release 镜像:单文件 100MB 上限 vs 150-260MB 资产,否决。
