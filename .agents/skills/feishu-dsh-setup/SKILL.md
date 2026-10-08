---
name: feishu-dsh-setup
description: Set up the official Feishu/Lark CLI skills and user OAuth for dsh-desktop, then configure cc-connect separately when Desktop message integration is requested.
---

# Feishu/Lark setup for dsh-desktop

Use the repository one-click entry from an interactive terminal:

```bash
pnpm run feishu:setup
```

It delegates to the official `@larksuite/cli` installer. The installer creates
the official Feishu skills and interactively configures the CLI app and user
OAuth. A browser or phone confirmation may be required.

Verify the user-facing CLI setup without printing credentials:

```bash
lark-cli whoami
lark-cli doctor
```

Keep the two authentication paths separate:

- `lark-cli` is user identity plus Feishu skills for AI-agent operations.
- `cc-connect feishu setup` is the Feishu bot identity used by DSH Desktop
  message routing. Configure it from the Desktop settings or its QR/bind
  flow when message integration is requested.

Never put an App Secret, token, or OAuth credential in a command transcript,
repository file, test fixture, or log. Do not edit real `~/.dsh`,
`~/.dsh-desktop`, or `~/.cc-connect` while validating this workflow.
