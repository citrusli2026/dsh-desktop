# Windows 代码签名方案对比（新增选项：Certum / SignPath Foundation / Microsoft Store / DigiCert / GlobalSign）

> 调研目的：为 dsh-desktop（citrusli2026/dsh-desktop，Electron 43.4.0 + electron-builder 26.15.3，NSIS x64 + electron-updater，GitHub Actions 出包）的 Windows Authenticode 代码签名补齐**此前两份调研未覆盖的选项**，并对其中随时间变化的承重结论做最新复核。
> 交叉引用（本次不重复其细节）：
> - 《社区 11 个同类项目签名做法分析》：`docs/windows-signing-analysis.md`
> - 《费用与可行性对比（Azure / SSL.com / Sectigo / 沃通 / 不签名）》：`docs/windows-signing-cost-comparison.md`
> 方法：承重结论全部追到主源（厂商官方页、Microsoft Learn、CCADB 微软可信根名单、官方 GitHub 仓库/Workflow），附 URL 与访问日期 **2026-08-28**；官方页读不到的数字一律标"未核实"，聚合站/转售商数字仅作二手参考并注明。electron-builder 能力已对照本地 `node_modules/.pnpm/app-builder-lib@26.15.3_*/node_modules/app-builder-lib/scheme.json` 核实。
> 汇率（open.er-api.com，2026-08-28，参考汇率非牌价）：1 USD ≈ **6.74** CNY，1 EUR ≈ **7.84** CNY。

---

## 1. 摘要

1. **推荐排序有变**：纳入本次新增选项后，对"大陆个人 + 无营业执照 + GitHub 托管 runner + electron-builder 26.15.3"的约束，排序为 **① SignPath Foundation（$0，条件见 §4）→ ② Certum Open Source 云签（≈¥390/年）→ ③ SSL.com IV + eSigner（≈¥2,082/年，旧文档推荐，维持）→ ④ 维持不签名（$0）**；**⑤ Microsoft Store（账户 $0）** 是与之正交的并行渠道——它是微软官方口径下唯一"彻底不触发 SmartScreen"的路线，但不解决 GitHub Releases 直装路径的签名问题。
2. **旧文档承重结论复核（2026-08-28）**：Azure Artifact Signing 个人 Public Trust 验证**仍限美国/加拿大居民**（Learn Quickstart，页面 2026-08-11 更新，原文未变），但**组织** Public Trust 的可用地区已扩大到欧盟/英国/澳/新/日/韩/新加坡/瑞士/挪威/以色列——对我们个人仍此路不通；SSL.com 全线价格与旧文档一致（IV $129/年、eSigner Tier 1 年付 $15/月）。无变化。
3. **Certum（波兰 CA，Asseco 旗下）** 是目前最便宜的"个人可自助 + 云签名 + Windows 默认信任"付费路线：**Open Source Code Signing（SimplySign 云签）€49/年（官方美元店 $58 ≈ ¥391）**；CN 为 `Open Source Developer <真实姓名>`；验证可全远程（证件照 + 水电账单，1–3 个工作日签发）；支付支持 PayPal/银行卡；其 5 个代码签名根在微软 CCADB 名单全部 **Included**（已逐行核实）。
4. Certum 的四个坑：**① 仅限非商业分发，用于商业软件会被吊销**（官方条款原文）；**② CA/B CSC-31 新规**：2026-02-27 起单张代码签名证书最长 **459 天**，年年要重签；**③ SimplySign 云签有 5,000 签名/月上限**；**④ 库存波动**——核查时美元店与"卡+读卡器"套装显示缺货，欧元店云签在售。
5. **Certum 在 GitHub 托管 runner 的自动化已有可复现实证**：`dismine/windows-app-signing-setup-action` 在 `windows-latest` 上安装 SimplySign Desktop MSI（files.certum.eu 官方包）、用 TOTP URI 自动登录虚拟智能卡、再交 signtool 签名——配合 electron-builder 的 `win.signtoolOptions`（`certificateSubjectName`/`publisherName` 或自定义 `sign` 钩子）即可闭环，无需任何硬件。
6. **SignPath Foundation（signpath.org）** 为开源项目提供**完全免费**的代码签名：证书发给 **SignPath Foundation 这个法人**（用户看到的发布者就是它，不是你），私钥在其 HSM；CI 走 SignPath.io 云服务（SignPath GitHub App 提供构建来源元数据 + `submit-signing-request` Action，支持来源验证与分支限制）；申请表当前开放，官网已列 **332 个**项目（Vim、Stellarium、Flameshot、Git Extensions 等）。
7. SignPath Foundation 的硬门槛（官方条款原文）：**全部组件必须 OSI 许可开源、禁止商业双许可、不得含专有代码**（GPLv3 §1 "System Libraries" 除外）；团队须发布"代码签名政策"页、全员 MFA、设 Author/Reviewer/Approver 角色、**每次发布需人工批准**。**对我们最关键的风险：dsh-desktop 捆绑 `@deepseek-ai/dsh` 预编译内核——若该内核不满足"自己维护的开源源码"定义，项目不符合资格**（是否豁免未核实，需向 Foundation 确认）。
8. **Microsoft Store 路线的注册成本已归零**：新 onboarding 流程（storedeveloper.microsoft.com 入口）**个人账户 $19 注册费已豁免**，改用"政府证件 + 自拍"验证，覆盖近 200 个市场（Microsoft Learn，2026-04/2026-07 更新，原文 "there are no registration fees for either account type"）。SmartScreen 官方文档（2026-08-17 更新）明确："**最简单的避免 SmartScreen 警告的方式是上架 Microsoft Store**，商店应用由微软证书重签、用户永远不会看到 SmartScreen 下载警告"。
9. Store 路线的代价：Electron 需打 MSIX/AppX（electron-builder 26.15.3 有 `appx` target，要求在 Windows 10+ 上构建；与 Electron 43 + 现有 NSIS 产物链的兼容细节未核实）；**更新改由 Store 接管**，商店构建必须禁用 electron-updater（否则双更新通道冲突）；每次提交都要过 Store 应用认证，时长无固定 SLA（未核实）。
10. **DigiCert 与 GlobalSign 对个人均不可行**：DigiCert 官方文档写明代码签名证书"tied to your Organization Name only"（OV，价格不公开）；GlobalSign 官方商店写明 "Code Signing Certificates can be issued in the name of a legally registered organization **only**"，页面无静态价格（搜索摘要的 $529/年属二手信息）。
11. SmartScreen 官方口径再次确认（文档 2026-08-17 更新）：有效 OV/IV 证书签名后**首次下载仍会警告**，需"数周 + 数百次干净安装"积累声誉；**EV 明确"不再绕过 SmartScreen"，为免警告买 EV 溢价"不再合理"**（原文更强硬了）；未签名文件每个新版本从零积累。**新增提醒：Win11 的 Smart App Control 会直接拦截无正声誉的可执行文件**——不签名的影响面在扩大，不只是"多点一下仍要运行"。
12. electron-updater 影响（本地 schema 核实）：`win.verifyUpdateCodeSignature` 默认 `true`，用 `publisherName`（默认取证书 CN）校验增量更新——**签名主体一旦上线就不要再换**；electron-builder 在签名后生成 NSIS blockmap，差分更新不受签名影响；若在 electron-builder 之外后置签名（如 SignPath 服务端签名、gsudo 式独立 signtool 步骤），必须像 dataelement 那样重建 blockmap + `latest.yml`。

