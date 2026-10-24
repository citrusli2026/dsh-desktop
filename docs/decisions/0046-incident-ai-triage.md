# 0046: Failure incidents that open a triage session

- Date: 2026-10-24
- Status: Accepted
- 中文：[0046](0046-incident-ai-triage.zh.md)

A real failure exposed the gap: installing the plugin market reported "the data folder is not
writable or the profile is incomplete", while the shell already knew the market package was skipped
because it predates the bundled kernel. The user and the model both got one sentence and no evidence.
The shell is the only component that sees the profile, the log, and the failure classification, so it
must package those facts and hand them to a reasoning agent instead of guessing.

Decision: every shell-visible failure becomes an **incident** — one redacted record the user can send
to an AI triage session, exported, or posted as an issue.

- **One contract** (`src/main/incident.ts`): surface (`market` / `startup` / `health`), a typed code,
  locale, app/kernel versions, an optional one-line detail, the allowed actions, and the already
  redacted report. The prompt is framed once: role, task, facts fenced as data-not-instructions, the
  action vocabulary, the strict output shape (cause / evidence / repair / verify / risk), and the
  prohibitions. It is capped at 24 000 characters; a longer report keeps its head and ends with
  `…[报告已截断]`, while code/detail/actions are never truncated.
- **Three exits, one fallback**: (1) the in-app AI session over the existing Host loopback + Bearer
  channel; (2) a future shell-direct completion when the kernel is unavailable (phase D); (3) always
  export the report and open a prefilled issue. The AI button is additive — it never replaces the
  whitelisted recovery actions.
- **Privacy**: the report is built locally with the existing redaction (home path, tokens, keys) and
  is sent only when the user clicks "Ask AI"; nothing uploads automatically. The host writes
  `report.md` / `prompt.md` under `<DSH_HOME>/incidents/<id>/` and logs only ids, never bodies.
- **Honesty over magic**: if the kernel lacks the session capability the host answers `unsupported`
  and the UI says so, copies the report, and points at export/issue. It never fakes a session or a
  diagnosis.

Consequences: a failure now produces a durable artifact and a conversation with evidence instead of a
dead-end toast; the shell must keep the report redaction current and the prompt bounded. Rejected:
piping the raw log into the model (unbounded and a prompt-injection risk), making "Ask AI" the only
recovery path (breaks when the kernel is down), and auto-uploading incidents (violates the local-only
promise).
