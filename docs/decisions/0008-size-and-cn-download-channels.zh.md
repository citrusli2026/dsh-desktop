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
- NSIS 保持 electron-builder 默认(v26 已移除 `compression` 选项);
  dmg 镜像由 UDZO(zlib)改为 UDBZ(bzip2),以发布构建的一次性时间换体积——
  实测 dmg 209MB → 185MB,zip 不变(223MB);
- Electron 本体、内置 Node、以及所有 agent 能力一概不动——
  "靠砍功能瘦身"被明确排除。

**国内下载通道**:

- README(中英)写明社区加速前缀用法,给出当前可用的候选
  (`ghproxy.net` 于 2026-08 实测可用;备选 `gh-proxy.com`、`ghfast.top`),
  并明确声明这些镜像由社区免费运营、可用性会波动;
- release 流水线新增可选任务 `mirror-r2`:把全部资产上传到 Cloudflare R2
  (10GB 免费存储、出口流量免费),前缀 `dsh-electron-shell/<tag>/`
  (随仓库改名自 `dsh-desktop/<tag>/` 变更,旧前缀对象保留不动),
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

## 修订 2026-08-15:GitCode 作为第二渠道

维护者网络下的实测:github.com 直连约 100KB/s,社区代理约 4MB/s,而
GitCode 托管的附件由国内华为云 CDN 节点分发(CNAME `*.cdnhwc*`、OBS S3
响应头)。GitCode OpenAPI 已于 2025-06 补齐 release 创建与附件
`upload_url` 接口,因此 release 流水线新增 `mirror-gitcode` 任务(仓库
变量 `GITCODE_REPO` + secret `GITCODE_TOKEN` 开关),作为与 R2 并列的
国内快速渠道。2026-08-15 已实测联通(`scripts/gitcode-upload.mjs`):
`upload_url` 返回 OBS 预签名 PUT 地址与签名头(`x-obs-callback` 负责把
对象登记为 release 附件);稳定附件链接为
`gitcode.com/<仓库>/releases/download/<tag>/<文件>`,只有背后的
`file-cdn.gitcode.com` 直链带时效签名,对外文案一律用前者。
R2 继续承担稳定、自有、(中国以外)全球快的固定 URL 角色。

## 修订 2026-08-15(之二):镜像改人工上传,官网收敛为 macOS/Windows 双平台双源

`mirror-gitcode` 推送任务在 shell.8/9 连续失败,根因是 GitHub 海外 runner →
GitCode OBS 跨境推送仅 ~150 KB/s,单个 ~200 MB 资产约 18 分钟,OBS 预签名
PUT URL 在传完前过期返回 502,脚本 fail-fast 使整批中止。曾设计 GitCode 侧
流水线拉取式镜像(国内 runner 从 GitHub 拉取后写入 OBS),经维护者评估后
放弃:为降级渠道再维护一套跨平台流水线,复杂度不成比例。

现行机制改为**人工上传**:发版后由维护者在 GitCode 发行版页面手动上传
macOS(dmg/zip)与 Windows(exe)三个面向用户的安装包——维护者处于国内
网络,浏览器上传畅通,这正是其他项目(如 DeepSeek-Harness dmg)采用的方式。
blockmap / latest*.yml 不镜像:auto-updater 始终直连 GitHub,站点也不展示
这些工程文件。上传完成后手动触发一次 `Site Data Refresh`,
`gen-site-data.mjs` 的 range GET 探测会把对应资产标记为 `gitcode_ok`,
官网随之自动展示镜像源。

官网下载区同步收敛:

- 只渲染 macOS 与 Windows 两组;Linux 资产仍在 GitHub Release 中发布
  (脚本与 CI 门禁不变),但官网不再展示,文案引导 Linux 用户使用
  `npx @deepseek-ai/dsh web`;
- 每个资产并列两个下载按钮:GitCode 镜像(`gitcode_ok` 时)与 GitHub,
  中文界面镜像在前,英文界面 GitHub 在前;不再按语言硬切换单一来源;
- 移除“全部文件(含差量更新元数据)”折叠表——更新元数据由
  electron-updater 程序化直连 GitHub,站点展示它没有用户价值;
- GitHub 侧 `release-mirrors.yml` 的 `mirror-gitcode` 任务删除,仅保留
  `mirror-r2`;`scripts/gitcode-upload.mjs` 保留并强化了重试(每次重试
  重新取签名 URL、单文件失败不阻断),仅供手动/调试使用。