---

## 2. 总对比表

| 选项 | 官方年成本（来源+日期） | 验证类型 / 大陆个人可行性 | 签名后显示的发布者 | SmartScreen 预期 | CI（GitHub 托管 runner + e-b 26.15.3） | 私钥形态 / 续期吊销 | 微软可信根（CCADB 2026-08-28） | electron-updater 影响 |
|---|---|---|---|---|---|---|---|---|
| **SignPath Foundation** | **$0**（signpath.org） | 不验证个人身份，验证"二进制由公开源码构建"；需 OSI 纯开源（含捆绑组件认定，见 §4 风险） | **SignPath Foundation** | 同 OV 级：首装警告→声誉积累 | SignPath GitHub App + Action，服务端签名；e-b 外后置签名需重建 blockmap/latest.yml | Foundation HSM 托管；违规可追溯吊销 | 公共 CA 链（具体根未核实） | publisherName 变为 SignPath Foundation，需显式配置 |
| **Certum Open Source**（SimplySign 云签） | **€49/年**（官方美元店 $58 ≈ ¥391；shop.certum.eu / certum.store，2026-08-28） | 个人（自然人）；证件照（护照/身份证/驾照/永居卡）+ 水电账单，远程可办；大陆证件是否被自动验证接受未核实 | `Open Source Developer <姓名>` | 同 OV 级：首装警告→声誉积累 | Windows runner + SimplySign Desktop + 社区 action（TOTP 自动登录）+ signtool；e-b `signtoolOptions` 直连 | 云虚拟卡（FIPS 140-2 L3/CC EAL）；459 天/年重签；**非商业用途限制，违者吊销**；5,000 签名/月 | **5 个根全部 Included（含 Code Signing EKU）** | 无特殊影响；publisherName=CN |
| **Certum Standard**（个人也可买） | €209/年（云签；shop.certum.eu，2026-08-28） | 个人或组织；验证同上 | 个人姓名或单位名 | 同上 | 同上 | 同上（无非商业限制） | 同上 | 同上 |
| **SSL.com IV + eSigner**（旧文档推荐） | $129 + $180 = **$309 ≈ ¥2,082**（2026-08-28 复核无变化） | IV 个人；官方未列国家限制；电话回拨/证件/卡种未核实 | 个人姓名 | 同上 | 官方支持 GitHub Actions；e-b 无原生键，走 eSigner CLI | 云 HSM；按年续 | 2022 代码签名根 Included | 同上 |
| **Azure Artifact Signing**（复核） | Basic $119.88/年（定价页；SmartScreen 文档原文 "Starts at $9.99/month" 佐证） | **个人仍限美加（未变）**；组织地区已扩大（对我们无意义） | Azure 账单账户法定名 | 声誉自动积累 | e-b 原生 `win.azureSignOptions` | 微软托管 HSM | 微软自有链 | 同上 |
| **Microsoft Store** | 账户 **$0**（新流程 $19 已豁免；Learn 2026-04/07 更新） | 个人：Microsoft 账号 + 政府证件 + 自拍；大陆是否在覆盖市场内未核实 | 商店页显示开发者显示名（非证书主体） | **官方：Store 应用"永不"出现 SmartScreen 下载警告** | e-b `appx` target（需 Windows 10+ 构建环境）；提交走 Partner Center | 无需自有私钥（微软重签） | 微软自有链 | **商店版必须禁用 electron-updater**，更新归 Store |
| **DigiCert** | 未公开（官方页反爬/无价目） | **仅组织**（"tied to your Organization Name only"）；个人 ❌ | 单位名 | 同 OV/EV | KeyLocker 云签面向组织 | KeyLocker 云 HSM（组织） | Included | — |
| **GlobalSign** | 页面无静态价（搜索摘要 $529/年＝二手） | **仅组织**（官方原文 "legally registered organization only"）；个人 ❌ | 单位名 | 同 OV/EV | — | 云 HSM/令牌 | Included | — |
| **Sectigo OV**（旧文档已核） | $313.50/年（1 年，sectigostore.com） | 个人可 OV；强制硬件令牌→托管 runner 不可行 | 个人/单位 | 同上 | 需自托管 runner + 令牌 | USB 令牌 | Included | 同上 |
| **不签名**（现状） | $0 | — | 未知发布者 | "Windows 已保护你的电脑"；**Win11 Smart App Control 可能直接拦截** | 无 | — | — | 现状 |

