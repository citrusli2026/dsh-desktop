# 0024:精选首启预装与插件市场入口

- 日期:2026-08-29
- 状态:已接受
- English:[0024](0024-curated-first-run-bundles.md)

## 背景

上游没有插件市场;事实标准是社区插件 dsh-market(2.7k★,MIT,经
`dsh plugin --profile web add dshmarket` 安装)。桌面用户此前没有任何
现实路径:没有 CLI,也没有精选起步集。高星桌面壳的解法是预装精选
Bundle——做得最完整的是 Bundle Edition 客户端(vibeinging):新档案从
随包固定产物离线初始化,且绝不把用户卸载的 Bundle 悄悄装回。

## 决策

- **首启播种**:全新 web 档案开箱带三个精选社区 Bundle——
  `dshmarket` 1.36.0(MIT)、`dsh-better-sidebar` 0.17.1(MIT)、
  `@linxin666/dsh-client-ui-task-board` 0.3.6(Apache-2.0)。壳在第一
  次 harness 启动前写好档案 manifest(官方 Bundle 在前、种子在后),
  并把每个种子从随包闭包**软链**(而非复制)到
  `profiles/node_modules`——软链让 Bundle 的运行时依赖(undici、
  react 等)沿提升闭包解析,与官方 Bundle 的
  `healProfilesModuleFallback` 同机制;复制会让依赖解析断链。
- **档案归用户所有**:种子只在 manifest 不存在时生效;已有档案绝不
  重写;用户卸载的 Bundle 绝不装回。种子是普通用户 Bundle——在
  「设置 → 插件」可见,可由市场更新/卸载,安全模式会隔离。
- **存量用户**:扩展设置区提供「安装插件市场」一行——用内置 dsh
  CLI 执行(`plugin --profile web add dshmarket`,2 分钟超时)并重启
  harness。该行通过只读的 bundled-plugins 桥调用显示状态。
- **精选门槛**:npm 发布且来源可溯、许可证宽松、peer 依赖能被固定
  内核满足(`scripts/audit-harness-peers.mjs` 强制)、在高星组合中
  验证过。落选记录:`dsh-theme`(npm 包指向无关的 bot 仓库)、
  `dsh-balance`(包缺 license 字段)、worktree 类(仅 GitHub tarball,
  不在 npm)。

## 后果

- 正面:全新桌面安装开箱即有可用市场和两个质量 Bundle,零 CLI;
  其余插件由市场覆盖;安全模式与市场卸载仍是恢复路径。
- 负面:随包闭包增大约 16 MB(未压缩);内核升级可能弄坏某个种子
  Bundle,直到我们重新固定版本(每发布固定内核的策略限定了风险);
  首启多一个窗口前步骤(离线,亚秒级)。

## 备选方案

- 种子走壳自有挂载(dsh-desktop-controls 的 `--patch` 通道):插件
  管理器和市场都看不见,第三方代码的所有权也不对——否决;
- 首启用 `dsh plugin add` 自动安装:要求用户在最糟时机(首次启动)
  具备网络和 npm 源——否决;
- 不预装、只推荐市场:桌面用户依然没有产品内路径——否决(存量用户
  由扩展设置入口覆盖)。
