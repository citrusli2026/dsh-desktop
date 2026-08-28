
**安装与下载**

- macOS: `dsh-desktop-<版本>-arm64-mac.dmg`（Apple Silicon）。首次打开如遇 Gatekeeper 提示，请 **右键点击 → 打开**。
- Windows: `dsh-desktop-setup-<版本>.exe`。如遇 SmartScreen 提示，点 **更多信息 → 仍要运行**。
- Linux: `dsh-desktop-<版本>-amd64.deb`（Debian/Ubuntu/UOS/Deepin/麒麟,双击安装）。
- 每个安装包均附带 `.sha256` 校验文件。

**验证安装包来源（可选但推荐）**
```sh
gh attestation verify <下载的安装包> -R citrusli2026/dsh-desktop
shasum -a 256 -c <安装包>.sha256
```
安装包由公开 CI（GitHub Actions）构建，来源证明可随时验证。
