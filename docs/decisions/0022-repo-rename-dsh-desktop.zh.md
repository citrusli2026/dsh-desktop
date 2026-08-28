# 0022:仓库改回 `dsh-desktop`

- 日期:2026-08-29
- 状态:已接受
- English:[0022](0022-repo-rename-dsh-desktop.md)

## 背景

决策 0013 把产品定为 `dsh-desktop` 同时刻意保留仓库名
`citrusli2026/dsh-electron-shell`,GitCode 镜像与 R2 镜像路径都派生自它。
两个名字并存持续产生摩擦:每条 URL、每篇文档、每条验证命令都带着产品
从不使用的名字,而且每发布一条新链接都在加深对旧名的投入。当前用户量
还小,干净改名的代价(散落在外部的旧链接、已装客户端静默失去更新提示)
此刻最低,以后只会更高。

## 决策

- GitHub 仓库改名为 `citrusli2026/dsh-desktop`;GitCode 镜像同步改为
  `citrusli2026/dsh-desktop`,R2 镜像前缀今后用 `dsh-desktop/<tag>/`
  (已存在的 R2 对象保留在旧前缀下)。
- 代码、CI、官网、文档、发布工具里的所有仓库引用统一更新为新名;
  `site/data/release.json` 重新生成。
- `appId` 保持 `io.github.citrusli2026.dsh-electron-shell`——0013 的理由
  (安装身份与升级连续性)依然成立;appId 是包标识,不是链接。
- **永不重建名为 `citrusli2026/dsh-electron-shell` 的仓库。**GitHub 对
  旧名的自动重定向(web、git、API)在同名仓库再次出现的瞬间失效,届时
  所有已发布链接断链,旧客户端的更新源会指向一个毫不相干的仓库。
- 接受的破坏(用户量小):改名前安装的 macOS 构建不再弹更新提示——其
  硬编码的发布 URL 白名单(`src/main/update-check.ts`)只认旧仓库路径,
  应用照常运行,但需从官网手动更新;改名前发布的 GitCode 链接可能失效。
  二者均不发兼容版本。

## 后果

- 正面:仓库、产品、安装包、官网、镜像、验证命令统一为一个名字;
  0013 遗留的"产品叫 dsh-desktop、URL 叫 dsh-electron-shell"的拧巴消失;
- 负面:外部的旧链接依赖 GitHub 重定向;旧 macOS 构建在手动升级前不再
  提示更新;GitCode 与 R2 的历史内容只能经新路径访问(GitCode 旧 API
  路径仍别名可用,R2 旧对象保留)。

## 备选方案

- 先发一版把更新白名单放宽到新旧两个仓库名再改名:对已装客户端正确,
  但在当前用户量下不值得——否决;
- 维持 0013 的双名并存:摩擦永久存在且随发布链接增多而放大——否决。
