# HANDOFF — 官网与交付链路

> 更新于 2026-08-15。产品架构与后续迭代见 `docs/HANDOFF.md`;本文只记录
> 官网、发布、镜像和日常运维的当前事实。

## 一、当前状态

| 项 | 状态 |
|---|---|
| 官网 | ✅ <https://dsh-desktop.com>(备用 <https://dsh-electron-shell.vercel.app>) |
| 最新版本 | ✅ `v0.1.0-rc.6.shell.8`,macOS / Windows / Linux 共 11 个资产齐全 |
| 核心发布 | ✅ Release run `31868875099` 成功;只负责构建与 GitHub Release |
| 官网数据 | ✅ `site/data/release.json` 已同步 shell.8;中文镜像不可用时自动回落 GitHub |
| 官网门禁 | ✅ `pnpm run site:check` 校验三平台安装包、资产 URL、本地资源、双语键和 tabs |
| 国内镜像 | 🟡 GitCode release 可创建,但 GitHub runner → OBS 的大文件上传极慢,不作为主发布门禁 |

## 二、本轮交付链路调整

1. `Release` 只做三平台构建、资产汇总和 GitHub 发布。第三方镜像已移到
   独立的 `Release Mirrors` 工作流,镜像失败不会再把完整发布标红。
2. `Site Data Refresh` 监听 `Release` 的 `workflow_run`。这是必要的,因为
   release.yml 使用 `GITHUB_TOKEN` 创建 release 时不会触发另一条 `release`
   事件工作流。checkout 固定到 `main`,提交前 rebase,避免推送旧基线。
3. 官网数据生成器逐资产用 range GET 验证 GitCode;只有真实可下载的资产才
   给中文用户镜像链接,其余回落 GitHub,不会产生镜像死链。
4. 官方 GitHub Actions 已提升到 Node 24 对应主版本;无 pnpm 的任务显式关闭
   setup-node package-manager cache。
5. GitCode 代码仓不具备持续自动同步能力。本次已手动快进 `main` 并推送
   `v0.1.0-rc.6.shell.8`;后续发版前仍需确认 tag 已到 GitCode。

## 三、GitCode 现状

- `v0.1.0-rc.6.shell.3` 回补 run `31867674512` 失败:首个 163 MB deb 上传
  20 分钟后超时,其余大文件未执行。
- `shell.8` 的 GitCode release 已成功创建;资产上传在独立 mirror workflow
  中运行。无论结果如何,官网均以逐资产探测结果决定是否展示镜像。
- 不要把 `file-cdn.gitcode.com` 的签名时效 URL 写入站点;稳定链接必须使用
  `https://gitcode.com/<owner>/<repo>/releases/download/<tag>/<file>`。

## 四、运维速查

| 操作 | 命令 / 入口 |
|---|---|
| 本地验证官网 | `pnpm run site:check` |
| 重新生成下载数据 | `node scripts/gen-site-data.mjs` |
| 手动刷新官网数据 | Actions → Site Data Refresh → Run workflow |
| 重跑某版镜像 | Actions → Release Mirrors → 输入 tag |
| 回补历史版本 | Actions → GitCode Mirror Backfill → 输入 tag |
| 下次壳发版 | `node scripts/version.mjs bump shell` → CI 绿后打 tag → 同步 GitCode main/tag |
| 线上部署 | push `main`;Vercel 项目 root=`site/` 自动部署 |

## 五、已知事项

- GitCode 大文件上传是降级渠道,不得阻塞 GitHub Release 或官网刷新。后续若
  继续投入,优先做分文件并行/可恢复上传或更换国内对象存储,不要继续增加
  单任务超时时间。
- macOS 仍未签名/公证;首次运行需右键打开,应用只检查新版本并引导下载。
- `*.vercel.app` 在国内可能受 DNS 影响;正式域名使用 `dsh-desktop.com`。
