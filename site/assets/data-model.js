/* dsh-desktop 官网纯数据层 (ESM, 无 DOM):文案字典、资产分类、复合版本拆分、
   格式化与 GitHub API 载荷归一化。app.js (渲染/交互) 与 scripts/check-site.mjs
   (完整性校验) 都从这里导入,避免站点唯一的测试 seam 退化为正则刮取。 */

/* ══ 文案字典 ══════════════════════════════════════ */
export var I18N = {
  zh: {
    'a11y.skip': '跳到主要内容',
    'a11y.menuOpen': '打开导航', 'a11y.menuClose': '关闭导航',
      'brand.community': '社区版',
    'nav.workflow': '定位', 'nav.showcase': '实拍展示', 'nav.features': '能力', 'nav.version': '版本', 'nav.faq': '支持', 'nav.install': '安装指南', 'nav.cta': '立即下载',
    'hero.h1': 'DeepSeek Harness<br />桌面版，可靠的 <em>本地桌面应用</em>。',
    'hero.sub': '社区维护的可靠 Electron 壳，加上开箱即用支持。自带运行时、隔离数据、桌面入口和恢复路径；只增强桌面体验，不改写 Harness 行为。',
    'hero.cta': '下载桌面版',
    'hero.ctaMobile': '在电脑上下载',
    'hero.secondary': '先看定位与边界 →',
    'hero.meta': '无需 Node.js',
    'hero.preview': '本地运行时已就绪',
    'showcase.marker': '真实界面', 'showcase.title': '整体特色，直接看真实界面',
    'showcase.lead': '从官方 Harness 工作区，到桌面壳的设置、主题与扩展入口：你看到的就是实际运行界面，不是概念图。',
    'showcase.auto': '每 6 秒自动切换 · 悬停或聚焦暂停', 'showcase.themes': '浅色 / 深色',
    'showcase.zoom': '点击查看完整截图', 'showcase.lightboxTitle': '完整截图',
    'showcase.lightboxClose': '关闭完整截图', 'showcase.lightboxOpenOriginal': '在新标签页打开原图 ↗',
    'showcase.lightboxHint': '截图保持完整比例；需要像素级细节时，可打开原图。',
    'showcase.s1.title': '官方 Harness 工作区',
    'showcase.s1.body': '桌面壳负责把官方 Harness 带到窗口、托盘和快捷键里；会话、Agent、工具和模型仍然保持上游体验。',
    'showcase.s1.items': '<li>内置运行时，安装后直接启动</li><li>原生窗口与 Harness WebUI 同屏工作</li><li>浅色 / 深色主题跟随站点与应用设置</li>',
    'showcase.s1.caption': '真实截图 · Harness 主界面',
    'showcase.s2.title': '扩展面板与始终可达的恢复入口',
    'showcase.s2.body': '窗口菜单隐藏时，右上角的扩展入口仍然清晰可见：配对设备、进入安全模式、重启 Harness 和查看关于信息，都留在同一个桌面壳入口。',
    'showcase.s2.items': '<li>扩展面板显示当前 Harness 运行状态</li><li>配对、Safe Mode、重启与 About 集中可达</li><li>窗口右键与系统托盘继续提供备用入口</li>',
    'showcase.s2.caption': '真实截图 · 扩展控制面板',
    'showcase.s3.title': '桌面偏好与主题设置',
    'showcase.s3.body': '设置页把语言、主题、权限和输入行为放在一个清晰入口：桌面壳保持轻量，Harness 仍然负责 Agent、会话与插件配置。',
    'showcase.s3.items': '<li>浅色、深色或跟随系统</li><li>语言、权限与繁忙时 Enter 行为可见可调</li><li>社区插件不随安装包提供，按需手动安装</li>',
    'showcase.s3.caption': '真实截图 · 通用设置页',
    'showcase.note': '截图来自真实应用构建；主界面和设置页按官网明暗主题同步切换，扩展面板保留真实浅色截图。点击任意截图可查看完整内容。',
    'hero.downloads': '↓{n}次下载 · GitHub + GitCode',
    'trust.local': 'Loopback 本地运行', 'trust.isolated': '默认独立数据目录',
    'trust.guarded': '沙箱与权限默认收敛', 'trust.verifiable': '公开 CI 与真实应用测试',
    'wf.marker': '产品定位', 'wf.title': '只把 Harness 带到桌面，不另做一套产品',
    'wf.lead': 'dsh-desktop 解决安装、启动、恢复和日常桌面入口的问题；Agent、会话、工具和模型仍由官方 Harness WebUI 负责。',
    'wf.s1.title': '开箱即用', 'wf.s1.body': '自带锁定版本的 Node.js 与依赖闭包，下载安装包后即可启动，不要求全局环境。',
    'wf.s2.title': '本地且隔离', 'wf.s2.body': 'Harness 只监听 loopback，默认使用 ~/.dsh-desktop，不碰命令行的 ~/.dsh。',
    'wf.s3.title': '出错可恢复', 'wf.s3.body': '托盘状态、重启、Safe Mode、内核回滚和本地诊断，让问题有下一步。',
    'wf.adds.label': '桌面壳负责', 'wf.keeps.label': 'Harness 继续负责',
    'wf.adds': '<li>原生窗口、托盘、单实例与全局唤起快捷键</li><li>运行时封装、进程守护、状态通知与启动偏好</li><li>Safe Mode、日志、诊断和更新恢复路径</li><li>Electron 沙箱与导航、权限边界</li>',
    'wf.keeps': '<li>Agent、会话、工具调用和模型行为</li><li>官方 WebUI 的交互与上游依赖闭包</li><li>账户、API Key 和社区插件配置</li><li>不新增工作台、独立聊天或项目工作区</li>',
    'ext.marker': '扩展功能',
    'ext.title': '扫码，把 Harness 带到手机或平板',
    'ext.body': '桌面端从扩展菜单启动独立的局域网 Web 代理。Harness 继续只监听 loopback，手机浏览器通过一次性配对码获得设备会话。',
    'ext.steps': '<li>扩展 → 通过局域网连接手机 / 平板</li><li>手机与电脑连接同一局域网，扫描二维码</li><li>确认一次性配对码，进入原生 Harness Web 界面</li>',
    'ext.note': '只集成 Web 壳，不需要 Android/iOS；代理与桌面端解耦，可独立产出 Web artifact。',
    'notify.marker': '桌面通知',
    'notify.title': '任务完成或需要你确认时，通知你一声',
    'notify.body': '窗口未聚焦或收进托盘时，桌面状态通知提示会话完成、失败、停止，或等待你的确认。只使用 Harness 已公开的会话与后台任务状态，点击通知即可唤回工作区。',
    'notify.steps': '<li>窗口未聚焦或隐藏在托盘时弹出系统通知</li><li>点击通知，直接显示并聚焦 dsh-desktop 窗口</li><li>在设置 → 扩展设置中随时关闭；配置只保存在本机</li>',
    'notify.note': '不读取屏幕、不做视觉识别、不上传数据；首次状态只建立基线，启动时不制造无用提醒。',
    'safe.marker': '故障自愈',
    'safe.title': '插件装坏了？安全模式帮你隔离，再精准定位',
    'safe.body': '第三方插件启动失败会让 Harness 无法启动。安全模式下只运行官方与内置扩展，恢复入口按图索骥：错误页一键进入、横幅点明疑似插件与包名，修复后退出即可。',
    'safe.steps': '<li>错误页「以安全模式启动」，或从 ⋮ 扩展入口 / 扩展设置进入</li><li>官方与内置扩展照常运行，第三方插件被隔离</li><li>按横幅或诊断报告里的疑似插件，到官方「设置 → 插件」卸载</li>',
    'safe.note': '全程非破坏：不删除、不移动任何插件文件，也不上传任何数据；诊断报告仅在本机生成。',
    'dl.marker': '下载', 'dl.title': '选择你的平台',
    'dl.lead': '支持 macOS、Windows 和 Linux；具体以当前版本可用安装包为准。GitCode 镜像可用时与 GitHub 并列展示。',
    'dl.total.note': '含历史版本，GitHub + GitCode 官网引导',
    'dl.platformTotal': '↓ {n}',
    'dl.released': '发布于 {d}',
    'dl.new': 'NEW',
    'toast.title': '下载已开始 ✓',
    'toast.firstOpenMac': '首次打开如遇「无法验证开发者」：<b>右键点击 → 打开</b>',
    'toast.firstOpenWin': '如遇 SmartScreen 蓝色提示：<b>更多信息 → 仍要运行</b>',
    'toast.firstOpenLinux': 'DEB 双击安装即可，首次打开直接使用',
    'toast.star': '觉得好用？去 GitHub 点个 Star 支持一下 →',
    'toast.close': '关闭',
    'dl.fallback': '版本数据加载失败时，可直接前往 <a href="https://github.com/citrusli2026/dsh-desktop/releases" target="_blank" rel="noopener">GitHub Releases</a> 或 <a href="https://gitcode.com/citrusli2026/dsh-desktop/releases" target="_blank" rel="noopener">GitCode 镜像</a> 下载。',
    'dl.note': '命令行方式同样可用；桌面壳功能与其完全一致，但使用独立数据目录 <code>~/.dsh-desktop</code>，互不干扰。',
    'qs.marker': '快速开始', 'qs.title': '三步开始使用',
    'qs.s1.t': '下载并安装', 'qs.s1.b': '选择你的系统，下载安装包并完成安装。',
    'qs.s2.t': '获取 API Key', 'qs.s2.b': '在 DeepSeek 开放平台注册账号，创建 API Key（按量计费，需先充值）。',
    'qs.s2.a': '打开 DeepSeek 开放平台 →',
    'qs.s3.t': '粘贴 Key，开始对话', 'qs.s3.b': '打开 dsh-desktop，在设置中粘贴 Key，即可开始使用。社区插件以后仍按需手动安装。',
    'latest.marker': '当前版本重点', 'latest.title': '把可靠性做成用户看得懂的路径',
    'latest.lead': '最新发布线继续围绕桌面壳收口，不增加第二套 Agent 产品。',
    'latest.items': '<li><b>状态更清楚：</b>启动、等待 Harness、自动重试、运行中与恢复暂停都有明确阶段；桌面入口、托盘和设置保持一致。</li><li><b>恢复更直接：</b>启动失败可重试、进入 Safe Mode、查看日志或导出本地诊断报告。</li><li><b>插件更克制：</b>安装包不含社区插件；dsh-market 和其他插件都由用户手动选择安装。</li><li><b>更新更安全：</b>内核切换经过健康启动检查，失败时恢复内置版本。</li>',
    'guide.mac.title': 'macOS 首次打开',
    'guide.mac.steps': '<ol><li>双击 <code>.dmg</code> 打开，把 dsh-desktop 拖入「应用程序」</li><li>如提示「无法验证开发者」：<b>右键点击</b> App 图标 → <b>打开</b> → 弹窗中再点 <b>打开</b></li><li>以后从启动台正常打开即可</li></ol>',
    'guide.win.title': 'Windows 首次打开',
    'guide.win.steps': '<ol><li>双击 <code>.exe</code> 启动安装向导</li><li>如出现 SmartScreen 蓝色提示：点 <b>更多信息</b> → <b>仍要运行</b></li><li>完成安装后从开始菜单启动</li></ol>',
    'guide.linux.title': 'Linux 安装与运行',
    'guide.linux.steps': '<ol><li>双击 <code>.deb</code> 即可安装（适用于 Debian/Ubuntu/UOS/Deepin/麒麟）</li><li>安装完成后从应用菜单启动 dsh-desktop</li><li>如需卸载，在系统软件中心中移除即可</li></ol>',
    'ft.marker': '桌面能力', 'ft.title': '你得到的是可靠入口，不是功能堆叠',
    'ft.group1.title': '开箱即用', 'ft.group1.body': '把最容易卡住的运行环境和数据边界处理好，下载后直接进入 Harness。',
    'ft.group2.title': '日常桌面体验', 'ft.group2.body': '窗口、托盘、快捷键和通知服务于同一个目标：随时找到并继续你的 Harness。',
    'ft.group3.title': '恢复与边界', 'ft.group3.body': '故障时给出可执行的下一步，同时把权限、数据和上游职责说清楚。',
    'ft.p1': '<h3>无需安装 Node.js</h3><p>壳内置 Node.js 22 LTS 运行时与 <code>@deepseek-ai/dsh</code> 完整依赖闭包，版本逐平台锁定。下载安装包 → 双击 → 使用，没有任何环境配置。</p>',
    'ft.p2': '<h3>独立数据目录，环境隔离</h3><p>桌面版默认使用 <code>~/.dsh-desktop</code>：设置、会话、API Key、插件都是独立的一份，安装卸载都不影响你的命令行工作流。需要共享时，设 <code>DSH_HOME=~/.dsh</code> 即可。</p>',
    'ft.p3': '<h3>原生菜单与 Harness 保持同一种语言</h3><p>首次启动按系统语言选择中文或英文；之后读取同一份 <code>locale.preference</code>，无需重启即可同步应用菜单、托盘、About、恢复页和对话框。主题也跟随 Harness 设置。</p>',
    'ft.p4': '<h3>持续守护与可靠更新</h3><p>崩溃后按预算退避重启，窗口关闭后可驻留托盘，也可从帮助菜单安全重启 Harness。Windows 保留应用内自动更新；未签名的 macOS 检查新版本并打开精确发布页。</p>',
    'ft.p5': '<h3>渲染层能力默认收敛</h3><p>保持 Electron 沙箱与上下文隔离、关闭 Node 集成并限制页面导航；媒体、定位、Web 通知、屏幕采集和文件系统等额外权限默认拒绝。桌面状态通知是独立的本地壳功能，不读取屏幕。</p>',
    'ft.p6': '<h3>问题发生时，带走一份可检查的报告</h3><p>帮助菜单、托盘和启动失败页都能导出本地诊断报告。报告包含版本、系统状态和有上限的日志尾部，自动遮罩常见密钥与主目录，且绝不自动上传。</p>',
    'ft.p7': '<h3>不用找窗口，快捷键直接唤回</h3><p>窗口收进托盘后，在任意应用中按自己的唤起快捷键即可显示并聚焦 dsh-desktop，默认是 <code>Ctrl + Shift + Space</code>。快捷键冲突时，托盘和右键入口仍然可用。</p>',
    'ft.p8': '<h3>桌面习惯由你决定</h3><p>在 Harness 设置 → 扩展设置中录入自己的唤起快捷键，选择是否开机启动、启动后隐藏，以及是否接收任务状态通知。配置只保存在本机；通知只在窗口未聚焦时提示。</p>',
    'nav.market': '插件市场',
    'mk.marker': '社区插件', 'mk.title': '数千个社区插件，全部由你选择',
    'mk.lead': 'dsh-desktop 只提供清晰入口和故障恢复支持；社区插件不属于安装包，也不会在首次启动时自动出现。',
    'mk.c1': '<h3>全部按需安装</h3><p>安装包不内置社区插件，也不会在首次启动自动安装。需要时先在 Harness「设置 → 扩展设置 → 插件市场」手动安装 dsh-market；安装后即可在「设置 → 插件市场」浏览并一键安装其他社区插件与主题。</p>',
    'mk.c2': '<h3>浏览与一键安装</h3><p>打开 Harness「设置 → 插件市场」，按分类浏览数千个社区插件与主题，点击即装、一键更新；插件均从公开目录安装，来源可查。</p>',
    'mk.c3': '<h3>装坏了也不怕</h3><p>需要编译的插件会先征求你的授权再执行构建脚本；万一插件把 Harness 搞挂，安全模式一键隔离第三方插件，扩展菜单里的「重启 Harness」随手刷新生效。</p>',
    'mk.note': '安装边界：先在「设置 → 扩展设置 → 插件市场」手动安装 dsh-market，再到 Harness「设置 → 插件市场」手动选择其他插件。',
    'theme.toggle': '切换明暗主题',
    'vr.marker': '版本号', 'vr.title': '版本号怎么读',
    'vr.core': '<b>内核版本</b> —— 内置的 <code>@deepseek-ai/dsh</code> 版本。每日工作流自动检查 npm 上游，有新版本就开升级 PR。',
    'vr.shell': '<b>壳修订号</b> —— 壳自身（窗口、守护、打包）的修订次数。同一内核可以有多次壳修订。',
    'faq.marker': '支持与边界', 'faq.title': '先恢复，再反馈；每一步都有入口',
    'support.install': '首次安装', 'support.installHint': '从下载到第一次启动',
    'support.recover': '问题恢复', 'support.recoverHint': '先看错误类型和下一步',
    'support.report': '提交反馈', 'support.reportHint': '附版本、平台和脱敏诊断',
    'faq.q1': 'macOS 提示“无法打开，因为无法验证开发者”？',
    'faq.a1': 'macOS 版未购买 Apple 开发者证书（决策记录 0004），首次启动请 <b>右键 → 打开</b>。如果仍没有放行选项，且你确认安装包来源可信，可在终端执行：<br><code class="faq-command">xattr -dr com.apple.quarantine "/Applications/dsh-desktop.app"</code><code class="faq-command">open "/Applications/dsh-desktop.app"</code>这会移除下载隔离标记，但不会添加 Apple 签名或公证。<br><br>安装包由公开 CI 构建，可用来源证明验证真伪：<br><code class="faq-command">gh attestation verify /path/to/dsh-desktop-{ver}-arm64-mac.dmg -R citrusli2026/dsh-desktop</code>',
    'faq.q2': 'Windows SmartScreen 拦截怎么办？',
    'faq.a2': '安装包未购买代码签名证书。点击 <b>“更多信息” → “仍要运行”</b> 即可。安装包由 GitHub Actions 从公开源码构建，可全程审计；也可用以下命令验证来源：<br><code class="faq-command">gh attestation verify /path/to/dsh-desktop-setup-{ver}.exe -R citrusli2026/dsh-desktop</code>',
    'faq.q3': '这和 DeepSeek 官方是什么关系？',
    'faq.a3': '社区维护的桌面封装：不改写 Harness 行为，数据与配置保持独立。项目与 DeepSeek AI 无隶属、授权或合作关系；DeepSeek Harness 是 DeepSeek 的商标，本仓库仅在 MIT 许可下再打包 <a href="https://www.npmjs.com/package/@deepseek-ai/dsh" target="_blank" rel="noopener">@deepseek-ai/dsh</a>。',
    'faq.q4': '我在用 npx @deepseek-ai/dsh web，配置会带过来吗？',
    'faq.a4': '不会——桌面版是独立环境，数据放在 <code>~/.dsh-desktop</code>，与 CLI 的 <code>~/.dsh</code> 互不影响（决策记录 0012）。想沿用 CLI 配置，启动前设 <code>DSH_HOME=~/.dsh</code> 即可。',
    'faq.q5': 'Apple Silicon 以外的 Mac 可以用吗？',
    'faq.a5': '当前仅提供 Apple Silicon（arm64）安装包。Intel Mac 可暂时使用命令行方式 <code>npx @deepseek-ai/dsh web</code>，功能完全一致。',
    'faq.q6': '桌面版会申请摄像头、定位或文件系统权限吗？',
    'faq.a6': '不会。当前功能不需要这些 Electron Web 权限，渲染层默认拒绝媒体、定位、Web 通知、采集和文件系统等额外请求；桌面状态通知是可关闭的本地壳功能，不读取屏幕，也不上传。未来如确有需要，必须经过明确的白名单审查。',
    'faq.q7': '桌面菜单为什么是中文或英文？',
    'faq.a7': '首次启动跟随电脑系统语言；不支持的系统语言默认使用英文。之后在 Harness 中切换语言，应用菜单、托盘和 Shell 对话框会读取同一设置并实时同步。',
    'faq.q8': '如何校验下载文件的完整性？',
    'faq.a8': '每个安装包都附带同名的 <code>.sha256</code> 校验文件。下载后可用以下命令验证：<br><code class="faq-command">shasum -a 256 -c dsh-desktop-{ver}-arm64-mac.dmg.sha256</code><br>Windows 用户可用：<br><code class="faq-command">CertUtil -hashfile dsh-desktop-setup-{ver}.exe SHA256</code><br>Linux 用户可用：<br><code class="faq-command">sha256sum -c dsh-desktop-{ver}-amd64.deb.sha256</code><br>校验值应与 <code>.sha256</code> 文件内容一致。也可使用 <code>npx dsh-validate-release</code> 自动校验整个 Release 目录。',
    'faq.q9': '如何获取 DeepSeek API Key？',
    'faq.a9': '三步即可：<br>1）打开 <a href="https://platform.deepseek.com" target="_blank" rel="noopener">DeepSeek 开放平台</a> 注册账号；<br>2）登录后进入「API Keys」页面，点「创建 API Key」，复制生成的 <code>sk-</code> 开头的密钥；<br>3）打开 dsh-desktop，在设置中把 Key 粘贴进去即可开始对话。<br>注意：DeepSeek API 按用量计费，首次使用前需要先充值（平台内最低充值金额即可），充值后立即可用。',
    'faq.q10': '客户端带插件吗？怎么装更多插件？',
    'faq.a10': 'dsh-desktop 安装包不内置社区插件，所有插件都需要用户手动安装。首次启动后，在 <b>设置 → 扩展设置 → 插件市场</b> 手动安装 dsh-market；装好后打开 Harness「设置 → 插件市场」，即可浏览并一键安装数千个社区插件与主题。安全模式会隔离所有第三方插件。',
    'faq.q11': 'GitHub 下载慢或连不上怎么办？',
    'faq.a11': '国内网络可优先使用 <a href="https://gitcode.com/citrusli2026/dsh-desktop/releases" target="_blank" rel="noopener">GitCode 镜像</a>（中文界面自动排在 GitHub 前面；镜像不可用时自动只显示 GitHub）。如仍需走 GitHub，可在下载链接前加社区代理前缀，例如：<br><code class="faq-command">https://ghproxy.net/https://github.com/citrusli2026/dsh-desktop/releases/download/…</code>公开代理（ghproxy.net / gh-proxy.com / ghfast.top）均为第三方免费服务，可用性不保证，一个不行就换另一个。',
    'faq.q12': '可以修改唤起快捷键或设置开机启动吗？',
    'faq.a12': '可以。在 dsh-desktop 的「设置 → 扩展设置」中点击「重新设置」，按下包含修饰键的组合键（例如 <code>Ctrl + Alt + K</code>）。如果组合键已被其他程序占用，页面会提示更换；开机启动默认关闭，Windows/macOS 可分别选择是否启动后隐藏到托盘。Linux 当前不提供开机启动开关。',
    'faq.q13': '桌面通知会读取屏幕或上传数据吗？',
    'faq.a13': '不会。通知只使用 Harness 已公开的会话运行态和后台任务状态，不读取截图、也不会上传数据。它只在窗口未聚焦时提示完成、失败或需要确认，可在「设置 → 扩展设置」关闭。另外有一个<b>默认关闭</b>的「屏幕捕获」：开启后 Agent 才能用 screen_capture 工具截取屏幕，且截图总是作为附件进入会话、发给你选择的视觉模型；不开启就完全没有这个能力。',
    'faq.q14': '启动失败或插件装坏了怎么办？',
    'faq.a14': '错误页提供「再次启动」「以安全模式启动」「打开日志目录」「导出诊断报告」。安全模式只保留官方与内置扩展，并隔离用户插件，不删除或移动插件文件；处理完成后请显式退出安全模式，再按需重试。',
    'footer.legal': 'MIT © 2026 dsh-desktop contributors<br />与 DeepSeek AI 无隶属、授权或合作关系',
    'footer.english': 'English',
    'footer.official': 'DeepSeek官网',
    'footer.mirror': 'GitCode 镜像', 'footer.releases': '全部版本', 'footer.issues': '问题反馈',
    'footer.sync': '纯静态站点 · 部署于 Vercel<br />版本数据由 GitHub Actions 自动同步',
    'footer.top': '回到顶部',
    'copy': '复制', 'copy.link': '复制链接', 'copied': '已复制 ✓',
  },
  en: {
    'a11y.skip': 'Skip to main content',
    'a11y.menuOpen': 'Open menu', 'a11y.menuClose': 'Close menu',
    'brand.community': 'COMMUNITY EDITION',
    'nav.workflow': 'SCOPE', 'nav.showcase': 'SHOWCASE', 'nav.features': 'CAPABILITIES', 'nav.version': 'VERSION', 'nav.faq': 'SUPPORT', 'nav.install': 'INSTALL GUIDE', 'nav.cta': 'Download',
    'hero.h1': 'DeepSeek Harness<br />as a dependable <em>local desktop app</em>.',
    'hero.sub': 'A community-maintained Electron shell with out-of-the-box support. Bundled runtime, isolated data, desktop entry points, and recovery paths — without changing how Harness works.',
    'hero.cta': 'Download for Desktop',
    'hero.ctaMobile': 'Download on your computer',
    'hero.secondary': 'See the scope and boundary →',
    'hero.meta': 'NO NODE.JS REQUIRED',
    'hero.preview': 'Local runtime ready',
    'showcase.marker': 'REAL UI', 'showcase.title': 'See the whole shell in real screenshots.',
    'showcase.lead': 'From the official Harness workspace to desktop preferences, themes, and extension entry points: these are real application captures, not concept mockups.',
    'showcase.auto': 'Auto-advances every 6 seconds · pauses on hover or focus', 'showcase.themes': 'LIGHT / DARK',
    'showcase.zoom': 'Click to view the full screenshot', 'showcase.lightboxTitle': 'Full screenshot',
    'showcase.lightboxClose': 'Close full screenshot', 'showcase.lightboxOpenOriginal': 'Open original in a new tab ↗',
    'showcase.lightboxHint': 'The screenshot keeps its full aspect ratio; open the original when you need native-pixel detail.',
    'showcase.s1.title': 'Official Harness workspace',
    'showcase.s1.body': 'The shell brings the official Harness into a native window, tray, and shortcut flow while sessions, agents, tools, and models stay upstream.',
    'showcase.s1.items': '<li>Bundled runtime, ready after install</li><li>Native window around the Harness WebUI</li><li>Light and dark screenshots follow the selected site theme</li>',
    'showcase.s1.caption': 'Real capture · Harness workspace',
    'showcase.s2.title': 'Extensions panel with recovery always in reach',
    'showcase.s2.body': 'When the window menu is hidden, the extensions entry stays visible: pair a device, start Safe Mode, restart Harness, or open About from one dependable shell control.',
    'showcase.s2.items': '<li>Current Harness runtime status stays visible</li><li>Pairing, Safe Mode, restart, and About in one panel</li><li>Window context menu and system tray remain fallback routes</li>',
    'showcase.s2.caption': 'Real capture · extensions control panel',
    'showcase.s3.title': 'Desktop preferences and theme settings',
    'showcase.s3.body': 'Language, theme, permissions, and input behavior live in one clear settings surface: the shell stays small while Harness remains responsible for agents, sessions, and plugins.',
    'showcase.s3.items': '<li>Light, dark, or follow system</li><li>Language, permissions, and busy-state Enter behavior are explicit</li><li>Community plugins are manual and never part of the installer</li>',
    'showcase.s3.caption': 'Real capture · general settings',
    'showcase.note': 'Captured from real application builds. The workspace and settings follow the site theme; the extensions panel remains a real light capture. Click any screenshot to view it in full.',
    'hero.downloads': '↓{n} downloads · GitHub + GitCode',
    'trust.local': 'Loopback-only runtime', 'trust.isolated': 'Isolated data by default',
    'trust.guarded': 'Sandboxed, constrained by default', 'trust.verifiable': 'Public CI and real-app tests',
    'wf.marker': 'SCOPE', 'wf.title': 'Bring Harness to the desktop. Do not make a second product.',
    'wf.lead': 'dsh-desktop handles installation, startup, recovery, and desktop entry points; the official Harness WebUI still owns agents, sessions, tools, and models.',
    'wf.s1.title': 'Ready out of the box', 'wf.s1.body': 'A pinned Node.js runtime and dependency closure are included. Download the installer and launch — no global setup.',
    'wf.s2.title': 'Local and isolated', 'wf.s2.body': 'Harness listens on loopback and defaults to ~/.dsh-desktop, leaving the CLI home at ~/.dsh alone.',
    'wf.s3.title': 'Recoverable by design', 'wf.s3.body': 'Tray status, restart, Safe Mode, kernel rollback, and local diagnostics give every failure a next step.',
    'wf.adds.label': 'THE DESKTOP SHELL OWNS', 'wf.keeps.label': 'HARNESS STILL OWNS',
    'wf.adds': '<li>Native window, tray, single instance, and global summon shortcut</li><li>Runtime packaging, supervision, notices, and startup preferences</li><li>Safe Mode, logs, diagnostics, and update recovery paths</li><li>Electron sandbox, navigation, and permission boundaries</li>',
    'wf.keeps': '<li>Agent, session, tool-call, and model behavior</li><li>The official WebUI and upstream dependency closure</li><li>Account, API key, and community plugin configuration</li><li>No second workbench, chat surface, or project workspace</li>',
    'ext.marker': 'EXTENSION',
    'ext.title': 'Scan once. Bring Harness to a phone or tablet.',
    'ext.body': 'The desktop shell starts an isolated LAN Web proxy from the Extensions menu. Harness stays loopback-only while a browser exchanges a one-time pairing code for a device session.',
    'ext.steps': '<li>Extensions → Connect a mobile device over LAN</li><li>Put the phone and computer on the same LAN, then scan</li><li>Confirm the one-time code and enter the original Harness Web UI</li>',
    'ext.note': 'Web shell only: no Android/iOS dependency. The proxy is decoupled from Electron and can ship as an independent Web artifact.',
    'notify.marker': 'DESKTOP NOTIFICATIONS',
    'notify.title': 'Finished, failed, or waiting on you — you will know.',
    'notify.body': 'While the window is unfocused or tucked into the tray, desktop status notices report running sessions completing, failing, stopping, or waiting for your confirmation. They use only the public Harness session and background-job state; click a notice to summon the desktop app back.',
    'notify.steps': '<li>System notices appear while the window is unfocused or hidden in the tray</li><li>Click a notice to show and focus the dsh-desktop window</li><li>Turn them off any time in Settings → Extensions; preferences stay on this device</li>',
    'notify.note': 'Notices never read the screen, never do visual recognition, and never upload data; the first report only builds a baseline, so nothing fires at startup.',
    'safe.marker': 'Self-recovery',
    'safe.title': 'A broken plugin? Safe Mode quarantines it and names the culprit',
    'safe.body': 'A failing third-party plugin can stop Harness from booting. Safe Mode runs only official and built-in extensions — one click from the error page — while the banner and diagnostic report name the suspected plugin and package so you can uninstall it from the official Settings → Plugins manager.',
    'safe.steps': '<li>"Start in Safe Mode" on the error page, or enter it from the ⋮ panel / Extensions settings</li><li>Official and built-in extensions keep running; third-party plugins are quarantined</li><li>Uninstall the suspected plugin named in the banner or diagnostic report via Settings → Plugins</li>',
    'safe.note': 'Non-destructive throughout: no plugin file is deleted or moved, nothing is uploaded; diagnostics stay on this machine.',
    'dl.marker': 'DOWNLOAD', 'dl.title': 'Pick your platform',
    'dl.lead': 'Supports macOS, Windows, and Linux; see the current release list for available installers. A verified GitCode mirror appears alongside GitHub when available.',
    'dl.total.note': 'Includes past releases; GitHub + GitCode site guidance',
    'dl.platformTotal': '↓ {n}',
    'dl.released': 'released {d}',
    'dl.new': 'NEW',
    'toast.title': 'Download started ✓',
    'toast.firstOpenMac': 'If macOS says "cannot be verified": <b>right-click → Open</b>',
    'toast.firstOpenWin': 'If SmartScreen prompts: <b>More info → Run anyway</b>',
    'toast.firstOpenLinux': 'DEB installs on double-click; just open it after installing',
    'toast.star': 'Enjoying it? Star us on GitHub →',
    'toast.close': 'Close',
    'dl.fallback': 'If live data fails to load, head to <a href="https://github.com/citrusli2026/dsh-desktop/releases" target="_blank" rel="noopener">GitHub Releases</a> or the <a href="https://gitcode.com/citrusli2026/dsh-desktop/releases" target="_blank" rel="noopener">GitCode mirror</a>.',
    'dl.note': 'The CLI route works too; the shell is functionally identical but keeps its own data home at <code>~/.dsh-desktop</code> — no interference either way.',
    'qs.marker': 'QUICK START', 'qs.title': 'Start in three steps',
    'qs.s1.t': 'Download and install', 'qs.s1.b': 'Pick your OS, download the installer, and install it.',
    'qs.s2.t': 'Get an API key', 'qs.s2.b': 'Register on the DeepSeek open platform and create an API key (usage-based billing; a small top-up is required).',
    'qs.s2.a': 'Open DeepSeek open platform →',
    'qs.s3.t': 'Paste the key and start', 'qs.s3.b': 'Open dsh-desktop, paste the key in settings, and start using Harness. Community plugins remain opt-in.',
    'latest.marker': 'CURRENT RELEASE FOCUS', 'latest.title': 'Reliability you can see and act on',
    'latest.lead': 'The current release line closes the desktop shell loop without adding a second Agent product.',
    'latest.items': '<li><b>Clearer state:</b> launching, waiting for Harness, automatic retry, running, and recovery-paused stages are explicit; desktop entry, tray, and settings agree.</li><li><b>Direct recovery:</b> retry startup, enter Safe Mode, open logs, or export a local diagnostic report.</li><li><b>Explicit plugins:</b> the installer contains no community plugins; dsh-market and every plugin are user-installed.</li><li><b>Safer updates:</b> kernel switches use a health boot check and return to the bundled version when needed.</li>',
    'guide.mac.title': 'First launch on macOS',
    'guide.mac.steps': '<ol><li>Open the <code>.dmg</code> and drag dsh-desktop into Applications</li><li>If you see "cannot be verified": <b>right-click</b> the app icon → <b>Open</b> → click <b>Open</b> again in the dialog</li><li>Launch normally from Launchpad afterwards</li></ol>',
    'guide.win.title': 'First launch on Windows',
    'guide.win.steps': '<ol><li>Double-click the <code>.exe</code> to start the installer</li><li>If SmartScreen shows a blue prompt: click <b>More info</b> → <b>Run anyway</b></li><li>Launch from the Start menu after install</li></ol>',
    'guide.linux.title': 'Install & run on Linux',
    'guide.linux.steps': '<ol><li>Double-click the <code>.deb</code> to install (Debian/Ubuntu/UOS/Deepin/Kylin)</li><li>Launch dsh-desktop from the app menu after installing</li><li>To uninstall, remove it from the system software center</li></ol>',
    'ft.marker': 'CAPABILITIES', 'ft.title': 'A dependable entry point, not a feature pile',
    'ft.group1.title': 'Out of the box', 'ft.group1.body': 'The runtime and data boundary are handled so a fresh download can get straight to Harness.',
    'ft.group2.title': 'Daily desktop use', 'ft.group2.body': 'Window, tray, shortcut, and notices serve one goal: find Harness quickly and keep going.',
    'ft.group3.title': 'Recovery and boundaries', 'ft.group3.body': 'When something fails, the shell gives you an action while keeping permissions, data, and upstream ownership clear.',
    'ft.p1': '<h3>No Node.js install required</h3><p>The shell bundles a pinned Node.js 22 LTS runtime and the complete <code>@deepseek-ai/dsh</code> dependency closure, pinned per platform. Download → double-click → use.</p>',
    'ft.p2': '<h3>Isolated data home</h3><p>The desktop app defaults to <code>~/.dsh-desktop</code>: settings, sessions, API keys, and plugins are its own copy — installing or uninstalling never touches your CLI workflow. Set <code>DSH_HOME=~/.dsh</code> to share again.</p>',
    'ft.p3': '<h3>Native chrome in the same language as Harness</h3><p>First launch follows the operating-system language. Afterwards the shell reads the same <code>locale.preference</code>, live-syncing the app menu, tray, About, recovery pages, and dialogs without a restart. Theme follows Harness too.</p>',
    'ft.p4': '<h3>Continuous supervision and reliable updates</h3><p>Budgeted backoff after crashes, close-to-tray behavior, and a safe Harness restart from Help. Windows keeps in-place automatic updates; unsigned macOS checks for updates and opens the exact release page.</p>',
    'ft.p5': '<h3>Renderer capabilities stay constrained</h3><p>Electron sandboxing and context isolation stay on, Node integration stays off, and navigation is guarded. Media, location, Web notification, capture, and filesystem permissions are denied by default. Desktop status notices are a separate local shell feature and never read the screen.</p>',
    'ft.p6': '<h3>Take an inspectable report when something breaks</h3><p>Export a local diagnostic report from Help, the tray, or the startup error page. It includes versions, system state, and a bounded log tail, masks common secrets and the home path, and is never uploaded automatically.</p>',
    'ft.p7': '<h3>Return without hunting for the window</h3><p>After hiding dsh-desktop to the tray, press your summon shortcut from any app to show and focus it. It defaults to <code>Ctrl/Cmd + Shift + Space</code>; the tray and context menu remain available if the shortcut is occupied.</p>',
    'ft.p8': '<h3>Your desktop habits, your choice</h3><p>In Settings → Extensions, record a summon shortcut, choose whether to launch at login and start hidden, and control desktop status notices. Preferences stay on this device; notices appear only while the window is unfocused.</p>',
    'nav.market': 'PLUGIN MARKET',
    'mk.marker': 'COMMUNITY PLUGINS', 'mk.title': 'Thousands of community plugins. You choose every one.',
    'mk.lead': 'dsh-desktop provides a clear entry point and recovery support; community plugins are not part of the installer and never appear silently on first launch.',
    'mk.c1': '<h3>Install only what you choose</h3><p>Community plugins are not bundled or auto-installed. First install dsh-market manually from Settings → Extensions → Plugin market; then use Settings → Plugin Market to browse and one-click install the community plugins and themes you want.</p>',
    'mk.c2': '<h3>Browse and one-click install</h3><p>Open Settings → Plugin Market in Harness to browse thousands of community plugins and themes by category — click to install, update in one click; everything comes from a public catalog with checkable sources.</p>',
    'mk.c3': '<h3>Safe to experiment</h3><p>Plugins that need build scripts ask for your approval first. If one ever breaks Harness, Safe Mode quarantines third-party plugins, and Restart Harness in the extension menus refreshes everything in a click.</p>',
    'mk.note': 'Boundary: manually install dsh-market from Settings → Extensions → Plugin market, then manually choose other plugins from Harness Settings → Plugin Market.',
    'theme.toggle': 'Toggle light/dark theme',
    'vr.marker': 'VERSIONING', 'vr.title': 'Reading the version',
    'vr.core': '<b>Kernel version</b> — the bundled <code>@deepseek-ai/dsh</code> release. A daily workflow checks upstream npm and files an upgrade PR automatically.',
    'vr.shell': '<b>Shell revision</b> — how many times the shell itself (window, supervision, packaging) has been revised on this kernel.',
    'faq.marker': 'SUPPORT & BOUNDARIES', 'faq.title': 'Recover first, then report — every step has an entry point',
    'support.install': 'First install', 'support.installHint': 'From download to first launch',
    'support.recover': 'Recover a problem', 'support.recoverHint': 'Identify the type and next action',
    'support.report': 'Report an issue', 'support.reportHint': 'Include version, OS, and redacted diagnostics',
    'faq.q1': 'macOS says "cannot be opened because the developer cannot be verified"?',
    'faq.a1': 'The macOS build is unsigned (decision 0004). <b>Right-click → Open</b> on first launch. If no override is offered and you trust the installer source, run:<br><code class="faq-command">xattr -dr com.apple.quarantine "/Applications/dsh-desktop.app"</code><code class="faq-command">open "/Applications/dsh-desktop.app"</code>This removes the download-quarantine marker, but does not add an Apple signature or notarization.<br><br>Builds come from public CI; verify provenance with:<br><code class="faq-command">gh attestation verify /path/to/dsh-desktop-&lt;version&gt;-arm64-mac.dmg -R citrusli2026/dsh-desktop</code>',
    'faq.q2': 'Windows SmartScreen blocks the installer?',
    'faq.a2': 'The installer is unsigned. Choose <b>"More info" → "Run anyway"</b>. Builds are produced by GitHub Actions from public source — fully auditable. You can also verify provenance:<br><code class="faq-command">gh attestation verify /path/to/dsh-desktop-setup-&lt;version&gt;.exe -R citrusli2026/dsh-desktop</code>',
    'faq.q3': 'Is this affiliated with DeepSeek?',
    'faq.a3': 'Community-maintained desktop packaging: Harness behavior is unchanged and its data and configuration stay independent. This project has no affiliation, authorization, or partnership with DeepSeek AI; DeepSeek Harness is a DeepSeek trademark, and this repo only repackages <a href="https://www.npmjs.com/package/@deepseek-ai/dsh" target="_blank" rel="noopener">@deepseek-ai/dsh</a> under MIT.',
    'faq.q4': 'I use npx @deepseek-ai/dsh web — will my config carry over?',
    'faq.a4': 'No — the desktop app is an isolated environment storing data in <code>~/.dsh-desktop</code>, separate from the CLI\'s <code>~/.dsh</code> (decision 0012). To reuse your CLI setup, start it with <code>DSH_HOME=~/.dsh</code>.',
    'faq.q5': 'Macs beyond Apple Silicon?',
    'faq.a5': 'Only Apple Silicon (arm64) builds are provided for now. Intel Macs can use <code>npx @deepseek-ai/dsh web</code> — functionally identical.',
    'faq.q6': 'Does the desktop app request camera, location, or filesystem access?',
    'faq.a6': 'No. Current features need none of those Electron web permissions, so media, location, Web notifications, capture, and filesystem requests are denied by default. Desktop status notices are an optional local shell feature; they do not read the screen or upload data. Any future exception requires an explicit, reviewed allowlist.',
    'faq.q7': 'Why are desktop menus in Chinese or English?',
    'faq.a7': 'First launch follows the computer language; unsupported languages fall back to English. Change the language inside Harness afterwards and the app menu, tray, and shell dialogs live-sync from the same setting.',
    'faq.q8': 'How do I verify the integrity of downloaded files?',
    'faq.a8': 'Each installer ships with a matching <code>.sha256</code> checksum file. After downloading, verify with:<br><code class="faq-command">shasum -a 256 -c dsh-desktop-&lt;version&gt;-arm64-mac.dmg.sha256</code><br>On Windows:<br><code class="faq-command">CertUtil -hashfile dsh-desktop-setup-&lt;version&gt;.exe SHA256</code><br>On Linux:<br><code class="faq-command">sha256sum -c dsh-desktop-&lt;version&gt;-amd64.deb.sha256</code><br>The computed hash should match the contents of the <code>.sha256</code> file. You can also use <code>npx dsh-validate-release</code> to automatically validate an entire release directory.',
    'faq.q9': 'How do I get a DeepSeek API key?',
    'faq.a9': 'Three steps:<br>1) Open <a href="https://platform.deepseek.com" target="_blank" rel="noopener">the DeepSeek open platform</a> and register an account;<br>2) Go to "API Keys", click "Create API Key", and copy the generated <code>sk-</code> key;<br>3) Open dsh-desktop, paste the key into settings, and start chatting.<br>Note: the DeepSeek API is usage-based; top up your account before first use and you are good to go.',
    'faq.q10': 'Does the app ship plugins? How do I install more?',
    'faq.a10': 'Community plugins are not bundled or auto-installed in dsh-desktop; every plugin is installed manually by the user. After first launch, install dsh-market from <b>Settings → Extensions → Plugin market</b>. Then open Harness <b>Settings → Plugin Market</b> to browse and one-click-install thousands of community plugins and themes; Safe Mode quarantines all third-party plugins.',
    'faq.q11': 'GitHub is slow or unreachable — is there a mirror?',
    'faq.a11': 'Prefer the <a href="https://gitcode.com/citrusli2026/dsh-desktop/releases" target="_blank" rel="noopener">GitCode mirror</a> (listed first in the Chinese interface when verified; it disappears automatically when unavailable). Community proxy prefixes such as <code>https://ghproxy.net/</code> in front of the download URL can help for GitHub itself, but they are third-party, free, and unaffiliated — availability is not guaranteed; try another if one fails.',
    'faq.q12': 'Can I change the summon shortcut or launch at login?',
    'faq.a12': 'Yes. In dsh-desktop, open Settings → Extensions, choose Change shortcut, and press a combination with a modifier such as <code>Ctrl + Alt + K</code>. If another app already owns it, the setting reports a conflict. Launch at login is off by default; Windows and macOS can also start hidden in the tray. Linux does not currently expose a launch-at-login switch.',
    'faq.q13': 'Do desktop notices read my screen or upload data?',
    'faq.a13': 'No. Notices use only Harness public session and background-job state. They do not read your screen or upload data. They appear only while the window is unfocused and can be disabled in Settings → Extensions. There is also a <b>default-off</b> Screen capture: only when you enable it can the agent use the screen_capture tool, and screenshots always enter the conversation as attachments sent to the vision model you selected.',
    'faq.q14': 'What if startup fails or a plugin breaks the app?',
    'faq.a14': 'The error page offers Retry, Start in Safe Mode, Open logs, and Export diagnostics. Safe Mode keeps official and bundled extensions, isolates user plugins, and does not delete or move plugin files. Exit Safe Mode explicitly after handling the suspected plugin, then retry as needed.',
    'footer.legal': 'MIT © 2026 dsh-desktop contributors<br />No affiliation, authorization, or partnership with DeepSeek AI',
    'footer.english': 'English',
    'footer.official': 'DeepSeek homepage',
    'footer.mirror': 'GitCode mirror', 'footer.releases': 'All releases', 'footer.issues': 'Issues',
    'footer.sync': 'Static site · deployed on Vercel<br />Release data auto-synced by GitHub Actions',
    'footer.top': 'Back to top',
    'copy': 'COPY', 'copy.link': 'COPY LINK', 'copied': 'COPIED ✓',
  },
}

