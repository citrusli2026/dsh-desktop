# 0026:内核 overlay——第二条更新链

- 日期:2026-08-29
- 状态:已接受
- English:[0026](0026-kernel-overlay-second-update-chain.md)

## 背景

应用每个发布只带一个固定内核;用户拿不到更新的 `@deepseek-ai/dsh`,
除非升级应用——而上游 rc 版本破坏性变更频繁。三家高星壳都把内核管理
产品化了(qufei1993 的版本管理器、EAC 的双更新链+原子切换+回滚、
dsh-tauri-desk 的多内核+健康检查)。我们"每发布固定内核+恢复中心"已
是半个答案。

## 决策

- **overlay 目录**:`<userData>/kernels/<version>/` 存放独立安装的
  官方内核(用内置 pnpm 执行 `pnpm add @deepseek-ai/dsh@<version>`,
  hoisted 布局,批准构建脚本)。`active.json` 选择生效版本;supervisor
  每次拉起都重新评估 bin(`dshBinOverride`),切换或回滚在下次重启生效。
- **内置内核是底线**:缺失、损坏或已失败的 overlay 一律回退到随包
  闭包。overlay 在一次受监督启动内(90 秒)未达 ready,即写入
  `<version>.failed.json` 标记、清除指针、自动以内置内核重启(手动
  切换的失败会呈现给用户;恢复中心全程可用)。
- **布局同构**:overlay 用 `--config.node-linker=hoisted` 安装——与
  随包闭包(deploy-harness)相同的扁平布局,插件在两种内核下依赖解析
  行为一致。pnpm 严格布局下种子插件无法解析 `schemastery`(隔离环境
  真机运行已验证),健康检查正确地把那次切换回滚了。
- **所有权**:内核位于壳的 userData,绝不进入用户档案;「恢复内置」
  清除指针并重启,但保留已装 overlay 供重试。失败标记保留,直到该
  版本重新安装时清除。

## 后果

- 正面:内核更新与应用发布解耦;坏内核不可能把用户困死(内置底线+
  自动回滚);安装可离线安全重试。
- 负面:磁盘多一份完整闭包(pnpm store 硬链接后实际占用小得多);
  新内核下的插件兼容性靠健康检查兜底而非事前保证;Windows junction
  走同一代码路径,但在有 Windows 测试环境前未经实测。

## 备选方案

- 直接替换随包闭包里的内核:篡改应用自有文件、破坏签名与体积假设、
  没有回退底线——否决;
- 应用内多内核随包分发:安装包膨胀,而多数用户不会用到——否决;
- 用 `npm install` 替代内置 pnpm:npm 不在我们支持的闭包工具链内,
  且缺少 lockfile 纪律——否决。
