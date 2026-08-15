# HANDOFF — 官网与交付链路

> 更新于 2026-08-15。产品架构与后续迭代见 `docs/HANDOFF.md`;本文只记录
> 官网、发布、镜像和日常运维的当前事实。

## 一、当前状态

| 项 | 状态 |
|---|---|
| 官网 | ✅ <https://dsh-desktop.com>(备用 <https://dsh-electron-shell.vercel.app>) |
| 本次发布目标 | 🟡 `v0.1.0-rc.6.shell.10`;本地门禁通过后提交,主分支 CI 通过再推 tag |
| 主分支 CI | ✅ run `31870759765`;38 项单测、官网门禁、构建、三条 xvfb 冒烟全绿 |
| 核心发布 | ✅ Release run `31870835413`;tag/版本、制品矩阵、更新元数据均通过门禁 |
| 官网数据 | ✅ refresh run `31871089497`;`release.json` 已自动提交为 shell.9 |
| 国内镜像 | 🟡 GitCode `main` 与 shell.9 tag 已同步;发行版资产改人工上传(见第四节),shell.9 三个安装包待维护者手动补齐 |

## 二、官网浅色体系与声明精简(2026-08-15 已提交部署,无新 tag)

1. 官网视觉已参考 DeepSeek 官网当前设计令牌调整为浅色体系:`#f9f8f8` 页面底色、
   `#1e232c` 正文、`#4d6bfe` 品牌蓝,正文使用 DM Sans,标题使用 Host Grotesk,
   卡片采用 16/24 px 圆角与轻玻璃层;静态缓存键升至 `v=13`。
2. 社区身份声明已按人工审核意见精简:顶栏标签与首屏提示只保留“社区出品 /
   非官方”与官方站点外链,“与 DeepSeek AI 无隶属、授权或合作关系”的正式
   法律句式仅保留在页脚一处;FAQ 第 3 条作为对直接提问的回答维持不变。
3. 下载区按人工审核意见收敛为 macOS / Windows 双平台:每个资产并列 GitCode
   镜像(可用时)与 GitHub 两个下载按钮,中文界面镜像在前;Linux 不再展示,
   引导至命令行;“全部文件”折叠表随更新元数据一并移除。
4. Apple Silicon 本地产物已生成:
   `dist/dsh-desktop-0.1.0-rc.6.shell.9-arm64-mac.{dmg,zip}`。本机 Apple
   Development 签名验证通过但未公证;DMG SHA-256 为
   `1ba98e73df9a30a3af50160a004ab565b81c7d927f1cbbb46971cdab16c0a77e`,ZIP 为
   `d1aa8957b61b207693d42c340429b9eb078811ac2fc9bbe3e69f8c624f695108`。
5. 当前仓库没有 iOS/Xcode 工程;Electron 交付目标是 macOS、Windows、Linux。
   如需 iPhone/iPad 包,必须另立 SwiftUI 或跨平台客户端,不能从现有 Electron
   配置直接生成。

## 三、shell.9 官网与交付变化

1. 官网首屏从“有一个桌面窗口”转为“可靠桌面工作台”,新增四项可信基线、
   三步运行链路和“桌面壳新增 / Harness 保持原样”边界对照。
2. 六项能力改为直接扫读的卡片矩阵;补齐键盘跳转与焦点、窄屏布局、降动效、
   canonical/结构化数据,静态资源缓存键升至 `v=10`。
3. 发布前新增独立 `verify` job,再次执行 typecheck、测试、官网校验、构建并
   校验 tag 与 `package.json` 版本一致。
4. 三平台产物汇总后,`scripts/check-release-assets.mjs` 要求 11 个预期文件
   全部存在,并验证三份 `latest*.yml` 指向本次版本对应的安装包,通过后才发布。
5. `Site Data Refresh` 已验证 Release 完成后可自动生成、提交 shell.9 数据,
   该提交会继续触发 Vercel 部署。

## 四、发布与官网数据流

