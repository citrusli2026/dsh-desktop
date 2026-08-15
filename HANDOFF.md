# HANDOFF — 官网与交付链路

> 更新于 2026-08-15。产品架构与后续迭代见 `docs/HANDOFF.md`;本文只记录
> 官网、发布、镜像和日常运维的当前事实。

## 一、当前状态

| 项 | 状态 |
|---|---|
| 官网 | ✅ <https://dsh-desktop.com>(备用 <https://dsh-electron-shell.vercel.app>) |
| 最新版本 | ✅ `v0.1.0-rc.6.shell.9`,macOS / Windows / Linux 共 11 个资产齐全 |
| 主分支 CI | ✅ run `31870759765`;38 项单测、官网门禁、构建、三条 xvfb 冒烟全绿 |
| 核心发布 | ✅ Release run `31870835413`;tag/版本、制品矩阵、更新元数据均通过门禁 |
| 官网数据 | ✅ refresh run `31871089497`;`release.json` 已自动提交为 shell.9 |
| 国内镜像 | 🟡 GitCode release/资产为独立尽力而为渠道,不阻塞 GitHub 与官网 |

## 二、shell.9 官网与交付变化

1. 官网首屏从“有一个桌面窗口”转为“可靠桌面工作台”,新增四项可信基线、
   三步运行链路和“桌面壳新增 / Harness 保持原样”边界对照。
2. 六项能力改为直接扫读的卡片矩阵;补齐键盘跳转与焦点、窄屏布局、降动效、
   canonical/结构化数据,静态资源缓存键升至 `v=9`。
3. 发布前新增独立 `verify` job,再次执行 typecheck、测试、官网校验、构建并
   校验 tag 与 `package.json` 版本一致。
4. 三平台产物汇总后,`scripts/check-release-assets.mjs` 要求 11 个预期文件
   全部存在,并验证三份 `latest*.yml` 指向本次版本对应的安装包,通过后才发布。
5. `Site Data Refresh` 已验证 Release 完成后可自动生成、提交 shell.9 数据,
   该提交会继续触发 Vercel 部署。

## 三、发布与官网数据流

```text
main push → CI + Vercel
tag push  → Release verify
             → macOS / Windows / Linux 并行打包
             → 11 资产 + updater 元数据门禁
             → GitHub Release
                ├─ Site Data Refresh → main/release.json → Vercel
                └─ Release Mirrors → GitCode(可失败、不中断主发布)
```

官网数据生成器逐资产用 range GET 探测 GitCode;中文页面只在稳定镜像 URL
真实可下载时采用镜像,否则回落 GitHub。不要把带时效签名的 CDN URL 写入站点。

## 四、运维速查

| 操作 | 命令 / 入口 |
|---|---|
| 本地验证官网 | `pnpm run site:check` |
| 本地静态预览 | `python3 -m http.server 4173 --directory site` |
| 重新生成下载数据 | `node scripts/gen-site-data.mjs` |
| 校验汇总制品 | `node scripts/check-release-assets.mjs <目录> <v-tag>` |
| 手动刷新官网数据 | Actions → Site Data Refresh → Run workflow |
| 重跑某版镜像 | Actions → Release Mirrors → 输入 tag |
| 回补历史版本 | Actions → GitCode Mirror Backfill → 输入 tag |
| 下次壳发版 | `node scripts/version.mjs bump shell` → CI 绿 → 推 tag |
| 线上部署 | push `main`;Vercel 项目 root=`site/` 自动部署 |

## 五、已知事项

- GitCode 大文件上传是降级渠道。若继续投入,优先实现逐文件并行/可恢复上传或
  更换国内对象存储,不要让它重新进入核心 Release 依赖链。
- GitCode 代码仓仍需显式快进 `main` 并推同名 tag;本次 shell.9 发布后要确认。
- macOS 仍未签名/公证;首次运行需右键打开,应用只检查更新并引导下载。
- `*.vercel.app` 在国内可能受 DNS 影响;正式域名使用 `dsh-desktop.com`。
