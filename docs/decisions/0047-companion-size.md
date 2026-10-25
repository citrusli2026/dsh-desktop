# 0047: The desktop companion has its own size

- Date: 2026-10-25
- Status: Accepted
- 中文：[0047](0047-companion-size.zh.md)

The built-in whale uses the plugin's saved `.dshw-size.json` scale. In the main window its base size
comes from the viewport (`clamp(122px, min(100vw, 100vh) * 0.28 * scale, 625px)`); in the 560×620
companion that formula collapses to the 122 px floor, and the earlier adapter hard-coded 1.6 to
compensate. The result was a companion that was much larger than the main whale at the same saved
scale, and changing one changed the other.

Decision: the desktop companion gets its **own size preference** (`whaleCompanionSize`, 80–400 px,
default 160) and no longer derives its size from the main window.

- The shell stores the preference with the other desktop preferences; settings shows a range control
  under the whale toggle and states that it only affects the companion after minimizing.
- The companion URL carries `dshCompanionSize=<px>` **only** for the shell-owned adapter route; a
  third-party plugin's own companion page is untouched.
- The adapter pins `--dshw-scale: 1` and `--dshw-base: <px>` with `!important`, clamped to the window,
  so the same number means the same pixel size regardless of the companion's viewport.
- The main window keeps the widget's own saved scale; the two sizes are independent by design.
- E2E seeds 220 px, asserts the companion root is 220 px and `--dshw-base` is `220px`, while the main
  window still uses the saved 0.6 scale.

Consequences: users can make the desktop whale a comfortable size without changing the in-window
widget; the setting is local, has no effect on third-party companions, and needs only a re-minimize
(re-open of the companion), not a Harness restart. Rejected: sharing the saved scale (viewport math
makes identical numbers look different), and hard-coding a companion multiplier (what shipped in
shell.8 and caused this report).
