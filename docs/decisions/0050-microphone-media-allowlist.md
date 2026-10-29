# 0050: Microphone-only media for voice input, and the audited rest of the boundary

- Date: 2026-10-29
- Status: Accepted
- Amends: [0049](0049-clipboard-write-allowlist.md)
- 中文：[0050](0050-microphone-media-allowlist.zh.md)

ADR 0049 fixed one permission the Harness UI needs (clipboard write) after it turned out the
deny-by-default boundary had silently disabled a shipped surface. This record is the follow-up
audit the user asked for: walk every permission-gated web API the bundled Harness UI actually
calls, and decide each one explicitly instead of leaving the blanket denial to be discovered by
users.

Method: grep the deployed closure (`resources/harness/node_modules/@deepseek-ai`, kernel
0.2.2-alpha.2) for `getUserMedia`, `getDisplayMedia`, `Notification`, `requestFullscreen`,
`requestPointerLock`, `wakeLock`, `navigator.share`, `geolocation`, `requestMIDIAccess`,
`navigator.usb/serial`, `showOpenFilePicker`/`showSaveFilePicker`, `navigator.storage.persist`,
`navigator.clipboard.*`, `SpeechRecognition` and `window.print`, then read every hit's call site.

Findings:

- **`media` (microphone)** — `dsh-experimental-client-ui-voice-input` records the chat prompt with
  `getUserMedia({ audio: { … }, video: false })`, and the bundle ships in the default web profile
  (`dsh-official-bundles`). The deny handler turned every recording into `RecordingError("permission")`,
  so the shipped mic button could never work. **Allow audio only.**
- **`clipboard-read`** — two call sites: xterm's `BrowserFeatures.clipboard.readText` probe (a
  capability check, not a read) and the spreadsheet preview's explicit right-click *paste* menu,
  which catches the rejection and falls back to its own `sessionStorage` clipboard. **Keep denied.**
- **No shipped surface** calls `getDisplayMedia`, the `Notification` constructor,
  `requestFullscreen`, `requestPointerLock`, `wakeLock`, `navigator.share`, geolocation, MIDI,
  USB/serial, the File System Access pickers, `navigator.storage.persist`, `SpeechRecognition` or
  `window.print`. **Keep denied.**
- `clipboard-sanitized-write` — already allowed by ADR 0049; unchanged.

Decision: the allowlist stays a short positive list. `media` is granted only when every requested
type is `audio` (a request for `audio+video`, `video`, an empty list, or an `unknown` media check is
denied), so the camera can never be turned on by the renderer. Because macOS terminates a process
that asks for the microphone without a usage string, `NSMicrophoneUsageDescription` is added to the
app's `Info.plist` by `electron-builder.yml`. Everything else in the audit stays denied, and the
next feature that needs a permission must extend this list with its own decision record and tests.

Evidence, from the shell's real handlers installed in an Electron session (not a mock):

```
microphone   granted      camera            denied
clipboard-write granted   clipboard-read    denied
geolocation  denied       notifications     denied
persistent-storage denied
```

Consequences: voice input works in the desktop shell — recording is still gated by macOS's own
per-app consent, and on every platform the capture indicator and the user's click are the only way
recording starts, because no surface records without the mic control. Negative: any plugin running
in the harness renderer can open the microphone without an additional shell prompt, exactly like it
can write the clipboard since 0049; the OS consent (macOS/Windows) is the outer gate. Rejected
alternatives: granting `media` wholesale (turns the camera on as well); an in-app consent dialog in
the synchronous permission handler (worth revisiting if third-party plugins ever get microphone
needs, but it delays a capture the user just asked for); keeping the microphone denied (leaves a
shipped, visible control permanently broken, which is the failure this audit exists to remove).