```text
main push → CI + Vercel
tag push  → Release verify
             → macOS / Windows / Linux 并行打包
             → 11 资产 + updater 元数据门禁
             → GitHub Release
                ├─ Site Data Refresh → main/release.json → Vercel
                ├─ Release Mirrors → R2(可失败、不中断主发布)
                └─ GitCode 镜像 = 人工:维护者在发行版页手动上传
                   dmg / zip / exe,再手动触发一次 Site Data Refresh
```

GitCode 自动推送已在 shell.8/9 连续失败(跨境 ~150 KB/s,预签名 URL 过期
502);拉取式流水线方案评估后放弃,决策与过程见 docs/decisions/0008 第二
修订。人工上传只需三个面向用户的安装包;blockmap / latest*.yml 不镜像,
auto-updater 始终直连 GitHub。
官网数据生成器逐资产用 range GET 探测 GitCode;中文页面在镜像 URL 真实
可下载时并列展示镜像与 GitHub 两个下载源,否则只展示 GitHub。不要把带
时效签名的 CDN URL 写入站点。

## 五、运维速查

| 操作 | 命令 / 入口 |
|---|---|
| 本地验证官网 | `pnpm run site:check` |
| 本地静态预览 | `python3 -m http.server 4173 --directory site` |
| 重新生成下载数据 | `node scripts/gen-site-data.mjs` |
| 校验汇总制品 | `node scripts/check-release-assets.mjs <目录> <v-tag>` |
| 手动刷新官网数据 | Actions → Site Data Refresh → Run workflow |
| 补齐 GitCode 镜像 | GitCode 发行版页手动上传 dmg/zip/exe → 再触发一次 Site Data Refresh |
| 回补历史版本 | 同上(人工);GitHub 侧 GitCode Mirror Backfill 仅小文件实际可用 |
| 下次壳发版 | `node scripts/version.mjs bump shell` → CI 绿 → 推 tag |
| 线上部署 | push `main`;Vercel 项目 root=`site/` 自动部署 |

## 六、已知事项

- GitCode 资产镜像为人工渠道:发版后维护者在发行版页手动上传 dmg/zip/exe,
  再触发 Site Data Refresh 让官网识别(根因与方案评估见 0008 第二修订:跨境
  推送 ~150 KB/s 且预签名 URL 过期 502;拉取式流水线复杂度不成比例,放弃)。
  自部署 gh-proxy(`GH_PROXY_PREFIX` 思路)仅作备选;公共代理实例实测
  不可靠(mirror.ghproxy.com / ghfast.top 已失联),不进入任何链路。
- GitCode `main` 已快进到 `815b472`;镜像流程曾把 shell.9 tag 建在旧提交
  `c94e70b`,已精确修正为发布提交 `23c4c23`。后续仍要在发版后核对 tag peeled
  commit,不能只检查“同名 tag 已存在”。
- macOS 仍未签名/公证;首次运行需右键打开,应用只检查更新并引导下载。
- `*.vercel.app` 在国内可能受 DNS 影响;正式域名使用 `dsh-desktop.com`。

## 七、shell.10 发布内容与官网第二轮

- Electron Shell 已完成无可见标题栏的全高内容窗口（保留平台原生窗口按钮与
  透明拖拽区）、中英原生菜单、系统语言首次选择、Harness 语言/主题实时同步、
  About 可信链接、close-to-tray、可确认重启和渲染进程恢复。
- 官网在既有 DeepSeek 风格浅色蓝白体系上同步新增能力，仍显著标注“社区版 ·
  非官方”；`site:check` 当前验证 75 项双语键，1440 px 与 390 px 实机检查通过。
- CI/Release 候选门禁新增真实 Electron E2E 与三平台 packaged smoke。本机
  Apple Silicon 签名基线包通过严格 codesign；包含最终菜单的 `dist-review`
  审核包显式跳过重复签名，但已隔离启动自身 Harness 并保持运行供人工审核。
  未公证导致 `spctl` 拒绝是已知且预期的分发限制。
- 本次发布提交已将版本 bump 为 shell.10；只在主分支 CI 通过后推 tag，Release
  三平台制品完成后再由 Site Data Refresh 更新官网 release 数据。完整顺序见
  `docs/plans/electron-shell-capabilities.md`。
