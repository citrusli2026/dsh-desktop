# HANDOFF — 交接文档

> 更新于 2026-08-15。本文档汇总 dsh-electron-shell 官网与镜像链路的当前状态、
> 进行中的任务与运维入口,便于交接继续。

## 一、总览

| 项 | 状态 |
|---|---|
| 官网 | ✅ 在线:<https://dsh-desktop.com>(备用 <https://dsh-electron-shell.vercel.app>) |
| 部署 | Vercel 团队 `citrusli-5868s-projects`,项目 `dsh-electron-shell`,root=`site/`,Git 集成 main 分支自动部署 |
| 数据自动化 | `site-refresh.yml`:发版即触发 + 每日两次(北京 10:17/22:17)+ 手动;同步 `site/data/release.json` → 提交 → 自动部署 |
| GitCode 镜像 | 🟡 进行中:配置已启用,存量资产回补中(见第三节) |
| 产品行为变更 | ✅ 桌面数据目录默认独立(`~/.dsh-desktop`),ADR 0012,版本 `0.1.0-rc.6.shell.6`(未发版) |

## 二、已完成的关键变更(2026-08-15)

1. **官网 v2 重设计**(`site/`):深色工程美学(近黑 + 磷光绿)、中英切换
   (顶栏 EN/中,localStorage 记忆)、按语言分源下载——中文走 GitCode 镜像,
   英文走 GitHub;删除了旧的代理前缀"加速"模块。
2. **DSH_HOME 隔离**:`src/main/dsh-home.ts`,默认 `~/.dsh-desktop`,
   `DSH_HOME=~/.dsh` 可恢复共享;测试 `test/dsh-home.test.ts`(全仓 24 测试通过)。
   文档:ADR 0012(取代 0003)、README 中英双版已更新。
3. **数据脚本**:`scripts/gen-site-data.mjs` 逐资产用 range GET 实测 GitCode
   可用性,写入 `gitcode_url` / `gitcode_ok`;镜像缺失自动回退 GitHub,不会死链。
4. **GitHub 仓库配置**(本次新设,之前为空):
   - variable `GITCODE_REPO` = `citrusli2026/dsh-electron-shell`
   - secret `GITCODE_TOKEN`(GitCode 个人访问令牌,2026-08-15 配置)
   → 今后 `release.yml` 的 `mirror-gitcode` 会在每次发版自动镜像全部资产。
5. **回补工作流**:`.github/workflows/gitcode-backfill.yml`(手动触发,传入 tag,
   只上传 GitCode 缺失的文件,可重入)。
6. **上传脚本修复**:`scripts/gitcode-upload.mjs` 的 PUT 改用 curl
   (Node fetch/undici 默认 300s headers 超时,传 ~200MB 必超时)。

## 三、进行中:存量资产回补

- 目标 tag:`v0.1.0-rc.6.shell.3`(当前唯一已发布版本)
- GitCode 上原仅有 `*-arm64-mac.dmg`(早前手动测试上传);其余 zip / exe /
  AppImage / deb / blockmap / latest*.yml 待回补。
- 运行记录:<https://github.com/citrusli2026/dsh-electron-shell/actions/runs/31867674512>
  (第三次触发;前两次失败原因已修复:setup-node 缓存找 pnpm、undici 上传超时)

### 验证与收尾步骤(回补完成后)

```sh
# 1. 确认工作流成功
gh run view 31867674512 --repo citrusli2026/dsh-electron-shell

# 2. 重新生成站点数据(逐资产实测 GitCode)
node scripts/gen-site-data.mjs   # 期望:所有 installer 行 gitcode_ok=true

# 3. 有变化则提交推送(Vercel 会自动部署)
git add site/data/release.json && git commit -m "site: all installers mirrored to GitCode" && git push

# 4. 线上抽查:中文模式下 zip/exe/AppImage/deb 应显示 GITCODE·国内镜像 徽标
open https://dsh-desktop.com/#download
```

若回补再次失败:`gh run view <id> --log-failed` 看日志;注意 GitCode
令牌过期/权限(repo scope)与单文件 2GB 上限。

## 四、运维速查

| 操作 | 命令 / 入口 |
|---|---|
| 重新部署 | push 到 main 即可;或 `vercel --prod`(仓库根,CLI 已登录 citrusli-5868) |
| 手动同步站点数据 | Actions → Site Data Refresh → Run workflow |
| 回补其他历史 tag | Actions → GitCode Mirror Backfill → 输入 tag |
| 下次发版 | `node scripts/version.mjs bump shell` → 打 tag 推送,release.yml 全自动(构建+发布+R2/GitCode 镜像) |
| DNS(阿里云) | A `@` → `216.198.79.1` / `64.29.17.1`;CNAME `www` → Vercel 专属值;证书 Vercel 自动续期 |
| 官网技术栈 | 零构建静态站:`site/index.html` + `assets/{style.css,app.js}` + `data/release.json` |

## 五、已知事项

- `*.vercel.app` 域名国内被 DNS 污染,`dsh-desktop.com`(Vercel Anycast IP)国内可直连;若未来变慢可在阿里云接 ESA 或换 R2 自定义域。
- 网站展示的版本 = 最新**已发布** release(shell.3);代码仓已推进到 shell.6,属正常(发版后官网自动更新)。
- GitCode 的附件直链是 302 → file-cdn 签名地址;HEAD 请求返回 401 属其平台行为,探测请用 range GET。
