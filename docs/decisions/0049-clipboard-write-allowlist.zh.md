# 0049:放行 Harness 复制按钮所需的剪贴板写入权限

- 日期:2026-10-28
- 状态:已接受;由 [0050](0050-microphone-media-allowlist.zh.md) 扩展(麦克风音频)
- 修订:[0014](0014-deny-renderer-permissions-by-default.zh.md)
- English:[0049](0049-clipboard-write-allowlist.md)

ADR 0014 默认拒绝渲染层的全部 Web 权限,并要求确有需要的功能做成范围明确、有文档、
有测试的白名单,而不是放宽默认规则。聊天界面正属于这种情况:内置 Harness 界面里的
每一个复制入口——消息行的复制按钮、代码框右上角的复制按钮、路径与 JSON 复制——都调用
`navigator.clipboard.writeText`。Chromium 在调用前检查 `clipboard-sanitized-write`
权限,而 Electron 把这个检查交给 0014 安装的会话处理器(`() => false`)。于是写入以
`NotAllowedError` 拒绝;客户端只在异步 API **不存在**时才回退 `execCommand('copy')`,
所以点击完全没有任何效果:没写剪贴板、图标不变、也没有报错。用户报告的正是这个现象:
聊天页代码框右上角的「复制」点了没有反应。

决策:保留默认拒绝的边界,只在 `src/main/permissions.ts` 的白名单里增加一项
`clipboard-sanitized-write`,权限检查与权限请求两个处理器都放行。`clipboard-read`
继续拒绝:现有界面不读取用户剪贴板,粘贴事件也不需要该权限。

- 发布前已做端到端核对:用壳层同样的两个处理器驱动一个 Electron 窗口,全部拒绝时
  `writeText` 报 `NotAllowedError: Write permission denied`;只放行
  `clipboard-sanitized-write` 时正常完成。
- 单元测试同时覆盖两个方向:被放行的权限在检查与请求两条路径上都通过;
  `clipboard-read`、`media`、`geolocation`、`notifications`、`display-capture` 与
  `openExternal` 继续被拒绝。
- 未来 Harness 若需要别的权限,仍必须单独写决策记录、补测试,并改这份白名单。

后果:桌面壳里聊天界面的复制全部恢复可用,边界依然显式——新权限无法绕过白名单悄悄
生效。负面:该权限是会话级的,任何被加载进唯一沙箱主窗口的页面(受导航白名单保护的
回环 Harness 来源)都可以写剪贴板。可以接受,因为写入是剪贴板能力中权限最低的一种,
不会暴露已有剪贴板内容,而渲染层是可信的一方 UI。

已否决的备选方案:对回环来源放行全部请求(0014 已否决,信任来源不等于需要全部能力);
给内置 Harness 客户端打补丁回退 `execCommand('copy')`(会掩盖未来的权限回归,无法复制
非文本内容,也违背「不改上游代码」原则);增加 preload IPC 剪贴板桥(Harness 界面是
直接调用 `navigator.clipboard` 的上游代码,这个桥根本不会被用到)。
