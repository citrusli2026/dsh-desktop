# 0027:opt-in 屏幕捕获工具——走原生管线的视觉能力

- 日期:2026-08-29
- 状态:已接受
- English:[0027](0027-optin-screen-capture-tool.md)

## 背景

桌面 Agent 的视觉能力分两半。模型侧属于上游:具备视觉的模型路由
(例如 deepseek-v4-flash-vision-exp)通过 harness 原生附件服务读取
图片,与内置 `read_image` 工具完全同构。壳侧是我们的,而且 Web UI
无法复制:**截屏**。社区共识(FuqiangCraft 的契约)是 opt-in 截屏、
截图总是回填进会话——绝不静默注入。我们官网的隐私 FAQ 此前承诺
"不读取截图、不做视觉识别",所以功能必须与诚实的隐私口径一起上线。

## 决策

- **只走路线 C——不自建视觉路由。**壳绝不把图发给第二个模型。壳自有的
  controls 插件注册一个 `screen_capture` 工具,其结果经原生附件服务
  (`attachments.saveImage`)提交,会话里具备视觉的模型直接看到 PNG;
  路由门禁与 `read_image` 相同(调用路由必须声明图片输入)。
- **opt-in,默认关。**仅当拉起环境带 `DSH_DESKTOP_SCREEN_CAPTURE=1`
  时才注册工具;该值来自新偏好 `screenCapture`(默认 false)。在扩展
  设置切换开关会重启内核——与安全模式同一语义。
- **截屏机制**:各平台 CLI——macOS `screencapture -x`、Windows
  PowerShell CopyFromScreen、Linux 依次尝试
  scrot/gnome-screenshot/spectacle/import。PNG 写入临时文件、提交后
  删除;尺寸来自附件服务归一化后的 ref。
- **隐私口径随功能一起上线**:官网 FAQ 现在写明:通知从不读屏;
  屏幕捕获存在、默认关闭、截图只进入用户所在的会话。

## 后果

- 正面:桌面壳拿到它不可替代的那一项视觉能力,却不拥有任何模型路由;
  Web UI 保留原生粘贴图片路径;工具契约与 `read_image` 一致,任何
  具备视觉的路由都无需改动即可工作;
- 负面:macOS 首次截屏需要用户授予屏幕录制权限;Linux 依赖系统里
  恰好存在的截屏 CLI;切换开关会重启内核、中断运行中的会话。

## 备选方案

- 视觉路由类插件(图转文字桥):明确否决——模型侧属于 harness 及其
  模型路由;
- 仅剪贴板截屏(不做模型工具):用户本来就能做到;工具闭环才是真正的
  能力——作为体验糖推迟;
- 无条件注册工具、调用时再查偏好:host 半端运行时拿不到壳偏好,
  除非新增传输通道;拉起时的 env 标志保持信任边界单向——否决。
