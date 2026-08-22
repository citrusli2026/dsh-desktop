/* dsh-electron-shell 官网脚本 v2:
   - 中英切换;macOS DMG / Windows EXE 双端下载
   - data/release.json 渲染下载矩阵;失败回退 GitHub API;再失败保留静态兜底
   - 平台识别 CTA / 复制 / 滚动 reveal
   零依赖,渐进增强。 */
(function () {
  'use strict'

  var REPO = 'citrusli2026/dsh-electron-shell'
  var RELEASES_URL = 'https://github.com/' + REPO + '/releases'

  /* ══ 文案字典 ══════════════════════════════════════ */
  var I18N = {
    zh: {
      'a11y.skip': '跳到主要内容',
      'brand.community': '社区版 · 非官方',
      'nav.download': '下载', 'nav.workflow': '工作方式', 'nav.features': '特性', 'nav.version': '版本号', 'nav.faq': '常见问题', 'nav.cta': '立即下载',
      'community.label': '社区维护',
      'community.body': '非 DeepSeek 官方产品',
      'community.official': '访问官方站点 ↗',
      'hero.h1': '把 DeepSeek Harness<br />变成可靠的 <em>桌面工作台</em>。',
      'hero.sub': '零配置启动、独立数据空间、崩溃自愈——只增强桌面体验,不改写 Harness 行为。',
      'hero.cta': '下载桌面版',
      'hero.secondary': '看看桌面壳做了什么 →',
      'hero.meta': '无需 Node.js',
      'trust.local': 'Loopback 本地运行', 'trust.isolated': '默认独立数据目录',
      'trust.guarded': '沙箱与权限默认拒绝', 'trust.verifiable': '公开 CI 与真实应用测试',
      'wf.marker': '工作方式', 'wf.title': '一个桌面入口,三层可靠性',
      'wf.lead': '像成熟桌面工具一样开箱即用,同时保留上游 Harness 的原始能力与可审计边界。',
      'wf.s1.title': '下载即运行', 'wf.s1.body': '自带锁定版本的 Node.js 与完整依赖,不要求全局环境。',
      'wf.s2.title': '本地隔离启动', 'wf.s2.body': 'Harness 只监听 loopback,默认使用 ~/.dsh-desktop,不碰 CLI 数据。',
      'wf.s3.title': '桌面壳持续守护', 'wf.s3.body': '托盘状态、崩溃重启、更新检查、日志轮换与诊断导出形成恢复闭环。',
      'wf.adds.label': '桌面壳新增', 'wf.keeps.label': 'Harness 保持原样',
      'wf.adds': '<li>跟随 Harness 的中英菜单与主题</li><li>原生窗口、托盘与单实例</li><li>运行时封装、进程守护与诊断</li><li>Electron 沙箱与导航边界</li>',
      'wf.keeps': '<li>Agent 与工具调用行为</li><li>上游版本和依赖闭包</li><li>模型、账户与插件配置</li><li>CLI 仍可独立并行使用</li>',
      'ext.marker': '扩展功能',
      'ext.title': '扫码，把 Harness 带到手机或平板',
      'ext.body': '桌面端从扩展菜单启动独立的局域网 Web 代理。Harness 继续只监听 loopback，手机浏览器通过一次性配对码获得设备会话。',
      'ext.steps': '<li>扩展 → 通过局域网连接手机 / 平板</li><li>手机与电脑连接同一局域网，扫描二维码</li><li>确认一次性配对码，进入原生 Harness Web 界面</li>',
      'ext.note': '只集成 Web 壳，不需要 Android/iOS；代理与桌面端解耦，可独立产出 Web artifact。',
      'dl.marker': '下载', 'dl.title': '选择你的平台',
      'dl.lead': '每个版本只发布两个安装包:macOS Apple Silicon 的 DMG 与 Windows x64 的 EXE。GitCode 镜像可用时与 GitHub 并列展示。',
      'dl.total': '全版本累计下载 {n} 次',
      'dl.total.note': '含历史版本,仅统计 GitHub 下载',
      'dl.platformTotal': '历史累计 ↓ {n}',
      'dl.released': '发布于 {d}',
      'dl.new': 'NEW',
      'toast.title': '下载已开始 ✓',
      'toast.firstOpenMac': '首次打开如遇「无法验证开发者」:<b>右键点击 → 打开</b>',
      'toast.firstOpenWin': '如遇 SmartScreen 蓝色提示:<b>更多信息 → 仍要运行</b>',
      'toast.verify': '安装包未签名,建议校验后再打开:',
      'toast.cmdMac': '<code>shasum -a 256 -c &lt;安装包&gt;.sha256</code><br /><code>gh attestation verify &lt;安装包&gt; -R citrusli2026/dsh-electron-shell</code>',
      'toast.cmdWin': '<code>CertUtil -hashfile &lt;安装包&gt; SHA256</code><br /><code>gh attestation verify &lt;安装包&gt; -R citrusli2026/dsh-electron-shell</code>',
      'toast.star': '觉得好用?去 GitHub 点个 Star 支持一下 →',
      'toast.close': '关闭',
      'dl.fallback': '版本数据加载失败时,可直接前往 <a href="https://github.com/citrusli2026/dsh-electron-shell/releases" target="_blank" rel="noopener">GitHub Releases</a> 或 <a href="https://gitcode.com/citrusli2026/dsh-electron-shell/releases" target="_blank" rel="noopener">GitCode 镜像</a> 下载。',
      'dl.note': '命令行方式同样可用;桌面壳功能与其完全一致,但使用独立数据目录 <code>~/.dsh-desktop</code>,互不干扰。',
      'guide.mac.title': 'macOS 首次打开',
      'guide.mac.steps': '<ol><li>双击 <code>.dmg</code> 打开,把 dsh-desktop 拖入「应用程序」</li><li>如提示「无法验证开发者」:<b>右键点击</b> App 图标 → <b>打开</b> → 弹窗中再点 <b>打开</b></li><li>以后从启动台正常打开即可</li></ol>',
      'guide.win.title': 'Windows 首次打开',
      'guide.win.steps': '<ol><li>双击 <code>.exe</code> 启动安装向导</li><li>如出现 SmartScreen 蓝色提示:点 <b>更多信息</b> → <b>仍要运行</b></li><li>完成安装后从开始菜单启动</li></ol>',
      'guide.verify': '安装包未购买商业签名证书,但<strong>来源可验证</strong>:每个包附带 <code>.sha256</code> 校验文件,且 CI 为每个包签发 GitHub 来源证明(见常见问题「如何校验下载文件」)。',
      'ft.marker': '特性', 'ft.title': '为什么用它',
      'ft.p1': '<h3>无需安装 Node.js</h3><p>壳内置 Node.js 22 LTS 运行时与 <code>@deepseek-ai/dsh</code> 完整依赖闭包,版本逐平台锁定。下载安装包 → 双击 → 使用,没有任何环境配置。</p>',
      'ft.p2': '<h3>独立数据目录,环境隔离</h3><p>桌面版默认使用 <code>~/.dsh-desktop</code>:设置、会话、API Key、插件都是独立的一份,安装卸载都不影响你的命令行工作流。需要共享时,设 <code>DSH_HOME=~/.dsh</code> 即可。</p>',
      'ft.p3': '<h3>原生菜单与 Harness 保持同一种语言</h3><p>首次启动按系统语言选择中文或英文;之后读取同一份 <code>locale.preference</code>,无需重启即可同步应用菜单、托盘、About、恢复页和对话框。主题也跟随 Harness 设置。</p>',
      'ft.p4': '<h3>持续守护与可靠更新</h3><p>崩溃后按预算退避重启,窗口关闭后可驻留托盘,也可从帮助菜单安全重启 Harness。Windows 保留应用内自动更新;未签名的 macOS 检查新版本并打开精确发布页。</p>',
      'ft.p5': '<h3>渲染层能力默认收敛</h3><p>保持 Electron 沙箱与上下文隔离、关闭 Node 集成并限制页面导航;媒体、定位、通知、屏幕采集和文件系统等额外权限默认拒绝,未来只能按需显式放行。</p>',
      'ft.p6': '<h3>问题发生时,带走一份可检查的报告</h3><p>帮助菜单、托盘和启动失败页都能导出本地诊断报告。报告包含版本、系统状态和有上限的日志尾部,自动遮罩常见密钥与主目录,且绝不自动上传。</p>',
      'theme.toggle': '切换明暗主题',
      'vr.marker': '版本号', 'vr.title': '版本号怎么读',
      'vr.core': '<b>内核版本</b> —— 内置的 <code>@deepseek-ai/dsh</code> 版本。每日工作流自动检查 npm 上游,有新版本就开升级 PR。',
      'vr.shell': '<b>壳修订号</b> —— 壳自身(窗口、守护、打包)的修订次数。同一内核可以有多次壳修订。',
      'faq.marker': '常见问题', 'faq.title': '常见问题',
      'faq.q1': 'macOS 提示"无法打开,因为无法验证开发者"?',
      'faq.a1': 'macOS 版未购买 Apple 开发者证书(决策记录 0004),首次启动请 <b>右键 → 打开</b>。如果仍没有放行选项,且你确认安装包来源可信,可在终端执行:<br><code class="faq-command">xattr -dr com.apple.quarantine "/Applications/dsh-desktop.app"</code><code class="faq-command">open "/Applications/dsh-desktop.app"</code>这会移除下载隔离标记,但不会添加 Apple 签名或公证。<br><br>安装包由公开 CI 构建,可用来源证明验证真伪:<br><code class="faq-command">gh attestation verify /path/to/dsh-desktop-&lt;版本&gt;-arm64-mac.dmg -R citrusli2026/dsh-electron-shell</code>',
      'faq.q2': 'Windows SmartScreen 拦截怎么办?',
      'faq.a2': '安装包未购买代码签名证书。点击 <b>"更多信息" → "仍要运行"</b> 即可。安装包由 GitHub Actions 从公开源码构建,可全程审计;也可用以下命令验证来源:<br><code class="faq-command">gh attestation verify /path/to/dsh-desktop-setup-&lt;版本&gt;.exe -R citrusli2026/dsh-electron-shell</code>',
      'faq.q3': '这和 DeepSeek 官方是什么关系?',
      'faq.a3': '非官方社区打包,与 DeepSeek AI 无关联。DeepSeek Harness 是 DeepSeek 的商标;本仓库仅在 MIT 许可下再打包 <a href="https://www.npmjs.com/package/@deepseek-ai/dsh" target="_blank" rel="noopener">@deepseek-ai/dsh</a>,不改变其任何行为。',
      'faq.q4': '我在用 npx @deepseek-ai/dsh web,配置会带过来吗?',
      'faq.a4': '不会——桌面版是独立环境,数据放在 <code>~/.dsh-desktop</code>,与 CLI 的 <code>~/.dsh</code> 互不影响(决策记录 0012)。想沿用 CLI 配置,启动前设 <code>DSH_HOME=~/.dsh</code> 即可。',
      'faq.q5': 'Apple Silicon 以外的 Mac 可以用吗?',
      'faq.a5': '当前仅提供 Apple Silicon(arm64)安装包。Intel Mac 可暂时使用命令行方式 <code>npx @deepseek-ai/dsh web</code>,功能完全一致。',
      'faq.q6': '桌面版会申请摄像头、定位或文件系统权限吗?',
      'faq.a6': '不会。当前功能不需要这些 Electron Web 权限,桌面壳默认拒绝媒体、定位、通知、采集和文件系统等额外请求;未来如确有需要,必须经过明确的白名单审查。',
      'faq.q7': '桌面菜单为什么是中文或英文?',
      'faq.a7': '首次启动跟随电脑系统语言;不支持的系统语言默认使用英文。之后在 Harness 中切换语言,应用菜单、托盘和 Shell 对话框会读取同一设置并实时同步。',
      'faq.q8': '如何校验下载文件的完整性?',
      'faq.a8': '每个安装包都附带同名的 <code>.sha256</code> 校验文件。下载后可用以下命令验证:<br><code class="faq-command">shasum -a 256 -c dsh-desktop-&lt;版本&gt;-arm64-mac.dmg.sha256</code><br>Windows 用户可用:<br><code class="faq-command">CertUtil -hashfile dsh-desktop-setup-&lt;版本&gt;.exe SHA256</code><br>校验值应与 <code>.sha256</code> 文件内容一致。也可使用 <code>npx dsh-validate-release</code> 自动校验整个 Release 目录。',
      'footer.legal': 'MIT © 2026 dsh-desktop contributors<br /><strong>社区维护 · 非官方产品</strong><br />与 DeepSeek AI 无隶属、授权或合作关系',
      'footer.mirror': 'GitCode 镜像', 'footer.releases': '全部版本', 'footer.issues': '问题反馈',
      'footer.sync': '纯静态站点 · 部署于 Vercel<br />版本数据由 GitHub Actions 自动同步',
      'copy': '复制', 'copy.link': '复制链接', 'copied': '已复制 ✓',
    },
    en: {
      'a11y.skip': 'Skip to main content',
      'brand.community': 'COMMUNITY · UNOFFICIAL',
      'nav.download': 'DOWNLOAD', 'nav.workflow': 'HOW IT WORKS', 'nav.features': 'FEATURES', 'nav.version': 'VERSIONING', 'nav.faq': 'FAQ', 'nav.cta': 'Download',
      'community.label': 'COMMUNITY-MAINTAINED',
      'community.body': 'Not an official DeepSeek product',
      'community.official': 'Visit official site ↗',
      'hero.h1': 'DeepSeek Harness,<br />as a dependable <em>desktop workspace</em>.',
      'hero.sub': 'Zero-setup launch, isolated data, crash recovery — a better desktop experience without changing how Harness works.',
      'hero.cta': 'Download for Desktop',
      'hero.secondary': 'See what the shell adds →',
      'hero.meta': 'NO NODE.JS REQUIRED',
      'trust.local': 'Loopback-only runtime', 'trust.isolated': 'Isolated data by default',
      'trust.guarded': 'Sandboxed, deny by default', 'trust.verifiable': 'Public CI and real-app tests',
      'wf.marker': 'HOW IT WORKS', 'wf.title': 'One desktop entry point. Three reliability layers.',
      'wf.lead': 'Ready like a mature desktop tool, while keeping upstream Harness behavior and boundaries auditable.',
      'wf.s1.title': 'Download and run', 'wf.s1.body': 'A pinned Node.js runtime and full dependency closure are included. No global setup.',
      'wf.s2.title': 'Start locally, stay isolated', 'wf.s2.body': 'Harness listens on loopback and defaults to ~/.dsh-desktop, leaving CLI data alone.',
      'wf.s3.title': 'The shell keeps watch', 'wf.s3.body': 'Tray status, crash restart, update checks, log rotation, and diagnostics close the recovery loop.',
      'wf.adds.label': 'THE DESKTOP SHELL ADDS', 'wf.keeps.label': 'HARNESS STAYS INTACT',
      'wf.adds': '<li>Harness-synced bilingual menus and theme</li><li>Native window, tray, and single instance</li><li>Runtime packaging, supervision, and diagnostics</li><li>Electron sandbox and navigation boundary</li>',
      'wf.keeps': '<li>Agent and tool-call behavior</li><li>Upstream version and dependency closure</li><li>Model, account, and plugin configuration</li><li>The CLI remains independently usable</li>',
      'ext.marker': 'EXTENSION',
      'ext.title': 'Scan once. Bring Harness to a phone or tablet.',
      'ext.body': 'The desktop shell starts an isolated LAN Web proxy from the Extensions menu. Harness stays loopback-only while a browser exchanges a one-time pairing code for a device session.',
      'ext.steps': '<li>Extensions → Connect a mobile device over LAN</li><li>Put the phone and computer on the same LAN, then scan</li><li>Confirm the one-time code and enter the original Harness Web UI</li>',
      'ext.note': 'Web shell only: no Android/iOS dependency. The proxy is decoupled from Electron and can ship as an independent Web artifact.',
      'dl.marker': 'DOWNLOAD', 'dl.title': 'Pick your platform',
      'dl.lead': 'Every release carries exactly two installers: a DMG for Apple Silicon Macs and an EXE for Windows x64. A verified GitCode mirror appears alongside GitHub when available.',
      'dl.total': '{n} downloads across all versions',
      'dl.total.note': 'Includes past releases; GitHub downloads only',
      'dl.platformTotal': 'All-time ↓ {n}',
      'dl.released': 'released {d}',
      'dl.new': 'NEW',
      'toast.title': 'Download started ✓',
      'toast.firstOpenMac': 'If macOS says "cannot be verified": <b>right-click → Open</b>',
      'toast.firstOpenWin': 'If SmartScreen prompts: <b>More info → Run anyway</b>',
      'toast.verify': 'Unsigned installer — verify before opening:',
      'toast.cmdMac': '<code>shasum -a 256 -c &lt;installer&gt;.sha256</code><br /><code>gh attestation verify &lt;installer&gt; -R citrusli2026/dsh-electron-shell</code>',
      'toast.cmdWin': '<code>CertUtil -hashfile &lt;installer&gt; SHA256</code><br /><code>gh attestation verify &lt;installer&gt; -R citrusli2026/dsh-electron-shell</code>',
      'toast.star': 'Enjoying it? Star us on GitHub →',
      'toast.close': 'Close',
      'dl.fallback': 'If live data fails to load, head to <a href="https://github.com/citrusli2026/dsh-electron-shell/releases" target="_blank" rel="noopener">GitHub Releases</a> directly.',
      'dl.note': 'The CLI route works too; the shell is functionally identical but keeps its own data home at <code>~/.dsh-desktop</code> — no interference either way.',
      'guide.mac.title': 'First launch on macOS',
      'guide.mac.steps': '<ol><li>Open the <code>.dmg</code> and drag dsh-desktop into Applications</li><li>If you see "cannot be verified": <b>right-click</b> the app icon → <b>Open</b> → click <b>Open</b> again in the dialog</li><li>Launch normally from Launchpad afterwards</li></ol>',
      'guide.win.title': 'First launch on Windows',
      'guide.win.steps': '<ol><li>Double-click the <code>.exe</code> to start the installer</li><li>If SmartScreen shows a blue prompt: click <b>More info</b> → <b>Run anyway</b></li><li>Launch from the Start menu after install</li></ol>',
      'guide.verify': 'Installers are not commercially code-signed, but <strong>provenance is verifiable</strong>: every package ships a <code>.sha256</code> checksum and CI attaches a GitHub-signed build attestation (see FAQ "How do I verify downloads").',
      'ft.marker': 'FEATURES', 'ft.title': 'Why this shell',
      'ft.p1': '<h3>No Node.js install required</h3><p>The shell bundles a pinned Node.js 22 LTS runtime and the complete <code>@deepseek-ai/dsh</code> dependency closure, pinned per platform. Download → double-click → use.</p>',
      'ft.p2': '<h3>Isolated data home</h3><p>The desktop app defaults to <code>~/.dsh-desktop</code>: settings, sessions, API keys, and plugins are its own copy — installing or uninstalling never touches your CLI workflow. Set <code>DSH_HOME=~/.dsh</code> to share again.</p>',
      'ft.p3': '<h3>Native chrome in the same language as Harness</h3><p>First launch follows the operating-system language. Afterwards the shell reads the same <code>locale.preference</code>, live-syncing the app menu, tray, About, recovery pages, and dialogs without a restart. Theme follows Harness too.</p>',
      'ft.p4': '<h3>Continuous supervision and reliable updates</h3><p>Budgeted backoff after crashes, close-to-tray behavior, and a safe Harness restart from Help. Windows keeps in-place automatic updates; unsigned macOS checks for updates and opens the exact release page.</p>',
      'ft.p5': '<h3>Renderer capabilities stay constrained</h3><p>Electron sandboxing and context isolation stay on, Node integration stays off, and navigation is guarded. Media, location, notification, capture, and filesystem permissions are denied by default; future exceptions must be explicitly allowlisted.</p>',
      'ft.p6': '<h3>Take an inspectable report when something breaks</h3><p>Export a local diagnostic report from Help, the tray, or the startup error page. It includes versions, system state, and a bounded log tail, masks common secrets and the home path, and is never uploaded automatically.</p>',
      'theme.toggle': 'Toggle light/dark theme',
      'vr.marker': 'VERSIONING', 'vr.title': 'Reading the version',
      'vr.core': '<b>Kernel version</b> — the bundled <code>@deepseek-ai/dsh</code> release. A daily workflow checks upstream npm and files an upgrade PR automatically.',
      'vr.shell': '<b>Shell revision</b> — how many times the shell itself (window, supervision, packaging) has been revised on this kernel.',
      'faq.marker': 'FAQ', 'faq.title': 'Frequently asked',
      'faq.q1': 'macOS says "cannot be opened because the developer cannot be verified"?',
      'faq.a1': 'The macOS build is unsigned (decision 0004). <b>Right-click → Open</b> on first launch. If no override is offered and you trust the installer source, run:<br><code class="faq-command">xattr -dr com.apple.quarantine "/Applications/dsh-desktop.app"</code><code class="faq-command">open "/Applications/dsh-desktop.app"</code>This removes the download-quarantine marker, but does not add an Apple signature or notarization.<br><br>Builds come from public CI; verify provenance with:<br><code class="faq-command">gh attestation verify /path/to/dsh-desktop-&lt;version&gt;-arm64-mac.dmg -R citrusli2026/dsh-electron-shell</code>',
      'faq.q2': 'Windows SmartScreen blocks the installer?',
      'faq.a2': 'The installer is unsigned. Choose <b>"More info" → "Run anyway"</b>. Builds are produced by GitHub Actions from public source — fully auditable. You can also verify provenance:<br><code class="faq-command">gh attestation verify /path/to/dsh-desktop-setup-&lt;version&gt;.exe -R citrusli2026/dsh-electron-shell</code>',
      'faq.q3': 'Is this affiliated with DeepSeek?',
      'faq.a3': 'No. Unofficial community packaging, not affiliated with DeepSeek AI. DeepSeek Harness is a trademark of DeepSeek; this repo only repackages <a href="https://www.npmjs.com/package/@deepseek-ai/dsh" target="_blank" rel="noopener">@deepseek-ai/dsh</a> under MIT without changing its behavior.',
      'faq.q4': 'I use npx @deepseek-ai/dsh web — will my config carry over?',
      'faq.a4': 'No — the desktop app is an isolated environment storing data in <code>~/.dsh-desktop</code>, separate from the CLI\'s <code>~/.dsh</code> (decision 0012). To reuse your CLI setup, start it with <code>DSH_HOME=~/.dsh</code>.',
      'faq.q5': 'Macs beyond Apple Silicon?',
      'faq.a5': 'Only Apple Silicon (arm64) builds are provided for now. Intel Macs can use <code>npx @deepseek-ai/dsh web</code> — functionally identical.',
      'faq.q6': 'Does the desktop app request camera, location, or filesystem access?',
      'faq.a6': 'No. Current features need none of those Electron web permissions, so media, location, notifications, capture, and filesystem requests are denied by default. Any future exception requires an explicit, reviewed allowlist.',
      'faq.q7': 'Why are desktop menus in Chinese or English?',
      'faq.a7': 'First launch follows the computer language; unsupported languages fall back to English. Change the language inside Harness afterwards and the app menu, tray, and shell dialogs live-sync from the same setting.',
      'faq.q8': 'How do I verify the integrity of downloaded files?',
      'faq.a8': 'Each installer ships with a matching <code>.sha256</code> checksum file. After downloading, verify with:<br><code class="faq-command">shasum -a 256 -c dsh-desktop-&lt;version&gt;-arm64-mac.dmg.sha256</code><br>On Windows:<br><code class="faq-command">CertUtil -hashfile dsh-desktop-setup-&lt;version&gt;.exe SHA256</code><br>The computed hash should match the contents of the <code>.sha256</code> file. You can also use <code>npx dsh-validate-release</code> to automatically validate an entire release directory.',
      'footer.legal': 'MIT © 2026 dsh-desktop contributors<br /><strong>Community-maintained · Unofficial</strong><br />No affiliation, authorization, or partnership with DeepSeek AI',
      'footer.mirror': 'GitCode mirror', 'footer.releases': 'All releases', 'footer.issues': 'Issues',
      'footer.sync': 'Static site · deployed on Vercel<br />Release data auto-synced by GitHub Actions',
      'copy': 'COPY', 'copy.link': 'COPY LINK', 'copied': 'COPIED ✓',
    },
  }

  var OS_LABEL = {
    zh: {
      mac: ['macOS', 'APPLE SILICON · 未签名,首次请右键 → 打开'],
      win: ['Windows', 'NSIS 安装包 · SmartScreen 选"更多信息 → 仍要运行"'],
    },
    en: {
      mac: ['macOS', 'APPLE SILICON · UNSIGNED; RIGHT-CLICK → OPEN ON FIRST LAUNCH'],
      win: ['Windows', 'NSIS INSTALLER · SMARTSCREEN: "MORE INFO → RUN ANYWAY"'],
    },
  }
  var OS_NOTE = {
    zh: {
      mac: '.dmg 拖入“应用程序”即可使用。',
      win: '支持 Windows 10 及以上(64 位)与原地自动更新。',
    },
    en: {
      mac: 'Drag the DMG app into Applications to install.',
      win: 'Windows 10+ (64-bit) with in-place updates.',
    },
  }

  /* ══ 主题状态(默认跟随系统,点按后固定浅色/深色) ═══════ */
  var themeChoice = (function () {
    try {
      var saved = localStorage.getItem('dsh-site-theme')
      if (saved === 'light' || saved === 'dark') return saved
    } catch (e) {}
    return null
  })()
  var systemDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : { matches: false }
  var THEME_COLORS = { light: '#f9f8f8', dark: '#0c0f16' }
  var THEME_ICONS = {
    light: '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><circle cx="8" cy="8" r="3.1" fill="none" stroke="currentColor" stroke-width="1.5"/><g stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8 1v1.7M8 13.3V15M1 8h1.7M13.3 8H15M3 3l1.2 1.2M11.8 11.8 13 13M13 3l-1.2 1.2M4.2 11.8 3 13"/></g></svg>',
    dark: '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M13.4 9.6A5.8 5.8 0 0 1 6.4 2.6a5.8 5.8 0 1 0 7 7Z"/></svg>',
  }

  function effectiveTheme() {
    return themeChoice || (systemDark.matches ? 'dark' : 'light')
  }

  function applyTheme() {
    var eff = effectiveTheme()
    document.documentElement.dataset.theme = eff
    $all('meta[name="theme-color"]').forEach(function (m) { m.content = THEME_COLORS[eff] })
    var btn = $('#theme-toggle')
    if (btn) {
      btn.innerHTML = THEME_ICONS[eff]
      btn.title = t('theme.toggle')
      btn.setAttribute('aria-label', t('theme.toggle'))
    }
  }

  function bindThemeToggle() {
    $('#theme-toggle').addEventListener('click', function () {
      themeChoice = effectiveTheme() === 'dark' ? 'light' : 'dark'
      try { localStorage.setItem('dsh-site-theme', themeChoice) } catch (e) {}
      applyTheme()
    })
    var onSystemChange = function () { if (!themeChoice) applyTheme() }
    if (systemDark.addEventListener) systemDark.addEventListener('change', onSystemChange)
    else if (systemDark.addListener) systemDark.addListener(onSystemChange)
  }

  /* ══ 语言状态 ══════════════════════════════════════ */
  var lang = (function () {
    try {
      var saved = localStorage.getItem('dsh-site-lang')
      if (saved === 'zh' || saved === 'en') return saved
    } catch (e) {}
    return (navigator.language || 'zh').toLowerCase().indexOf('zh') === 0 ? 'zh' : 'en'
  })()
  var siteData = null

  function t(key) { return (I18N[lang] && I18N[lang][key]) || I18N.zh[key] || key }

  /* ══ 工具 ══════════════════════════════════════════ */
  function $(sel, el) { return (el || document).querySelector(sel) }
  function $all(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)) }

  function fmtSize(bytes) {
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB'
    if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return bytes + ' B'
  }
  function fmtNum(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  }
  function fmtDate(iso) {
    var d = new Date(iso)
    if (isNaN(d)) return iso
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
  }
  function platformOf(name) {
    if (/arm64-mac\.dmg$/.test(name)) return { os: 'mac', primary: true, fmt: 'dmg' }
    if (/setup-.*\.exe$/.test(name)) return { os: 'win', primary: true, fmt: 'exe' }
    return null
  }

  function publicKind(name) {
    if (platformOf(name)) return 'installer'
    if (platformOf(name.replace(/\.sha256$/, '')) && name.endsWith('.sha256')) return 'checksum'
    return null
  }

  /* 每个资产给出两个下载源:GitCode 国内镜像(已验证可用时)+ GitHub。
     中文界面镜像排前,英文界面 GitHub 排前。 */
  function linksOf(a) {
    var gh = { href: a.url, src: 'GitHub' }
    var gc = a.gitcode_url && a.gitcode_ok
      ? { href: a.gitcode_url, src: lang === 'zh' ? 'GitCode 镜像' : 'GitCode mirror' }
      : null
    if (!gc) return [gh]
    return lang === 'zh' ? [gc, gh] : [gh, gc]
  }

  /* ══ 数据加载 ══════════════════════════════════════ */
  function fromGitHubApi() {
    return fetch('https://api.github.com/repos/' + REPO + '/releases?per_page=5', {
      headers: { Accept: 'application/vnd.github+json' },
    }).then(function (res) {
      if (!res.ok) throw new Error('api ' + res.status)
      return res.json()
    }).then(function (releases) {
      var r = releases.filter(function (x) { return !x.draft })
        .sort(function (a, b) { return new Date(b.published_at) - new Date(a.published_at) })[0]
      if (!r) throw new Error('no release')
      return {
        generated_at: null,
        repo: { stars: null },
        release: {
          tag: r.tag_name, name: r.name || r.tag_name, html_url: r.html_url,
          published_at: r.published_at, prerelease: r.prerelease,
          assets: r.assets.filter(function (a) { return publicKind(a.name) }).map(function (a) {
            var kind = publicKind(a.name)
            return {
              name: a.name, size: a.size, downloads: a.download_count,
              url: a.browser_download_url,
              kind: kind, sha256: null,
              gitcode_url: null, gitcode_ok: false,
            }
          }),
        },
      }
    })
  }

  function loadData() {
    return fetch('/data/release.json', { cache: 'no-cache' })
      .then(function (res) {
        if (!res.ok) throw new Error('local ' + res.status)
        return res.json()
      })
      .catch(fromGitHubApi)
  }

  /* ══ 渲染 ══════════════════════════════════════════ */
  function renderMeta(data) {
    var r = data.release
    // 版本 + 发布时间;发布 3 天内加 NEW 徽标。rc 版本均为预发布,
    // 不再显示 "PRE" 以免被误读为"不稳定"。
    var label = r.tag
    if (r.published_at) {
      label += ' · ' + t('dl.released').replace('{d}', fmtDate(r.published_at))
      var ageDays = (Date.now() - new Date(r.published_at).getTime()) / 86400000
      if (ageDays >= 0 && ageDays <= 3) label += ' · <span class="new-badge">' + t('dl.new') + '</span>'
    }
    $('#release-meta').innerHTML = label

    var meta = $('#hero-meta')
    meta.innerHTML = r.tag + ' · macOS / Windows · <span data-i18n="hero.meta">' + t('hero.meta') + '</span>'

    var ver = r.tag.replace(/^v/, '')
    var m = ver.match(/^(.*)\.(shell\.\d+)$/)
    if (m) {
      $('#v-core').textContent = m[1]
      $('#v-shell').textContent = m[2]
      // 图例 chip 与动态版本共用同一份解析结果,杜绝硬编码失同步
      var legendCore = $('#legend-core')
      var legendShell = $('#legend-shell')
      if (legendCore) legendCore.textContent = m[1]
      if (legendShell) legendShell.textContent = m[2]
    }

    $('#sync-time').textContent = data.generated_at
      ? (lang === 'zh' ? '数据同步于 ' : 'data synced ') + fmtDate(data.generated_at) + ' ' + data.generated_at.slice(11, 16) + ' UTC'
      : (lang === 'zh' ? '数据来自 GitHub API 实时拉取' : 'live data via GitHub API')

    renderTotalDownloads(data.stats && data.stats.installer_downloads)
  }

  /* 全版本累计安装包下载——每个新版本单资产计数会归零,累计值才反映真实使用量 */
  function renderTotalDownloads(total) {
    var el = $('#total-downloads')
    if (!el || typeof total !== 'number') return
    el.textContent = t('dl.total').replace('{n}', fmtNum(total))
    el.title = t('dl.total.note')
    el.hidden = false
  }

  function renderPlatforms(data) {
    var installers = data.release.assets.filter(function (a) { return a.kind === 'installer' })
    var groups = { mac: [], win: [] }
    installers.forEach(function (a) {
      var p = platformOf(a.name)
      if (p && groups[p.os]) groups[p.os].push(Object.assign({}, a, p))
    })

    var labels = OS_LABEL[lang]
    var notes = OS_NOTE[lang]
    var html = ''
    ;['mac', 'win'].forEach(function (os) {
      var list = groups[os]
      if (!list.length) return
      list.sort(function (a, b) { return (b.primary ? 1 : 0) - (a.primary ? 1 : 0) })
      // 该平台全版本累计下载（dmg/exe 分别统计,见 release.json stats）
      var hist = data.stats && (os === 'mac' ? data.stats.mac_downloads : data.stats.win_downloads)
      html += '<div class="platform-group">'
      html += '<div class="platform-group__head"><h3>' + labels[os][0] + '</h3><span>' + labels[os][1] + '</span>'
      if (typeof hist === 'number') {
        html += '<span class="platform-hist" title="' + t('dl.total.note') + '">' + t('dl.platformTotal').replace('{n}', fmtNum(hist)) + '</span>'
      }
      html += '</div>'
      list.forEach(function (a) {
        var links = linksOf(a)
        html += '<div class="asset-row">'
        html += '<span class="asset-row__name" title="' + a.name + '">' + a.name + '</span>'
        html += '<span class="asset-row__meta">' + fmtSize(a.size) + ' · ↓ ' + a.downloads + '</span>'
        html += '<span class="asset-row__actions">'
        links.forEach(function (link, i) {
          var btnText = a.fmt + ' · ' + link.src
          html += '<a class="dl-btn' + (i === 0 && a.primary ? '' : ' dl-btn--alt') + '" data-platform="' + os + '" href="' + link.href + '" aria-label="' + btnText + '">'
            + '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M8 11.5 3.5 7l1.4-1.4L7 7.7V1h2v6.7l2.1-2.1L12.5 7 8 11.5ZM2 13.5h12V15H2v-1.5Z"/></svg>'
            + btnText + '</a>'
        })
        html += '<button class="copybtn" type="button" data-copy="' + links[0].href + '">' + t('copy.link') + '</button>'
        html += '</span></div>'
      })
      html += '<p class="platform-note">' + notes[os] + '</p>'
      html += '</div>'
    })
    if (html) $('#platform-rows').innerHTML = html
  }

  function fetchRealTimeDownloads(data) {
    fetch('/api/downloads')
      .then(function (res) { return res.json() })
      .then(function (live) {
        if (!live || !live.assets || !live.assets.length) return
        var updated = false
        live.assets.forEach(function (la) {
          var found = data.release.assets.find(function (a) { return a.name === la.name })
          if (found && found.downloads !== la.downloads) {
            found.downloads = la.downloads
            updated = true
          }
        })
        if (typeof live.mac_downloads === 'number' && typeof live.win_downloads === 'number' && typeof live.total_downloads === 'number') {
          data.stats = data.stats || {}
          data.stats.mac_downloads = live.mac_downloads
          data.stats.win_downloads = live.win_downloads
          data.stats.installer_downloads = live.total_downloads
          updated = true
        }
        if (updated) {
          renderPlatforms(data)
          bindCopy($('#platform-rows'))
          bindDownloadGuide()
        }
        if (typeof live.total_downloads === 'number') renderTotalDownloads(live.total_downloads)
        // 更新同步时间文案为实时模式
        var syncEl = $('#sync-time')
        if (syncEl) {
          syncEl.textContent = (lang === 'zh'
            ? '下载数实时同步于 GitHub · ' + live.generated_at.slice(11, 16) + ' UTC'
            : 'download count live-synced from GitHub · ' + live.generated_at.slice(11, 16) + ' UTC')
        }
      })
      .catch(function () { /* silent fallback */ })
  }

  function tunePrimaryCta(data) {
    var os = detectPlatform()
    if (!os || os === 'mobile') return
    var hit = data.release.assets.filter(function (a) {
      var p = platformOf(a.name)
      return p && p.os === os && p.primary
    })[0]
    if (!hit) return
    var link = linksOf(hit)[0]
    var cta = $('#cta-primary')
    cta.href = link.href
    cta.textContent = (lang === 'zh'
      ? '下载 ' + OS_LABEL.zh[os][0] + ' 版'
      : 'Download for ' + OS_LABEL.en[os][0]) + ' · ' + fmtSize(hit.size)
  }

  /* 访问者平台识别。注意:iOS Safari 的 UA 含 "Macintosh",必须先排除
     移动端,否则 iPhone/iPad 会被误判成 macOS(表现为默认展示 macOS 引导
     卡、点 Windows 下载按钮不滚动)。 */
  function detectPlatform() {
    var ua = navigator.userAgent
    if (/Android|iPhone|iPad|iPod/i.test(ua)) return 'mobile'
    if (/Mac/.test(ua)) return 'mac'
    if (/Windows/.test(ua)) return 'win'
    return null
  }
  var uaOs = detectPlatform()

  /* 首次打开引导卡:默认按访问者平台显示;点击下载按钮时按按钮平台渲染
     (移动端访问者点击任意平台按钮都会看到对应平台的打开提示)。 */
  function renderFirstRun(os) {
    var el = $('#first-run')
    if (!el) return
    os = os || uaOs
    if (!os || os === 'mobile') {
      el.hidden = true
      return
    }
    el.innerHTML =
      '<div class="first-run__card first-run__card--' + os + '">'
      + '<h4>' + t('guide.' + os + '.title') + '</h4>'
      + t('guide.' + os + '.steps')
      + '</div>'
      + '<p class="first-run__verify">' + t('guide.verify') + '</p>'
    el.hidden = false
  }

  /* 点下载按钮:渲染对应平台的打开提示卡,滚动到引导卡并短暂高亮;
     同时弹出下载后提示(校验方式 + Star 邀请)。 */
  function bindDownloadGuide() {
    var guide = $('#first-run')
    if (!guide) return
    $all('.dl-btn').forEach(function (btn) {
      if (btn.__guideBound) return
      btn.__guideBound = true
      btn.addEventListener('click', function () {
        var os = btn.getAttribute('data-platform')
        if (os === 'mac' || os === 'win') renderFirstRun(os)
        if (!guide.hidden) {
          guide.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
          guide.classList.remove('is-flash')
          void guide.offsetWidth
          guide.classList.add('is-flash')
        }
        showDownloadToast(os)
      })
    })
  }

  /* ══ 下载后提示(校验方式 + 未签名处理 + GitHub Star 邀请) ═══════ */
  function showDownloadToast(os) {
    var toast = $('#download-toast')
    if (!toast) return
    var cmd = os === 'win' ? t('toast.cmdWin') : t('toast.cmdMac')
    var firstOpen = os === 'win' ? t('toast.firstOpenWin') : t('toast.firstOpenMac')
    toast.innerHTML =
      '<div class="download-toast__head"><b>' + t('toast.title') + '</b>'
      + '<button class="download-toast__close" type="button" aria-label="' + t('toast.close') + '">×</button></div>'
      + '<p class="download-toast__first">' + firstOpen + '</p>'
      + '<p class="download-toast__verify">' + t('toast.verify') + '</p>'
      + '<p class="download-toast__cmd">' + cmd + '</p>'
      + '<a class="download-toast__star" href="https://github.com/citrusli2026/dsh-electron-shell" target="_blank" rel="noopener">'
      + '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path fill="currentColor" d="M8 .5 10 5.4l5.2.4-4 3.4 1.2 5L8 11.2 3.6 14.2l1.2-5-4-3.4L6 5.4 8 .5Z"/></svg>'
      + t('toast.star') + '</a>'
    toast.hidden = false
    var close = toast.querySelector('.download-toast__close')
    if (close) {
      close.onclick = function () { toast.hidden = true }
    }
  }

  /* ══ 交互 ══════════════════════════════════════════ */
  function bindCopy(root) {
    $all('.copybtn', root).forEach(function (btn) {
      if (btn.__bound) return
      btn.__bound = true
      btn.addEventListener('click', function () {
        var text = btn.getAttribute('data-copy')
        if (!text) return
        var done = function () {
          var old = btn.textContent
          btn.textContent = t('copied')
          btn.classList.add('is-copied')
          setTimeout(function () { btn.textContent = old; btn.classList.remove('is-copied') }, 1600)
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, done)
        } else {
          var ta = document.createElement('textarea')
          ta.value = text; document.body.appendChild(ta); ta.select()
          try { document.execCommand('copy') } catch (e) {}
          document.body.removeChild(ta); done()
        }
      })
    })
  }

  /* 滚动 reveal */
  function bindReveal() {
    var els = $all('[data-reveal]')
    if (!('IntersectionObserver' in window)) {
      els.forEach(function (el) { el.classList.add('is-in') })
      return
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target) }
      })
    }, { threshold: 0.12 })
    els.forEach(function (el) { io.observe(el) })
  }

  /* ══ 语言切换 ══════════════════════════════════════ */
  function applyLang() {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
    document.title = lang === 'zh'
      ? 'dsh-desktop — DeepSeek Harness 桌面壳 · 下载'
      : 'dsh-desktop — DeepSeek Harness desktop shell · Download'
    $all('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n')
      if (I18N[lang][key] !== undefined) el.innerHTML = I18N[lang][key]
    })
    $('#lang-toggle').textContent = lang === 'zh' ? 'EN' : '中'
    renderFirstRun()
    if (siteData) {
      renderMeta(siteData)
      renderPlatforms(siteData)
      tunePrimaryCta(siteData)
      bindCopy($('#platform-rows'))
      bindDownloadGuide()
    }
  }

  function bindLangToggle() {
    $('#lang-toggle').addEventListener('click', function () {
      lang = lang === 'zh' ? 'en' : 'zh'
      try { localStorage.setItem('dsh-site-lang', lang) } catch (e) {}
      applyLang()
    })
  }

  /* ══ 启动 ══════════════════════════════════════════ */
  bindReveal()
  bindLangToggle()
  bindThemeToggle()
  bindCopy(document)
  applyTheme()
  if (lang === 'en') applyLang()

  loadData()
    .then(function (data) {
      siteData = data
      renderMeta(data)
      renderPlatforms(data)
      tunePrimaryCta(data)
      renderFirstRun()
      bindCopy($('#platform-rows'))
      bindDownloadGuide()
      fetchRealTimeDownloads(data)
    })
    .catch(function () {
      $('#release-meta').textContent = 'OFFLINE → GITHUB'
      $('#release-meta').parentElement.addEventListener('click', function () {
        window.open(RELEASES_URL, '_blank')
      })
    })
})()