---

## 3. 已有选项复核结果（不重复旧文档细节）

### 3.1 Azure Artifact Signing（原 Trusted Signing）
- **复核结果（2026-08-28）**：Learn Quickstart（`ms.date` 2026-05-21，`updated_at` 2026-08-11）原文照旧："**Individual developers must be located in the United States or Canada.**" —— 旧文档"个人地理限制死刑"结论**维持不变**。
- **变化**：组织 Public Trust 的适用地区从美加扩大为"美国、加拿大、欧盟、英国、澳大利亚、新西兰、日本、韩国、新加坡、瑞士、挪威、以色列"——对大陆个人开发者仍无帮助（组织路线本身需要法定实体）。
- 定价 $9.99/月与 SmartScreen 文档的推荐表述互相印证，未见变动。个人验证仍走 Azure 账单账户（Individual 类型）+ AU10TIX 证件/自拍/电话 + Authenticator。

### 3.2 SSL.com eSigner
- **复核结果（2026-08-28，产品页自载 REST 端点 `wp-json/wp/v2/pages/49146`）**：证书价 IV $129/年、OV $129/年、EV $349/年、EV Sole Proprietor $359/年；eSigner 年付 Tier 1 $15/月（240 次/年）– Tier 4 $187.50/月（12,000 次/年）；月付 Tier 1 $20/月（20 次/月）。**与旧文档完全一致，无变化**。
- 新增小项：额外 credential $20/月；新证书送 30 天 eSigner 试用。旧文档"推荐 + 决策树"继续有效，但本文档将其排序降至 Certum 之后（理由见 §3.4 与 §8）。

### 3.3 Sectigo OV/EV（官方授权店）
- 本次未重新抓价（旧文档同为 2026-08-28 抓取）：OV $313.50/年、EV $410.85/年、强制 HSM/令牌的结论维持。个人 OV 在"托管 runner 无硬件"约束下依旧不可自动化。