/* ══ 资产分类 (与 scripts/release-shape.mjs 语义一致) ══ */
export function platformOf(name) {
  if (/arm64-mac\.dmg$/.test(name)) return { os: 'mac', primary: true, fmt: 'dmg' }
  if (/setup-.*\.exe$/.test(name)) return { os: 'win', primary: true, fmt: 'exe' }
  if (/\.deb$/.test(name)) return { os: 'linux', primary: true, fmt: 'deb' }
  return null
}

export function publicKind(name) {
  if (platformOf(name)) return 'installer'
  if (platformOf(name.replace(/\.sha256$/, '')) && name.endsWith('.sha256')) return 'checksum'
  return null
}

/* ══ 复合版本拆分 (docs/decisions/0009) ══ */
export function splitCompositeTag(tag) {
  var ver = String(tag).replace(/^v/, '')
  var m = ver.match(/^(.*)\.(shell\.\d+)$/)
  if (!m) return null
  return { core: m[1], shell: m[2] }
}

/* ══ 格式化 ══ */
export function fmtSize(bytes) {
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB'
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return bytes + ' B'
}

export function fmtNum(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

export function fmtDate(iso) {
  var d = new Date(iso)
  if (isNaN(d)) return iso
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

/* ══ GitHub API 载荷 → release.json 形状 ══
   浏览器端回退与 site/data/release.json 共享同一数据契约;变化必须同步
   scripts/gen-site-data.mjs。 */
export function normalizeReleasesPayload(releases) {
  var r = (Array.isArray(releases) ? releases : []).filter(function (x) { return !x.draft })
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
}

/* ══ 实时下载数合并 ══
   /api/downloads 的实时计数合并进 release.json 形状。纯函数:输入不变,
   无变化时返回 null(调用方据此跳过重渲染)。 */
export function mergeLiveCounts(data, live) {
  if (!live || !Array.isArray(live.assets)) return null
  var changed = false
  var assets = data.release.assets.map(function (a) {
    var la = live.assets.find(function (x) { return x.name === a.name })
    if (la && typeof la.downloads === 'number' && la.downloads !== a.downloads) {
      changed = true
      return Object.assign({}, a, { downloads: la.downloads })
    }
    return a
  })
  var stats = data.stats ? Object.assign({}, data.stats) : {}
  if (typeof live.mac_downloads === 'number' && typeof live.win_downloads === 'number' && typeof live.total_downloads === 'number') {
    if (stats.mac_downloads !== live.mac_downloads || stats.win_downloads !== live.win_downloads || stats.installer_downloads !== live.total_downloads) {
      changed = true
    }
    stats.mac_downloads = live.mac_downloads
    stats.win_downloads = live.win_downloads
    if (typeof live.linux_downloads === 'number') {
      if (stats.linux_downloads !== live.linux_downloads) changed = true
      stats.linux_downloads = live.linux_downloads
    }
    stats.installer_downloads = live.total_downloads
  }
  if (!changed) return null
  return Object.assign({}, data, {
    release: Object.assign({}, data.release, { assets }),
    stats: stats,
  })
}
