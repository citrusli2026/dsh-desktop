# 0005:用 pnpm deploy 物化 harness 依赖闭包

- 日期:2026-02-09
- 状态:已接受

## 背景

壳需要把 `@deepseek-ai/dsh` 及其完整依赖树(约 60 个 `@deepseek-ai/*` 包 +
第三方原生依赖 node-pty / koffi / sharp 等)随应用分发。Electron 自身的
`node_modules` 与 harness 的依赖必须隔离:harness 由内置独立 Node 作为子进程
启动,原生模块按普通 Node ABI 安装,绝不能被 electron-builder 当成本应用的
原生依赖处理。

## 决策

沿用上游 deepseek-harness 单文件可执行构建已经验证过的闭包技术:

- `manifest/harness/package.json` 是**纯依赖 manifest**(零代码),精确 pin
  `@deepseek-ai/dsh` 版本,显式声明闭包内所有非可选 peer 依赖(约 20 个),
  另带 `pnpm`(供壳内 `dsh plugin` 安装插件用);
- `scripts/deploy-harness.mjs` 执行:
  1. `pnpm --dir manifest/harness install --frozen-lockfile`(锁文件入库,构建可复现);
  2. `pnpm deploy --filter . --prod --legacy --config.node-linker=hoisted
     --config.auto-install-peers=false --config.link-workspace-packages=true
     resources/harness`,物化出**无符号链接**的扁平 node_modules;
  3. 跳过 `.bin` shim 目录,逐目录断言闭包内不再有符号链接,
     校验 dsh bin 与 pnpm.cjs 存在;
  4. 运行 `scripts/audit-harness-peers.mjs`:遍历闭包全部 package.json,
     任何未被满足的非可选 peer 一律硬失败(防止运行时
     `ERR_MODULE_NOT_FOUND`);
- `manifest/harness/pnpm-workspace.yaml` 复刻上游 `allowBuilds` 白名单
  (pnpm 10+ 的 strictDepBuilds:未列出的安装脚本一律硬失败),
  放行 node-pty / koffi / sharp / esbuild / dsh-subprocess-local 的脚本,
  拒绝 @google/genai / protobufjs / node-addon-require-builtin 的无用脚本;
- 部署产物整体落在 `resources/harness/`,由 electron-builder 的
  `extraResources` 带出 asar,子进程从普通文件路径 spawn。
  `pnpm run bootstrap` 的固定顺序是 deploy → fetch-node(部署会清空目标目录)。

## 后果

- 正面:闭包与上游 npm 发行版逐字节对应;升级 = 改 manifest 一行 + 更新锁文件;
  无符号链接保证安装器复制、移动后仍可启动;
- 负面:每个平台构建要完整装一遍闭包(约数分钟);原生模块在每个平台 CI 上
  现场编译(node-pty 等),这是上游同样要求的安装行为。

## 备选方案

- 让壳仓库直接依赖 `@deepseek-ai/dsh` 并让 electron-builder 打包整棵依赖树:
  两种依赖体系混在一起,electron-builder 会尝试重建原生模块、体积失控,否决;
- 用 esbuild 把 harness 打成单文件:上游插件系统靠 node_modules 逐包解析
  (profile bundles、动态 import),单文件化会破坏上游解析契约,否决。