### 3.4 对旧文档推荐的影响
旧文档结论"SSL.com 是唯一同时满足个人验证 + 云签 + CI + 根受信的方案"在本轮调研后被**修正**：Certum Open Source 以约 1/5 的年成本满足同样四个条件（SignPath 则直接把成本降为 0，但引入资格门槛）。SSL.com 降级为"Certum 验证失败/有商业分发需求时的备胎"。

---

## 4. SignPath Foundation（免费，开源专用）

**是什么**：SignPath.io（商业云签名服务）的基金会，为 OSS 项目提供免费代码签名证书与签名服务。官网 signpath.org，申请入口为在线表单（2026-08-28 核查时开放）。官网列出 332 个持证项目（含 Vim、Stellarium、Flameshot、Git Extensions、Mumble、Tiled、Nuke、LiteDB）。

| 角度 | 结论 |
|---|---|
| 成本 | **$0**（"For OSS projects, our services are free of charge."） |
| 资格（terms.html 原文归纳） | OSI 许可证、禁止商业双许可；不得含专有代码（GPLv3 §1 System Libraries 除外）；无恶意软件/PUP；申请团队必须拥有并维护源码仓库与构建脚本；项目需已发布、活跃维护、有功能文档与"可验证声誉"（库类豁免）；须发布 code signing policy 页；SignPath 与源码仓库全员 MFA |
| 身份验证 | **不验证个人身份**，验证"二进制确实由你的公开源码构建"（Origin Verification） |
| 证书 | 发给 **SignPath Foundation**（"a code signing certificate must always be issued to a legal entity"）；社区普遍描述为 OV 级（未核实）；发行 CA 未核实 |
| 发布者显示 | **SignPath Foundation**（不是你的名字，也不是项目名） |
| SmartScreen | 有效证书同等行为：首装警告→随声誉消失；无 EV 特权 |
| CI 集成 | SignPath **GitHub App** 安装到仓库（来源元数据由 GitHub 而非构建脚本提供，防伪造）+ 官方 `SignPath/github-action-submit-signing-request` Action 提交签名请求；策略可限制分支（main/release/*）、要求来源验证；信任构建系统支持 GitHub/Jenkins/GitLab/Azure DevOps/TeamCity/AppVeyor。**每次发布需人工 Approve**（半自动，这是条款要求而非技术限制） |
| electron-builder 集成 | 无原生配置：CI 中先出包 → `submit-signing-request` 服务端签名 → 回传签名产物 → **重建 blockmap 与 latest.yml**（参照社区 dataelement 项目的后置签名流水线模式）；`win.publisherName` 需显式设为 `SignPath Foundation` |
| 维护负担 | 免费；但条款允许"无事先通知暂停/终止"与"立即或追溯吊销"；流程依赖 SignPath.io 服务与人工批准 |

**对本项目的关键风险**：条款要求"团队必须是所有源码文件和构建脚本的维护者"且组件全部开源。dsh-desktop 捆绑 `@deepseek-ai/dsh` **预编译内核**，若该内核不是本项目维护的开源组件，需在申请前与 Foundation 书面确认认定口径——**未核实，申请前必须先问**。单人项目需一人兼任 Author/Reviewer/Approver 三角色（条款未禁止，未核实）。

---

## 5. Certum（波兰 CA，Asseco Data Systems）

### 5.1 产品与官方价格（shop.certum.eu / certum.store，2026-08-28）

| 产品 | 交付 | 官方价 | 备注 |
|---|---|---|---|
| **Open Source Code Signing – 云签（SimplySign）** | 无硬件 | **€49**（欧元店类目页）；官方美元店标 "from $58" ≈ ¥391 | 面向"以自由使用方式分发软件"的开发者/开源项目；核查时美元店显示缺货 |
| Open Source Code Signing – 套装（cryptoCertum 卡 + 读卡器） | 实体卡 | €69 | 核查时缺货 |
| Open Source – 电子代码（已有自己的卡） | 无硬件 | €25 | |
| **Standard Code Signing – 云签** | 无硬件 | **€209** ≈ ¥1,639 | 个人或组织皆可 |
| Standard – 套装 / 电子代码 | 实体卡 | €169 / €139 | 美元店套装 "from $189"（缺货） |
| EV Code Signing – 云签 | 无硬件 | €379 | 组织 |

**有效期新规（官方页原文）**："Starting from February 27, 2026, a single Code Signing certificate may be valid for a maximum of 459 days"（CA/B Forum Ballot CSC-31；DigiCert 官方博客表述为 460 天、2026-03-01 生效）——多年期购买改为期内免费重发，**实际每年要重新走一次签发流程**。

### 5.2 身份验证（个人，远程可办）
官方支持页（support.certum.eu/en/code-signing-required-documents/）给出的四种方式任选：自动身份验证（推荐，签发时在线完成）、注册点当面确认、公证确认、或"手持证件照"（ID 卡/护照/驾照/永居卡正反面 + 人脸可比对）。另需**地址凭证**（以本人名义的水电/电话等账单）；公开登记类文件不得早于 13 个月；证件须在签发日有效。文件经商店账户远程上传（备用安全传输通道）。**签发时长：Open Source/Standard 均为 1–3 天**（how-to-buy 页）。页面对申请人国籍无限制清单——**对中国大陆证件（身份证/护照）是否被自动验证接受：未核实**。
Open Source 额外要求：提供**在维护的开源项目网址**且能明显看出你与项目的关联；CN 前缀 `Open Source Developer`，O 字段固定为 `Open Source Developer`；**"用于商业分发软件将被吊销"**（官方原文）。

### 5.3 SimplySign 云签名（无需读卡器）
官方形态：云端虚拟加密卡（密钥存于 FIPS 140-2 Level 3 / CC EAL 认证存储），使用需三件套：手机 App（生成访问码，Android/iOS）+ 电脑上的 **SimplySign Desktop**（官方支持页提供 Windows/macOS/**Linux** 客户端下载；Arch Linux 有社区 AUR 包）+ 云账户。SimplySign Desktop 在本机**模拟物理读卡器+智能卡**，证书进入系统证书库后即可被标准 signtool 使用。**月签名上限 5,000 次**（超限可能当月封禁，官方页原文）。

### 5.4 CI 集成（GitHub 托管 runner，已验证可行路径）
社区现有可复现方案（FreeCAD 维护者的 `dismine/windows-app-signing-setup-action`，README 已核）：
1. `runs-on: windows-latest`；缓存并安装官方 SimplySign Desktop MSI（`files.certum.eu/software/SimplySignDesktop/Windows/...`）；
2. action 用三个 secret（`certum-username` / `certum-otp-uri`（TOTP）/ `certum-key-id`（SHA1 指纹））自动完成登录与证书校验——解决了"SimplySign 需人工登录虚拟卡"这个唯一非自动环节；
3. 之后照常 `signtool sign`（虚拟智能卡出私钥）。
与 electron-builder 26.15.3 衔接两条路（本地 scheme.json 核实）：
- `win.signtoolOptions.certificateSubjectName`（按主题名从证书库选证书）+ `publisherName`（设为 `Open Source Developer <姓名>`），让 electron-builder 自己调 signtool；
- 或 `win.signtoolOptions.sign` 自定义函数/脚本钩子（cocode 项目已验证该插点的用法，见社区分析文档）。
时间戳：`rfc3161TimeStampServer` 默认 `http://timestamp.digicert.com`，可直接用。
**Linux 无头 runner 的 SimplySign 自动化**：官方有 Linux 客户端但未见官方 headless/CI 文档——未核实，不建议作为首选。

### 5.5 信任状态（CCADB 微软可信根名单，2026-08-28 逐行核实）
以下 Certum 根均为 **Included** 且 EKU 含 Code Signing：`Certum CA`（2002）、`Certum EC-384 CA`、`Certum Trusted Network CA`（2008）、`Certum Trusted Network CA 2`、`Certum Trusted Root CA`。与旧文档中"沃通/ CNNIC 全部 Disabled"形成对照——Certum 是正规受信链。

### 5.6 支付
官方 how-to-buy 页：快速转账（eCard 通道）支持**银行卡、电子转账、PayPal、Blik、Google Pay**；也支持传统银行转账。大陆个人以 PayPal（绑双币卡）或国际卡支付的现实障碍最小；**大陆双币卡直刷是否被 eCard 接受：未核实**。

---

## 6. Microsoft Store 路线

### 6.1 个人开发者账户：$19 注册费已成为历史
- Microsoft Learn《Free developer registration for individual developers》（2026-04-18 更新，2026-08-28 抓取）：新 onboarding 流程已上线，**"The $19 registration fee is waived in the new flow"**，覆盖"近 200 个市场"；验证方式为**政府签发证件 + 自拍**；入口必须是 storedeveloper.microsoft.com（从 Partner Center 等旧入口走会看到仍收费的 legacy 流程）。
- 《Steps to open a developer account》（2026-07-17 更新）："With the new onboarding experience, there are **no registration fees for either account type**"——公司账户也免费（公司账户需 DUNS 或营业执照，与我们无关）。
- 个人账户定义与我们吻合："distribution not in relation to their business, trade, or profession"、hobbyist/personal project。**中国大陆是否在近 200 市场清单内：未核实**（注册页需实际走一遍）。

### 6.2 SmartScreen（官方口径）
SmartScreen reputation 文档（2026-08-17 更新）开篇 Tip：**"The simplest way to avoid SmartScreen warnings is to publish through the Microsoft Store. Store-distributed apps are signed by a Microsoft certificate and are never subject to SmartScreen download warnings."** 正文再次强调 "Users will never see a SmartScreen warning for a Store-installed app"。这是所有路线中唯一承诺"永不警告"的。

### 6.3 打包与 electron-builder
- 本地 scheme.json 核实：`win.target` 合法值含 **`appx`**，注释 "AppX package can be built only on Windows 10"——GitHub `windows-latest` runner 满足构建条件。
- 提交 Store 用 `.appxupload`/`.msixupload` 包；Store 分发的应用由微软重签，**开发者不需要自有代码签名证书**。
- **未核实**：Electron 43 + electron-builder 26.15.3 的 appx 产物通过当前 Partner Center 认证的全链路（运行时依赖、包标识与 Partner Center 发布者身份对齐、MSIX 规范变化）需要一次实测；社区存在 Electron 应用上架先例，但本次未核实到官方对 Electron 的专门支持声明。

### 6.4 更新机制冲突
Store 应用更新由 **Store 自动接管**（应用随 Microsoft Store 静默更新）；electron-updater 的 GitHub Releases 通道在商店版内必须**禁用**（`publish: null` 或运行时判断安装来源），否则双更新通道打架、且 MSIX 沙箱化文件系统会破坏 electron-updater 的写入假设。**NSIS + electron-updater 的 GitHub Releases 主渠道可与 Store 渠道并存**（同一代码出两种包），但 Store 版本审核节奏（每次更新重新认证）会拖慢迭代速度。

### 6.5 审核负担
账户层：个人证件验证即时~短时（文档称通过后"立刻进入 Partner Center"）；提交层：每次发布需通过应用认证（安全/合规/内容政策），**官方未给固定时长 SLA：未核实**；公司账户文件验证 3–5 个工作日（供对照）。另外注意 Store 政策对"仅包装网页/其他程序客户端的壳应用"有限制条款——dsh 这类"AI 工具桌面壳"是否触线，**未核实**（需对照 Store 政策 10.x 类目）。

---

## 7. DigiCert / GlobalSign（个人可行性：双双否定）

| | DigiCert | GlobalSign |
|---|---|---|
| 个人能否买 | **否**。官方文档（docs.digicert.com，代码签名申请页）："A Code Signing certificate is tied to your **Organization Name** only"；产品线 OV/EV 皆组织验证 | **否**。官方商店（shop.globalsign.com/en/code-signing，2026-08-28）原文："GlobalSign Code Signing Certificates can be issued in the name of a **legally registered organization only**" |
| 公开价格 | 无公开价目（官网转销售流程，旧文档已核实反爬）；仍未核实 | 官方页面价格动态加载、无静态数字（未核实）；搜索摘要显示 "From $529 USD/year"（**二手，仅参考**） |
| 附加变化 | 2026-02-24 起停发 2/3 年代码签名证书（官方 advisory）；KeyLocker 云签仍面向组织 | 仅剩 1 年（366 天）证书（其 FAQ 引 CA/B 新规） |
| 结论 | 个人路径不存在，无需再深挖 | 同左 |

---

## 8. 其他渠道（简列）

- **Certum 授权转售商**（SSLmentor 等）：Certum 云签 "from ~$116"（转售商页，**二手参考**）；比官方店贵，仅当官方店长期缺货时考虑。
- **其他 Sectigo/Comodo 转售商**（K Software、sslpoint 等）：常见 "$129 起、个人可办 OV" 说法（**二手**；且 sslpoint "3 年证书"报价已与 CSC-31 新规冲突， suspect 旧信息）。Sectigo 官方授权店价格以旧文档核实数据为准。
- **国内 CA（CFCA / GDCA / 上海 CA）**：CCADB 中部分根 Included（旧文档附录），但"个人代码签名产品是否存在、价格、发证流程"仍未核实；沃通案例已证明该方向对个人与 Windows 信任双重不利。
- **Sigstore / 其他透明日志签名**：不构建在 Windows 信任根链上，对 SmartScreen/未知发布者提示**无帮助**，不作为本议题选项。

---

## 9. 推荐与决策树

约束回顾：大陆个人、无营业执照、个人卡支付、GitHub 托管 runner、electron-builder 26.15.3 + NSIS + electron-updater、发布走 GitHub Releases（GitCode 镜像）。前提认知（微软官方）：**任何非 Store 签名都只解决"未知发布者"展示，首装警告仍会存在数周**；签名身份跨版本一致才能延续声誉。

**推荐序列（依次尝试，命中即停）：**

1. **首选：申请 SignPath Foundation（$0）**
   触发条件/前提：项目整体满足 OSI 纯开源且**捆绑内核的源码归属问题得到 Foundation 认可**；接受发布者显示为 "SignPath Foundation"；接受每次发布手动批准；满足"已发布 + 有声誉 + code signing policy 页 + 全员 MFA"。
   动作：先邮件/表单询问 @deepseek-ai/dsh 捆绑认定 → 通过则走 GitHub App + Action 接入（半天工作量）→ 配 `win.publisherName: "SignPath Foundation"`。
   不通过或无回复 → 进入 2。
2. **次选：Certum Open Source 云签（≈¥390/年）**
   触发条件/前提：分发的确属非商业（当前免费开源成立）；愿意每年重签（459 天规则）；护照 + 名下账单可远程验证；PayPal/国际卡可支付。
   动作：欧元店下单（避免美元店缺货页）→ 远程验证（1–3 天）→ SimplySign + dismine action + `signtoolOptions.certificateSubjectName` 接入（一天工作量）。
   验证被拒 / 无法支付 → 进入 3。
3. **备胎：SSL.com IV + eSigner（≈¥2,082/年，旧文档原推荐）**
   前提同旧文档：先与客服确认大陆证件、+86 回拨、卡种。商业分发限制比 Certum 宽松，适合未来项目商业化后平移。
4. **并行（与 1–3 不互斥）：Microsoft Store 渠道（$0）**
   触发条件：愿意投入 MSIX 打包与双通道维护，接受商店审核节奏。它是唯一"永不 SmartScreen"路线，且个人账户已免费——**建议作为中期独立工作项**（先走通 appx 打包→提审→商店更新链路验证），不作为近期签名方案的替代。
5. **兜底：维持不签名（$0，现状）**
   在 1–3 全部落空时继续，沿用社区文档做法（README/release notes 明示"未签名 + 首装点'仍要运行'"）。**新增理由要写进用户文档：Win11 开启 Smart App Control 的机器可能直接拦截运行**，受影响用户应获提示。

**一句话决策**：先问 SignPath（0 元），不行买 Certum（391 元/年），再不行问 SSL.com（2,082 元/年），同时把 Store 当作中期"免警告"并行渠道；任何情况下都不要再为 EV 付钱。

---

## 10. 未核实项清单（截至 2026-08-28）

1. **Certum 自动身份验证对中国大陆身份证/护照的接受度**、自动验证 App 的支持国家清单（官方页无国家列表）。
2. Certum 各 SKU **库存状态随时间波动**（核查时美元店 Open Source 系列与卡套装缺货、欧元店云签在售）——下单前需实时确认。
3. **SignPath Foundation 证书的发行 CA 与根证书**（官方未公布；社区流传 Certum 属推测）；其证书是否 OV 级（仅二手来源）。
4. SignPath 对**单人项目兼任 Author/Reviewer/Approver** 是否接受；申请审核周期时长。
5. SignPath 对**捆绑第三方预编译二进制**（@deepseek-ai/dsh 内核）是否构成"专有组件"的认定——申请前必须书面确认。
6. **Microsoft Store 新流程是否覆盖中国大陆**（"近 200 市场"未附清单）；证件+自拍验证对大陆身份证的接受度。
7. Store **应用认证时长**（无公开 SLA）；Store 政策对"桌面壳/启动器"类应用的认定。
8. electron-builder 26.15.3 `appx` target 与 Electron 43 产物通过当前 Partner Center 认证的端到端兼容性（需实测）。
9. **GlobalSign 官方静态价格**（$529/年为搜索摘要二手信息；官方页动态加载读不到）。
10. **DigiCert 公开价格**（沿用旧文档结论：无公开价目）。
11. SimplySign **Linux 无头 CI** 自动化（官方有 Linux 客户端，无官方 headless 文档）。
12. eCard 支付通道对**大陆发行银行卡**的接受度（Certum/SSL.com 同）。
13. 汇率 6.74（USD）、7.84（EUR）为 open.er-api.com 2026-08-28 参考值，非银行牌价。

---

## 附：引用链接（抓取日期均为 2026-08-28）

**Microsoft 官方**
- SmartScreen reputation（EV 不再豁免、Store 永不警告、声誉数周/数百次安装、Smart App Control）：https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation
- Artifact Signing Quickstart（个人限美加原文、组织地区扩大、AU10TIX 流程）：https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart
- 免费个人开发者注册（$19 豁免、证件+自拍）：https://learn.microsoft.com/en-us/windows/apps/publish/whats-new-individual-developer
- 开发者账户开设（两种账户均免注册费）：https://learn.microsoft.com/en-us/windows/apps/publish/partner-center/open-a-developer-account
- Windows 开发者代码签名选项总览（个人限美加表述）：https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options

**Certum（官方）**
- 代码签名产品类目与价格（€49/€209/€379、459 天规则）：https://shop.certum.eu/code-signing.html
- Open Source 云签产品页（SimplySign、个人 "Open Source Developer" 主体、5000 签名/月）：https://certum.store/open-source-code-signing-on-simplysign.html
- Open Source 套装页（€69、缺货状态）：https://shop.certum.eu/open-source-code-signing.html
- 验证所需文件（远程验证、证件照、水电账单、13 个月时效、商业分发吊销条款）：https://support.certum.eu/en/code-signing-required-documents/
- 购买/支付方式（eCard：卡/PayPal/Google Pay/Blik；签发 1–3 天）：https://support.certum.eu/en/how-to-buy-code-signing/
- SimplySign 客户端下载（Windows/macOS/Linux）：https://support.certum.eu/en/cert-offer-software-and-libraries/
- 微软可信根名单（Certum 根 Included 逐行核实）：https://ccadb.my.salesforce-sites.com/microsoft/IncludedCACertificateReportForMSFT

**SignPath（官方）**
- Foundation 主页（免费声明、HSM、知名用户）：https://signpath.org/
- 开源项目条款（OSI/专有代码/角色/MFA/人工批准/吊销权）：https://signpath.org/terms.html
- 项目名录（332 项，Jekyll 数据源）：https://github.com/SignPath/fdn-website （`docs/_data/projects.yml`）
- 申请表单（开放中）：https://signpath.org/apply
- Origin Verification（可信构建系统、分支限制、可复现检查）：https://docs.signpath.io/origin-verification/
- GitHub 集成（App + Action）：https://docs.signpath.io/trusted-build-systems/github 、https://github.com/SignPath/github-action-submit-signing-request 、示例 https://github.com/SignPath/demo-github-actions

**Certum CI 实证（社区，非官方）**
- dismine/windows-app-signing-setup-action（windows-latest + SimplySign Desktop MSI + TOTP 自动登录 + signtool）：https://github.com/dismine/windows-app-signing-setup-action
- gsudo 签名流水线（PFX + signtool 的 GH Actions 先例，非 SimplySign）：https://github.com/gerardog/gsudo （`.github/workflows/release.yml`、`build/03-sign.ps1`）

**DigiCert / GlobalSign（官方）**
- DigiCert 代码签名订单文档（组织绑定）：https://docs.digicert.com/en/certcentral/order-and-manage-certificates/request-certificates/request-a-code-signing-or-ev-code-signing-certificate/request-code-signing-certificate.html
- DigiCert 停发 2/3 年公告（2026-02-24）：https://docs.digicert.com/en/certcentral/order-and-manage-certificates/reports-and-advisories/end-of-2-and-3-year-public-code-signing-certificates.html
- DigiCert 有效期新规博客（460 天/2026-03-01）：https://www.digicert.com/blog/understanding-the-new-code-signing-certificate-validity-change
- GlobalSign 商店（仅组织原文）：https://shop.globalsign.com/en/code-signing
- SSL.com eSigner 订购面板（价格复核；REST：https://www.ssl.com/wp-json/wp/v2/pages/49146 ）：https://www.ssl.com/products/software-integrity/signing-service/

**本项目已有调研（交叉引用）**
- `docs/windows-signing-analysis.md`（11 个同类项目签名做法）
- `docs/windows-signing-cost-comparison.md`（Azure/SSL.com/Sectigo/沃通/不签名费用与可行性）
- electron-builder 26.15.3 本地 schema：`node_modules/.pnpm/app-builder-lib@26.15.3_dmg-builder@26.15.3_electron-builder-squirrel-windows@26.15.3/node_modules/app-builder-lib/scheme.json`（`WindowsAzureSigningConfiguration`、`WindowsSigntoolConfiguration` 含 `sign` 自定义钩子、`verifyUpdateCodeSignature` 默认 true、`appx` target）
