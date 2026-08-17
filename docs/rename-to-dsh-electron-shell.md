# 仓库改名与文案改造计划:dsh-desktop → dsh-electron-shell

> 状态:已执行(2026-02-09,第 2 轮)。GitHub 仓库已从 `citrusli2026/dsh-desktop`
> 改名为 `citrusli2026/dsh-electron-shell`(旧 URL 自动 301),全部文案按第 4 节
> 完成改造,新名字下发布了 v0.1.1-pre.0。执行备注见第 7 节。
>
> **注意**:最终决策与本计划有偏差——appId 已变更为 `io.github.citrusli2026.dsh-electron-shell`，
> productName 已恢复为 `dsh-desktop`（应用与安装包名）。详见 ADR 0013。

## 1. 背景与目标

- 现仓库名 `dsh-desktop` 与描述缺少"非官方"信号,容易被误认为 DeepSeek Harness 的官方桌面版。
- 目标:仓库名、产品名、全部用户可见文案统一为 **`dsh-electron-shell`**(Electron 壳),并在描述与 README 中明确"非官方社区打包"。
- 只改命名与文案,不触碰任何 agent 功能;本仓库的职责始终是:把 `@deepseek-ai/dsh` 装进 Electron 壳(窗口、进程监督、自动更新)。

## 2. 命名决策

| 项 | 现值 | 改后 | 说明 |
|---|---|---|---|
| 仓库名 | `dsh-desktop` | **`dsh-electron-shell`** | 已定;GitHub 改名后旧 URL 自动 301,已装用户的更新链不断 |
| package.json `name` | `dsh-desktop` | `dsh-electron-shell` | 驱动安装包文件名(artifactName 的 `${name}`) |
| productName | `DSH Desktop` | `DSH Electron Shell` | 应用显示名(窗口标题、安装器、菜单栏) |
| GitHub 描述 | 见第 3 节 | 见第 3 节 | "packaging" → "shell",保留 "Unofficial" |
| appId | `io.github.citrusli2026.dsh-desktop` | **不变** | 安装/更新身份,改了会让旧安装与更新失联;非文案,不动 |

## 3. GitHub 仓库描述(≤100 字符)

> Unofficial Electron shell for DeepSeek Harness: bundled Node runtime, installers, auto-update.

92 字符。三个信号:非官方(Unofficial)、壳(shell)、做的事(打包 Node 运行时 + 安装包 + 自动更新)。

## 4. 修改清单

### 4.1 electron-builder.yml

- `productName: DSH Desktop` → `DSH Electron Shell`
- `copyright`: `dsh-desktop contributors` → `dsh-electron-shell contributors`
- `publish.repo: dsh-desktop` → `dsh-electron-shell`(electron-updater 的 GitHub Releases 更新源)
- `appId` 保持不变(见第 2 节)

### 4.2 package.json

- `name` → `dsh-electron-shell`
- `author`: `dsh-desktop contributors` → `dsh-electron-shell contributors`
- `description` 开头加 `Unofficial`,保持 "Electron desktop shell" 口径

### 4.3 src/main/index.ts

- 窗口标题 `'DSH Desktop'` → `'DSH Electron Shell'`
- 日志前缀 `dsh-desktop:` → `dsh-electron-shell:`(共 6 处)

### 4.4 src/main/pages.ts

- 占位页 / 启动失败页的 `<title>DSH Desktop …` → `<title>DSH Electron Shell …`(2 处)

### 4.5 .github/workflows/release.yml

- 构建产物上传名 `dsh-desktop-${{ matrix.os }}` → `dsh-electron-shell-${{ matrix.os }}`
- GitHub release 标题 `"dsh-desktop $TAG"` → `"dsh-electron-shell $TAG"`
- R2 镜像路径 `dsh-desktop/<tag>/` → `dsh-electron-shell/<tag>/`;R2 桶中旧前缀对象保留不动,仅新发布走新路径

### 4.6 README.md

- 标题与项目名
- Releases 下载链接:`github.com/citrusli2026/dsh-desktop/releases` → `.../dsh-electron-shell/releases`
- 安装包文件名示例:随 `${name}` 变化,与产物严格一致(此前修过文档与产物名不匹配的坑)
- 开头新增免责声明(中英):

> 非官方社区打包,与 DeepSeek AI 无关联;DeepSeek Harness 为 DeepSeek 的商标,本仓库仅做 MIT 许可下的再打包。
> Unofficial community packaging, not affiliated with DeepSeek AI. DeepSeek Harness is a trademark of DeepSeek; this repo only repackages it under MIT.

### 4.7 LICENSE 与 docs

- LICENSE: `dsh-desktop contributors` → `dsh-electron-shell contributors`
- `docs/decisions/README.md` 引言中的项目名同步更新
- 决策记录正文(0001–0005 及 .zh 版)保持历史原样,不改写历史

### 4.8 GitHub 侧(仓库外)

- 仓库 Description 字段 → 第 3 节文案
- `gh repo rename dsh-electron-shell` 后,本地 `git remote set-url origin` 同步新地址

## 5. 执行顺序(审查通过后)

1. 本地按第 4 节改完全部文案;`pnpm run typecheck` + `pnpm run build` + `pnpm run smoke` 通过后,单个 commit 提交并 push。
2. `gh repo rename dsh-electron-shell`(GitHub 自动 301 旧地址)。
3. 更新本地 origin remote;验证旧地址 301 到新地址。
4. 更新 GitHub 仓库 Description 字段。
5. 打新 tag(如 `v0.1.0-pre.1`)触发 release:核对 `latest*.yml` 指向新仓库、README 下载名与产物一一对应。
6. 收尾扫描:全仓库 `grep -rn "dsh-desktop"`,残留仅允许出现在 `manifest/harness/node_modules`(pnpm 生成的绝对路径)与历史决策记录正文。

## 6. 风险与不变项

- 已发布的 release 与已安装用户:GitHub 仓库改名后旧 URL 301,更新源不断;R2 旧前缀镜像保留。
- `appId` 不变,升级链不断。
- 功能代码零改动:壳仍只管窗口、进程监督与自动更新,不改变任何 agent 行为。
- 安装包文件名随 `${name}` 变化,README 与发布产物必须同步核对(第 5.5 步)。

## 7. 审批记录

- [x] 方案审查通过,开始执行(第 5 节)
- [x] 执行完成,第 5.6 步残留扫描通过
- [x] appId 最终决策:变更(见下方备注 4;2026-08-14 用户确认,pre-1.0 无需兼容旧身份)

> 执行备注(2026-02-09 第 2 轮):
> 1. 第 1 轮曾尝试改名,因目标名仓库已存在且用户一度决定放弃,改名内容被回滚;
> 2. 用户随后确认仓库名需要改:先将占位仓库处理出目标名,再执行
>    `gh repo rename`,旧地址 `github.com/citrusli2026/dsh-desktop` 已验证
>    301 到新仓库;
> 3. 新名字下以 v0.1.1-pre.0 重新发布,资产名与 `latest*.yml` 均指向
>    `dsh-electron-shell`;
> 4. **appId 最终随名变更为 `io.github.citrusli2026.dsh-electron-shell`**,
>    偏离第 2 节"不变"计划:项目处于 pre-1.0、无需要保全的装机基数,
>    用户(2026-08-14)明确不考虑与 v0.1.0-pre.0 的安装身份兼容。
>    上文第 2、4.1、6 节中"appId 不变"的表述以此条为准。
