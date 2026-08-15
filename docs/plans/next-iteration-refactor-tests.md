# 迭代计划:主进程重构 + 测试补强

> 状态:已在 shell.9 完成,作为后续迭代的历史输入保留。
> 日期:2026-08-15
> 目标:提高主进程可维护性与测试覆盖率,**不改变任何外部行为** —— CI 的三个 xvfb 冒烟场景、发布流程、用户可见交互全部保持不变。

## 1. 背景与现状

### 1.1 项目现状(审查结论)

- `src/main/index.ts` 为 485 行巨石文件,混杂了窗口控制器、托盘、IPC(`harness:retry`)、macOS 更新提示、smoke-test 断言逻辑与生命周期编排。
- 测试覆盖偏窄:`test/` 下 5 个文件约 230 行,仅覆盖纯逻辑模块(`dsh-home`、`window-state`、`update-check`、`pages`、`restart-policy`);`supervisor.ts`、`menu.ts`、`paths.ts`、`index.ts` 无单元测试,只靠 CI 冒烟间接覆盖。
- `supervisor.ts` 硬编码 `nodeBin()/dshBin()` 与 `app.getPath('userData')`,无法脱离真实 harness 闭包做单元测试。
- 代码库整体很干净:无 TODO/FIXME,有 13 篇 ADR;因此本迭代以「拆分 + 可测性注入 + 补测试」为主,不动产品功能。

### 1.2 规模参考

| 文件 | 行数 | 现有单测 |
| --- | --- | --- |
| `src/main/index.ts` | 485 | ❌(仅 CI 冒烟) |
| `src/main/supervisor.ts` | 200 | ❌ |
| `src/main/menu.ts` | 150 | ❌ |
| `src/main/pages.ts` | 90 | ✅ |
| `src/main/update-check.ts` | 76 | ✅ |
| `src/main/window-state.ts` | 78 | ✅ |
| `src/main/restart-policy.ts` | 52 | ✅ |
| `src/main/dsh-home.ts` / `paths.ts` | 25 / 36 | ❌ / ❌ |

## 2. 拆分 index.ts

按职责抽成 4 个模块,`index.ts` 只保留装配与生命周期编排(目标约 150 行)。

### 2.1 `src/main/window.ts`

迁移内容:

- `createWindow()`
- 窗口状态读写:`loadWindowState` / `saveWindowState` / `scheduleWindowStateSave` / `windowStatePath`
- 导航守卫:`will-navigate` 的 allowedOrigin 白名单、`setWindowOpenHandler` 外链转 `shell.openExternal`
- hide-on-close(托盘驻留)逻辑,与 `quitInProgress` 的协作通过回调/共享状态注入

设计要点:

- 对外暴露工厂(如 `createMainWindow()`)与 `showWindow()`;`allowedOrigin`、`quitInProgress`、`mainWindow` 引用通过一个小的共享 context 对象在模块间传递,避免全局可变散落。
- 不改窗口参数(`contextIsolation: true`、`sandbox: true`、preload 路径等)。

### 2.2 `src/main/tray.ts`

迁移内容:`createTray` / `refreshTray` / `buildTrayMenu` / `statusLabel`(依赖 `lastState`,以 getter 回调注入)。

### 2.3 `src/main/update-prompt.ts`

迁移内容:`checkMacUpdate` / `checkForUpdatesInteractively`,以及 Windows/Linux `autoUpdater` 的初始化块(含 `autoDownload`、事件监听),与 `index.ts` 解耦。

### 2.4 `src/main/smoke.ts`

迁移内容:

- `SMOKE_TEST`、`SMOKE_TIMEOUT_MS` 常量、`smokeVerify()`、`quitGracefully()` 辅助
- boot 失败后的全部 smoke 断言分支:error-page 按钮存在性检查、retry-fail 按钮恢复轮询、full-retry `allowedOrigin` 轮询

