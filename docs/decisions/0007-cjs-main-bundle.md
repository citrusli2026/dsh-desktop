# 0007:主进程以 CJS 单文件形式打包(esbuild bundle,electron-updater 内联)

- 日期:2026-02-09
- 状态:已接受

## 背景

主进程最初以 ESM 输出。接入 electron-updater 时踩到两层问题:

1. 若把 electron-updater 交给 electron-builder 作为生产依赖收集,
   electron-builder 26 在本仓库的 pnpm hoisted 布局下收集不到任何模块
   (日志:`no node modules returned`);
2. 若用 esbuild 把 electron-updater 打进 ESM bundle,其依赖链
   fs-extra → graceful-fs 使用**动态 `require('fs')`**,ESM 输出无法表达,
   主进程启动即崩(`Dynamic require of "fs" is not supported`);
   而把 electron-updater 留在 bundle 外(external)时,Node 的
   cjs-module-lexer 又解析不出它的具名导出,`import { autoUpdater }`
   运行时抛 `Named export not found`。

## 决策

主进程改为 **CJS 单文件 bundle**:

- `scripts/build.mjs` 用 esbuild 以 `format: 'cjs'` 把 `src/main` 连同
  electron-updater 及其全部依赖打进 `lib/main/index.cjs`,仅 `electron`
  保持 external(由 Electron 运行时提供);
- `package.json` 的 `main` 指向 `lib/main/index.cjs`(`.cjs` 后缀在
  `"type": "module"` 仓库里强制 CommonJS,互不干扰);
- 应用不再有任何生产依赖,electron-builder 收集不到模块反而正确——
  asar 里只有 bundle + package.json,依赖面最小;
- 构建前清空 `lib/`,避免新旧产物混杂。

## 后果

- 正面:一个文件承载整个主进程;动态 require 原生可用;
  绕开 electron-builder 的 pnpm 收集差异与 CJS 具名导出检测差异,
  三个平台行为一致;升级 electron-updater 只改 devDependency 后重打包;
- 负面:主进程失去 ESM(本仓库主进程没有 top-level await 需求);
  bundle 内依赖的许可/版本随构建锁定,升级需显式 bump。

## 备选方案

- rollup + @rollup/plugin-commonjs 出 ESM:多一套工具链解决同一个
  CJS-interop 问题,收益不抵成本,否决;
- 接受 electron-builder 收集生产依赖(ESM + external):本仓库布局下
  收集为空,还得迁就 node-linker 与 .modules.yaml,否决。
