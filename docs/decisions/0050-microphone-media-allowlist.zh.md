# 0050:仅麦克风的媒体权限(语音输入),以及边界其余部分的复审

- 日期:2026-10-29
- 状态:已接受
- 修订:[0049](0049-clipboard-write-allowlist.zh.md)
- English:[0050](0050-microphone-media-allowlist.md)

ADR 0049 修好 Harness 界面真正需要的一项权限(剪贴板写入)之后,才发现「默认拒绝」的边界已经
悄悄废掉了一个已发布的功能。本篇是用户要求的那次跟进复审:把内置 Harness 界面实际调用的、
需要权限的 Web API 逐个走一遍,逐项显式决策,而不是继续让用户去撞默认拒绝。

方法:在内置闭包(`resources/harness/node_modules/@deepseek-ai`,内核 0.2.2-alpha.2)里检索
`getUserMedia`、`getDisplayMedia`、`Notification`、`requestFullscreen`、`requestPointerLock`、
`wakeLock`、`navigator.share`、`geolocation`、`requestMIDIAccess`、`navigator.usb/serial`、
`showOpenFilePicker`/`showSaveFilePicker`、`navigator.storage.persist`、`navigator.clipboard.*`、
`SpeechRecognition` 与 `window.print`,并逐个读调用点。

复审结果:

- **`media`(麦克风)**:`dsh-experimental-client-ui-voice-input` 用
  `getUserMedia({ audio: { … }, video: false })` 录制聊天提示词,而该 bundle 随默认 Web profile
  发布(`dsh-official-bundles`)。默认拒绝让每次录音都变成 `RecordingError("permission")`,
  已发布的麦克风按钮永远用不了。**只放行音频。**
- **`clipboard-read`**:只有两个调用点——xterm 的 `BrowserFeatures.clipboard.readText` 能力探测
  (只做判断、不读剪贴板),以及电子表格预览右键菜单里的显式「粘贴」,它捕获拒绝后回退到自己
  的 `sessionStorage` 剪贴板。**继续拒绝。**
- **没有任何已发布界面**调用 `getDisplayMedia`、`Notification` 构造器、`requestFullscreen`、
  `requestPointerLock`、`wakeLock`、`navigator.share`、定位、MIDI、USB/串口、文件系统选择器、
  `navigator.storage.persist`、`SpeechRecognition` 或 `window.print`。**继续拒绝。**
- `clipboard-sanitized-write` 已由 ADR 0049 放行,不变。

决策:白名单仍然是一份很短的正面清单。`media` 只有在**全部**请求类型都是 `audio` 时放行
(请求 `audio+video`、`video`、空列表,或媒体检查类型为 `unknown` 一律拒绝),因此渲染层永远
无法打开摄像头。由于 macOS 会直接终止未声明用途字符串就要麦克风的进程,
`electron-builder.yml` 为 `Info.plist` 增加 `NSMicrophoneUsageDescription`。复审中其余项
继续默认拒绝;未来功能若确需权限,必须连同自己的决策记录和测试一起扩展这份清单。

证据(用壳层真实处理器装入 Electron 会话实测,不是 mock):

```
microphone   granted      camera            denied
clipboard-write granted   clipboard-read    denied
geolocation  denied       notifications     denied
persistent-storage denied
```

后果:桌面壳里的语音输入可用——录音仍受 macOS 的按应用授权约束,且任何平台上都只有用户点击
麦克风控件才会开始录音。负面:与 0049 的剪贴板写入一样,跑在 Harness 渲染层里的插件可以不经
额外的壳层提示就打开麦克风,操作系统授权(macOS/Windows)是外层闸门。已否决的备选方案:整体
放行 `media`(连摄像头一起打开);在同步权限处理器里弹应用内授权对话框(第三方插件将来真需要
麦克风时再考虑,现在只会拖慢用户刚刚发起的录音);继续拒绝麦克风(把一个已发布、可见的控件
永久废掉,正是这次复审要消除的失败)。
