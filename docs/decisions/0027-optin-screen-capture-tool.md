# 0027: Opt-in screen capture tool — vision via the native pipeline

- Date: 2026-08-29
- Status: accepted
- 中文:[0027](0027-optin-screen-capture-tool.zh.md)

## Context

Vision for a desktop agent splits into model-side and shell-side halves.
The model side is upstream's: a vision-capable model route (for example
deepseek-v4-flash-vision-exp) reads images committed through the harness's
native attachment service, exactly like the built-in `read_image` tool.
The shell side is ours and is not replicable by the Web UI: capturing the
screen. Community consensus (FuqiangCraft's contract) is opt-in capture
with screenshots always fed back into the session — never silent
injection. Our own privacy FAQ previously promised "no screenshots, no
visual recognition", so the feature must ship together with an honest
privacy statement.

## Decision

- **Route C only — no self-built vision routing.** The shell never sends
  images to a second model. The shell-owned controls plugin registers a
  `screen_capture` tool whose result is committed through the native
  attachment service (`attachments.saveImage`), so the session's
  image-capable model receives the PNG directly, with the same route gate
  as `read_image` (the calling route must declare image input).
- **Opt-in, default off.** The tool registers only when the spawn
  environment carries `DSH_DESKTOP_SCREEN_CAPTURE=1`, which the shell sets
  from the `screenCapture` preference (new, default false). Toggling the
  扩展设置 checkbox restarts the kernel — the same semantics as Safe Mode.
- **Capture mechanics**: platform CLI per OS — `screencapture -x`
  (macOS), PowerShell CopyFromScreen (Windows), and a fallback chain of
  scrot/gnome-screenshot/spectacle/import (Linux). The PNG is written to a
  temp file, committed, and deleted; dimensions come from the attachment
  service's normalized ref.
- **Privacy copy ships with the feature**: the site FAQ now states that
  notifications never read the screen, and that screen capture exists,
  is default-off, and sends screenshots only into the conversation the
  user chose.

## Consequences

- Positive: the desktop shell gains its one irreplaceable vision
  capability without owning any model routing; the Web UI keeps its
  native paste-image path; the tool contract matches `read_image`, so any
  vision-capable route works unchanged.
- Negative: macOS requires Screen Recording permission on first capture
  (a user-side grant); Linux depends on whichever screenshot CLI exists;
  the kernel restart on toggle interrupts running sessions.

## Alternatives

- Vision routing plugins (transcribe-to-text bridges): explicitly
  rejected — the model side belongs to the harness and its model routes;
- Clipboard-only capture (no model tool): a workflow the user can already
  do, and the tool loop is the actual capability — deferred as UX sugar;
- Registering the tool unconditionally and checking the preference at
  call time: the host half cannot reach shell preferences at runtime
  without a new transport; the env flag at spawn keeps the trust boundary
  one-way — rejected.
