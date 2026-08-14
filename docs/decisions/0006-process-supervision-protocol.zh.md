# 0006:harness 进程监督协议:就绪行解析、崩溃重启、优雅退出

- 日期:2026-02-09
- 状态:已接受

## 背景

桌面壳的主进程必须可靠地管理 harness 子进程的完整生命周期:
启动、知道何时可以加载 UI、崩溃后的处置、以及应用退出时让 harness
有机会落盘(会话 JSONL、设置等)。

## 决策

以**上游就绪行**为核心协议(`dsh --profile web --port 0` 在 Loader 落定后
向 stdout 输出一行 `dsh web: http://127.0.0.1:<port>`;上游代码注释明确该行
就是给 supervisor 的就绪信号):

1. **启动**:spawn `<node> <dsh-bin.js> --profile web --port 0`,stdout/stderr
   逐行收集(写 `userData/logs/harness.log`,内存保留最近 40 行);
2. **就绪**:匹配到就绪行 → 窗口从占位页切换到该回环 URL;
   90 秒未就绪或就绪前退出 → 显示错误页,启动失败;
3. **崩溃重启**:就绪之后的意外退出 → 指数退避(2s 起、封顶 30s)自动重启,
   预算为 10 分钟窗口内最多 5 次;超预算 → 停摆,显示错误页 + 日志尾部;
   就绪前退出不自动重试(避免坏安装原地打转,启动失败即报错);
4. **优雅退出**:应用退出时 SIGTERM → 等 5 秒 → SIGKILL;窗口只允许导航到
   harness 回环 origin,其余跳转一律交给系统浏览器;
5. **单实例**:`requestSingleInstanceLock`,二次启动聚焦既有窗口。

## 后果

- 正面:协议完全依赖上游稳定契约(就绪行、回环绑定、SIGTERM 语义),
  壳内零私有协议;崩溃恢复对用户可见(占位页 → 正常页,错误页含日志);
- 负面:就绪前退出不重试意味着"首次启动碰上瞬态故障"需要用户重开应用;
  0.1.1-pre.0 起错误页提供"重试启动"按钮(preload/IPC 桥),补掉了该缺口;
- 已知限制(Windows):Node 的 `child.kill('SIGTERM')` 在 Windows 上是
  TerminateProcess 硬杀,harness 收不到信号、无法走优雅落盘路径。
  上游 JSONL 持久化是逐事件写穿,最坏丢最后一个事件。退出时用
  `taskkill /T /F` 清扫整棵进程树,保证 harness 派生的 shell 会话与
  subagent 不残留;真正的 Ctrl+C 级优雅退出需要 `GenerateConsoleCtrlEvent`,
  留给后续里程碑。

## 备选方案

- 轮询端口探测(connect 探测代替就绪行):探测成功不等于上游服务就绪,
  且需自选端口、竞态多,否决;
- 崩溃后无限重启:掩盖持续故障、耗尽资源,否决;
- 在错误页内置重试按钮(M1 需要 preload/IPC 桥):推迟到 M3,当前靠自动重启
  与重新打开应用覆盖。