这是 `index.ts` 里最难读的约 70 行;抽出后主 `whenReady` 流程一页可读。

### 2.5 行为兼容红线

以下外部契约**一律不改**,保证 `.github/workflows/ci.yml` 三个冒烟场景零改动通过:

- IPC 通道名 `harness:retry` 及其 sender/data: URL 校验
- 环境变量钩子:`DSH_DESKTOP_DEV_WEB_URL`、`DSH_DESKTOP_TEST_FAIL_HARNESS`、`DSH_DESKTOP_TEST_RETRY_FAIL`
- CLI 参数 `--smoke-test` 的退出码约定(成功 0 / 失败或超时 1)
- `before-quit` 先 `supervisor.stop()` 再退出的顺序;`window-all-closed` / `activate` / 单实例锁行为

## 3. HarnessSupervisor 注入化

现状:构造函数内直接 `app.getPath('userData')` 建日志目录,`spawnOnce` 硬编码 `nodeBin()` + `dshBin()` 参数,`READY_TIMEOUT_MS` 常量不可调,单元测试无法驱动。

改造为构造注入(默认值保持现行为完全一致):

```ts
new HarnessSupervisor(events, {
  command,        // 默认 nodeBin()
  args,           // 默认 [dshBin(), '--profile', 'web', '--port', '0']
  logDir,         // 默认 app.getPath('userData')/logs
  env,            // 默认 { ...process.env, DSH_HOME: resolveDshHome(...) }
  readyTimeoutMs, // 默认 90_000;测试中缩短到秒级
})
```

注意:`app.getPath('userData')` 仍需 Electron 运行时,默认值惰性求值即可;测试路径全部显式注入,不触碰 Electron。

## 4. 新增测试

沿用 `test/` 现有 node:test 风格,新增三个文件:

### 4.1 `test/supervisor.test.ts`(核心)

用 `process.execPath` + 临时 fixture 脚本代替真实 dsh,覆盖:

1. stdout 打印 ready URL 行(复用 `parseReadyUrl` 认可的格式)→ `start()` 解析出 URL,`onState` 收到 `ready`
2. pre-ready 退出 → `start()` reject,错误信息含退出码
3. ready 后意外退出 → 按 restart-policy 自动重启,再次收到 `ready`
4. 连续崩溃超过上限 → `gave-up`,`onState` 收到 `crashed`(带 attempts 与 logTail)
5. `stop()` → SIGTERM 后 resolve,日志流正常关闭;对无子进程时调用安全
6. 日志 ring buffer 上限(40 行)行为

### 4.2 `test/paths.test.ts`

平台相关的二进制路径拼接(轻量)。

### 4.3 `test/menu.test.ts`

`menu.ts` 中可脱离 Electron 测试的纯函数部分;依赖 `Menu` API 的部分不强测。

## 5. 验证步骤

1. `pnpm run typecheck && pnpm run test && pnpm run build`
2. 本地跑一次普通模式 `--smoke-test`,确认重构后行为不变
3. CI 全绿后在独立分支提 PR,不发版、不改 tag

## 6. 风险与回滚

- **风险 1:拆分引入时序回归**(如 tray 创建时机、before-quit 与 hide-on-close 的交互)。缓解:兼容红线清单逐项核对 + 冒烟三场景验证。
- **风险 2:supervisor 注入化改动默认行为**。缓解:默认参数与现实现逐行等价,fixture 测试覆盖主要路径。
- **回滚**:全部改动在一个分支/PR 内,未合并前可直接丢弃;合并后如出问题,revert 单个 PR 即可。

## 7. 后续可选方向(不在本迭代)

- 平台覆盖:Intel macOS 构建;macOS 签名/公证后启用自动更新(ADR 0004/0010 遗留)
- 工程卫生:清理仓库内 `release-check/` 构建产物、加固 GitCode curl 上传、引入 CHANGELOG
- 新功能:内置日志查看器、dsh CLI 集成、设置面板等
