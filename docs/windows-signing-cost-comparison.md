# Windows 代码签名（Authenticode）方案费用与可行性对比

> 注：本报告 §5 的推荐（"SSL.com 是唯一现实路线"）已被同日后续调研《[windows-signing-options-comparison.md](windows-signing-options-comparison.md)》（新增 Certum ~€49/年、SignPath Foundation $0、Microsoft Store 等选项）修正——SSL.com 降为备胎，最新推荐排序见该文档 §9。本报告保留作费用核算与可行性基础。
> 适用对象：中国大陆个人开源开发者（citrusli2026/dsh-desktop，Electron + electron-builder 26.15.3，GitHub Actions 出 Windows NSIS 安装包 + macOS dmg）。无公司、无营业执照、仅个人身份、用个人银行卡支付。
> 所有价格仅来自**官方页面**（厂商站点 / Microsoft Learn / 微软可信根计划 CCADB 名单），附 URL 与抓取日期 **2026-08-28**。JS 渲染读不到的数字一律标注"未核实"，不用聚合网站数字冒充官方价。
> 文中换算汇率：1 USD ≈ **6.74 CNY**（open.er-api.com，2026-08-28 参考汇率，非银行牌价）。

---

## 1. 摘要

1. 对大陆个人开发者，代码签名现实上有意义的只有两条路：**SSL.com eSigner 云签名（个人 IV 证书）** 和 **保持不签名（0 成本）**；其余路线要么被地理/支付卡在门外，要么贵且纯属花钱买罪受。
2. Microsoft 的 **Azure Artifact Signing（原 Trusted Signing，2025 年更名）** 是官方文档点名推荐的非商店分发方案，Basic 档 **$9.99/月**（含 5,000 签名/月），且 electron-builder 26.15.3 原生支持（`win.azureSignOptions`）——但它的**个人（Individual）Public Trust 验证仅限美国或加拿大居民**，大陆个人开发者被地理限制直接拒绝，此路不通。
3. 即使不走个人验证、用组织验证，Artifact Signing 也**不签发 EV 证书**（微软 FAQ 明说"没有未来计划"），而且要求**付费 Azure 订阅**（免费/试用/赞助订阅均不支持）。
4. **SSL.com eSigner for Code**：官方在线订购面板显示 IV 个人验证代码签名证书 **$129/年**，云 HSM 签名服务 Tier 1 **$15/月（按年付 $180/年）**，合计约 **$309/年（≈¥2,080/年，约 ¥173/月）**；无需任何硬件令牌，官方明确支持 GitHub Actions/GitLab CI/Azure DevOps 等云构建环境。
5. 证书主体是**个人姓名**（IV 验证），不显示公司名；签名后 Windows 会显示发行者名，但 SmartScreen 警告仍会存在，需下载量积累声誉，**通常数周到数百次干净安装**后消失。
6. **传统 OV/EV + USB 令牌**（Sectigo 官方店等）：Sectigo OV 代码签名 **$313.50/年**（1 年，官网 3 年付 $219.45/年），**可选"个人开发者"OV 验证**；EV **$410.85/年** 但**仅限组织**。核心障碍是私钥强制存硬件令牌（需物理快递到中国、CI 自动化困难）、以及**EV 自 2021 年起已不再豁免 SmartScreen**（微软官方表述），溢价没有意义。
7. **DigiCert 与 GlobalSign**：官方站点不公布公开价（DigiCert 官网反爬/转销售流程，GlobalSign 页面无价格）——价格**未核实**，且 DigiCert EV 同样仅限组织。
8. **国内 CA（以沃通 WoSign 为例）**：官方价目表标准代码签名 ¥3,488–3,588/年、EV ¥4,288–6,888/年，但购买页明确"单位名称必须与**营业执照**一致"——个人无门；更致命的是**沃通全部根证书在微软可信根计划名单中均为 Disabled（禁用）状态**，Windows 默认不信任其证书链，签名等于没有，还需要用户手动装根证书——这条"便宜+国内支付"的幻想路线被彻底证伪。
9. **不签名**是零成本的现状选项：用户看到 SmartScreen "Windows 已保护你的电脑"警告 + "未知发布者"，点"仍要运行"才能装；部分企业策略可直接禁止。
10. 微软官方（SmartScreen 文档）说明：**新签名文件的声誉从零开始积累**，即使签名证书有效，首次下载仍会警告；证书声誉可以跨版本延续（签名身份不变即可），未签名文件每个新版本都要重新积累。
11. 现实约束排序：第一，**Azure 个人验证的地理限制**（美国/加拿大）把最顺手的路线堵死；第二，**无营业执照 + 无国际支付方式**把 EV/组织验证路线全部堵死；第三，**EV 不再豁免 SmartScreen** 使"付费买 EV 免警告"的动机消失。
12. 结论：**推荐 SSL.com IV 代码签名 + eSigner Tier 1 云签名**，一次性年度成本约 $309（约 ¥2,080），得到真实签名 + 显示个人姓名 + CI 无硬件集成；若短期无法解决国际信用卡或验证被拒，则**先维持不签名**，同时规划 Microsoft Store 商店分发（微软商店应用由微软重新签名、永不触发 SmartScreen 警告——但需 MSIX 打包与开发者账户，成本另计）。

---

## 2. 对比表

| 路线 | 官方价格（核实来源+日期） | 签名额度 | 身份验证 | 对中国人身份的接受度 | 支付 | 硬件 | CI / electron-builder 集成 | 证书主体（发行者） | SmartScreen 预期 |
|---|---|---|---|---|---|---|---|---|---|
| **A. Azure Artifact Signing Basic** | $9.99/月（$119.88/年）；超量 $0.005/签名。来源：azure.microsoft.com/en-us/pricing/details/artifact-signing/（2026-08-28；页面显示 $-，价格在页面 data-amount 中，且 Learn 文档原文 "Starts at $9.99/month" 佐证） | 5,000 签名/月 | Individual：资料自动取自 Azure 账单账户（账户类型须为 Individual）+ 受信验证机构（如 AU10TIX）手机 App 人脸/证件核验 + 电话 + Microsoft Authenticator；组织：营业执照等（1–20 工作日） | **个人 Public Trust 仅限美国/加拿大居民**（Learn 原文："Individual developers must be located in the United States or Canada"）→ 大陆个人被拒 | 须**付费** Azure 订阅（免费/试用/赞助订阅不支持，Learn FAQ 原文）；国际信用卡（Visa/MC）开户（大陆发行卡是否收，未核实） | 无（FIPS 140-3 L3 托管 HSM） | **原生**：electron-builder 26.15.3 `win.azureSignOptions`（`WindowsAzureSigningConfiguration`：certificateProfileName / codeSigningAccountName / endpoint / publisherName；默认时间戳 http://timestamp.acs.microsoft.com）；认证走 Azure Identity EnvironmentCredential（service principal 或 OIDC 工作负载身份） | 个人姓名（CN 必须为已验证法定实体名；**不可自定义 CN/O**） | 声誉自动累积，首次下载仍警告（Learn FAQ + SmartScreen 文档） |
| **A2. Azure Premium** | $99.99/月（$1,199.88/年）；超量 $0.005/签名（同上来源） | 100,000 签名/月 | 同上 | 同上（个人限美国/加拿大） | 同上 | 无 | 同上 | 同上 | 同上 |
| **B. SSL.com eSigner（IV 个人证书）** | IV 代码签名证书 **$129/年**；eSigner Tier 1 **$15/月（年付，$180/年）**（月付 $20/月）；另见验证费 $129（订购面板）。来源：ssl.com/products/software-integrity/signing-service/ 在线订购面板（2026-08-28，经该页自身 REST 端点读取） | Tier 1：20 签名/月（年付 240/年）；Tier 2–4：100/300/1,000 每月（$63.75/$131.25/$187.50 每月年付）；EV 档 Tier 1 10 签名/月（$75/月年付） | IV=个人验证；EV=组织；另有 **EV Sole Proprietor** $359/年。页面对话："Validation completed after ... a successful callback to a listed phone number"（电话回拨） | **官方未明确排除中国**，但电话回拨、证件类型（护照？身份证？）、是否服务中国大陆均**未核实** | 信用卡（具体卡种未核实） | **无**——"No USB token needed"，私钥在 SSL 云 HSM（FIPS 140-2 L3 宣称；自带云 HSM 免费，选 AWS/GCP/Azure 自有 HSM +$500–1,500 起） | 官方：GitHub Actions / GitLab CI / Azure DevOps / Jenkins 云/本地皆可；electron-builder 无原生配置，需在 CI 里调 eSigner CLI/API（集成指南页） | 个人姓名（IV；主体字段细节未核实） | 与其他有效证书等同：显示发行者名 + 声誉建立期警告 |
| **C. Sectigo OV（官方授权店）** | 1 年 **$313.50**（标价 $379，-17%）；3 年 $219.45/年。来源：sectigostore.com/code-signing/sectigo-code-signing-certificate（2026-08-28；"The SSL Store, a subsidiary of DigiCert…operated under license from Sectigo"） | 证书期内按次签名（官方未公布额度限制） | **Standard 验证"对组织和个人开发者均可用"**；EV 组织独享 | 个人可以申请 OV（个体开发者身份）；证件/电话/国籍要求未核实 | 信用卡；国际运费到中国未核实 | **必须**：官方明文"所有新代码签名证书私钥必须存放在 HSM 或合规硬件令牌"（USB 令牌需另购+美国/国际运输，价格在购物车，未核实） | 困难：USB 令牌无法挂 GitHub 托管 runner（须自托管机器+物理令牌） | 单位名或个人姓名+单位名（验证文档未核实） | 有效签名：显示发行者名+声誉期警告 |
| **C2. Sectigo EV** | 1 年 **$410.85**（标价 $498）；3 年 $288.20/年（sectigostore.com/code-signing/sectigo-ev-code-signing-certificate，2026-08-28） | 同上 | **仅组织** | ❌ 个人无门 | 同上 | 同上（"Install on Existing HSM"可选） | 同上 | 单位名 | **EV 已不豁免 SmartScreen**（微软原文）→ 建议不要为 EV 付溢价 |
| **D. 沃通 WoSign（国内 CA）** | 标准代码签名 ¥3,488–3,588/年；EV ¥4,288–6,888/年。来源：wosign.com/price_code.htm（2026-08-28；页标注价表"自 2016 年 1 月 4 日起生效"） | 按证书期 | 需营业执照：购买页原文"单位名称…必须与申请单位**营业执照**的名称保持一致" | 个人无法申请（无营业执照） | 支持人民币/国内支付 | USB Key 邮寄国内 | 需 USB Key + 沃通签名工具；CI 集成差 | 单位名称或"姓名+单位名称+Email"（其价目表） | **链不受 Windows 信任**：微软可信根名单（2026-08-28）中沃通全部根为 **Disabled**；WoTrus 官网还有"更新 Windows 根证书"手动导入页 → 签名无效，等同未签名且更糟 |
| **E. 不签名** | $0 | — | — | ✔ | — | 无 | 无 | 未知发布者 | "Windows 已保护你的电脑"，须点"仍要运行"；企业策略可禁止（微软 SmartScreen 文档表格原文） |

*Microsoft Trusted Root Program（CCADB 微软名单 "Included CA Certificate List"，As of August 28, 2026，https://ccadb.my.salesforce-sites.com/microsoft/IncludedCACertificateReportForMSFT）中与本话题相关的状态：SSL.com 代码签名根（2022 RSA/ECC）＝Included；Sectigo Public Code Signing Root R46/E46、COMODO、USERTrust、Entrust CSBR1＝Included；DigiCert/GlobalSign 代码签名根＝Included；**沃通全部 5 个根 ＋ CNNIC＝Disabled**；CFCA "CFCA EV ROOT"、"CFCA Identity CA"＝Included；GDCA（现 Global Digital Cybersecurity Authority）TrustAUTH R5＝Included；上海 CA "UCA Global G2 Root"＝Included（其余 UCA 根 Disabled）。*

---

## 3. 逐路线费用细目（USD 与约合人民币，汇率 6.74）

**A. Azure Artifact Signing**
- Basic：$9.99/月 ×12 = **$119.88/年** ≈ **¥808/年**（约 ¥67/月）；超出 5,000 签名/月部分 $0.005/签名。
- Premium：$99.99/月 ×12 = **$1,199.88/年** ≈ **¥8,084/年**（约 ¥674/月）。
- 注意：账单**不按比例计算**——创建账户当月即收全款（Learn FAQ 原文）。
- 没有任何免费档/试用（免费/试用/赞助订阅不可用）。

**B. SSL.com eSigner（个人现实路线）**
- IV 代码签名证书：$129/年 ≈ ¥869/年。
- eSigner Tier 1：年付 $15/月 = $180/年 ≈ ¥1,213/年（月付则 $20/月 = $240/年）。
- 合计：**$309/年 ≈ ¥2,082/年（约 ¥174/月）**。
- 若以后下载量大：Tier 2 年付 $63.75/月（$765/年 ≈ ¥5,156，100 签名/月）起。
- 可选加项：优先验证/加急运输（页面未静态显示金额，注明 "+$249 / +$329" 档位为硬件令牌与运输相关，见下"未核实"）；EV Sole Proprietor 证书 $359/年（需个体户/DBA 类资质，见"未核实"）。

**C. Sectigo 传统证书**
- OV 代码签名：1 年 $313.50 ≈ **¥2,113/年**；3 年 $219.45/年 ≈ ¥1,479/年（须用 HSM 且每年重签）。
- EV 代码签名：1 年 $410.85 ≈ **¥2,768/年**；3 年 $288.20/年（仅组织）。
- 硬件令牌（USB token）：附加项，价格在购物车流程中，页面未列静态价（美国运输/加急/国际运输三档）→ 未核实；粗略按令牌另付 $100–250 估算（聚合来源，非官方，见"未核实"）。

**D. 沃通（国内 CA）**
- 标准代码签名（Class 3）：¥3,488–3,588/年 ≈ $518–532/年 ≈ ¥3,488–3,588。
- EV 代码签名（Class 4）：¥4,288–6,888/年 ≈ $636–1,022/年。
- 价格比国际 CA 还贵，且不被 Windows 信任——双重失败。

**E. 不签名**：$0。

---

## 4. 国内个人开发者现实约束清单

1. **Azure 个人验证地理限制（硬性死刑）**：Learn 原文"Individual developers must be located in the United States or Canada"，且身份信息取自 Azure 账单账户（国家/地区为中国大陆即不符合）；服务区域只有 15 个全球 Azure 地域（含 East US、West Europe、Japan East 等），**无中国大陆/世纪互联区域**。→ A 路线对大陆个人不可行。
2. **无营业执照**：EV（Sectigo/DigiCert/SSL.com EV、Azure 组织验证、沃通全系）全部要求合法主体/营业执照；沃通购买页原文必须与营业执照一致；微软 CA/B 规则要求 CN=已验证法定实体名。个人只能走 **IV/OV 的个人验证**（SSL.com IV、Sectigo OV Standard）。
3. **国际支付**：Azure 必须付费订阅（个人国际信用卡开户，大陆发卡行是否可用未核实）；SSL.com/Sectigo 信用卡支付（接受大陆双币卡/虚拟卡情况未核实）；沃通等国内 CA 可人民币支付，但需营业执照且证书不受信。
4. **护照 vs 身份证**：Sectigo/SSL.com/AU10TIX 等验证机构普遍要求**政府签发证件（护照/驾照/身份证件）+ 地址凭证（水电单/银行账单/带地址证件）**；大陆身份证即便可扫，地址凭证与护照号匹配仍有障碍；具体是否接受中国护照通常取决于 CA 支持的国家列表——本调研未能从官方页核实逐一国家清单（未核实项）。
5. **电话核验**：SSL.com eSigner 验证完成条件含"对登记电话号码的回拨成功"；大陆 +86 号码是否支持未核实。
6. **硬件令牌物流**：Sectigo/DigiCert 传统路线私钥必须存 HSM/USB 令牌——需国际快递到中国（运费、清关、丢失风险），且 CI 自动化无法使用物理令牌（除云 HSM/KeyLocker 类，但 KeyLocker 面向组织）。
7. **国内 CA 信任破产**：微软可信根名单（2026-08-28）沃通、CNNIC 全部根 **Disabled**；即使收费便宜、人民币支付，签名链在 Windows 上无法验证，等同自签。
8. **声誉门槛（对所有签名路线一致）**：微软明确"签名文件首次下载仍可能警告，需哈希或证书积累足够声誉"，"可能需要数周和数百次干净安装"；EV 已不豁免。短期期望必须设为：**签名解决"未知发布者"展示，不解决"首次警告"**。

---

## 5. 推荐

**推荐：SSL.com IV 代码签名证书 + eSigner Tier 1（云 HSM）**
- 价格：证书 $129/年 + 服务 $180/年 = **$309/年 ≈ ¥2,082/年（约 ¥174/月）**，无任何硬件、无运输、无月租放大风险。
- 理由：唯一同时满足"个人验证（IV 真实存在）"+"云签名无需硬件令牌"+"CI 集成（GitHub Actions 官方支持）"+"根证书在微软信任名单（Included）"的方案；证书主体为个人姓名，SmartScreen 显示该姓名并随下载量积累声誉。
- electron-builder 集成：eSigner 走其 CLI/API（无原生 `azureSignOptions` 那样的配置项），在 CI 中签名后打 NSIS 包即可；现阶段 electron-builder `win.azureSignOptions` 仅适用于 Azure Artifact Signing（而该服务对本开发者地理上不可用）。
- 决策树：先与 SSL.com 客服确认两点（大陆个人可申请性、护照+地址凭证、+86 电话回拨、大陆发卡支付）→ 通过则下单；**若不通过或无国际卡：维持不签名（$0）**，并在用户文档中提示首次安装会看到"仍要运行"；中期可评估 Microsoft Store（微软重签名，永不触发 SmartScreen，需 MSIX + 开发者账户，成本另计）。
- 不建议：EV（微软明示"为免 SmartScreen 警告而付 EV 溢价不再合理"）；国内 CA（不受信）；Azure（个人地理限制）。

---

## 6. 未核实项（尝试过但没有官方数字/结论的内容）

1. **SSL.com eSigner 对中国大陆申请人的放行政策**：官方页面无国家/地区限制清单；电话回拨接受哪些国家区号、IV 验证接受哪些身份证件（护照 vs 身份证）未写明。尝试过：产品页、/pricing/、博客页、WP REST 端点均无此信息。
2. **SSL.com 接受哪些银行卡**（是否有大陆双币/银联 restrictions）：官方页面未列。
3. **SSL.com IV 证书主体字段细节**（是否含 Email、省市）：订购面板只列证书名与价格，未列 CN/OU 字段；其价目表（可类比沃通）未公开逐字段。
4. **SSL.com eSigner 的时间戳服务**是否为 DigiCert RFC3161（用户问题中假设）：eSigner 页面只提"SSL.com 云 HSM"与 FIPS，未提及 DigiCert 时间戳；属未确认（其现货订购面板也无此信息）。
5. **Sectigo USB 令牌价格 & 国际（非美国）运费**：官方店页面只显示"Token + International Shipping（non-US）"选项，无静态价格（在购物车结算才显示）。聚合网站常见"令牌 $100–250"为二手来源，列为此处备注，**非官方数**。
6. **DigiCert（含 KeyLocker）公开价格**：digicert.com 官方页面对本环境返回空内容（反爬/需登录），官方无公开价目表 → 价格未核实（且其 EV 仅组织、KeyLocker 主要面向组织，个人路径需要企业主体）。
7. **GlobalSign 公开价格**：globalsign.com/en/code-signing 页面无任何价格（销售咨询制）→ 未核实。
8. **Azure 个人订阅对中国大陆发卡银行/双币卡的接受度**：只核实了"必须付费订阅（免费/试用/赞助不可用）+ 账单账户类型须与验证类型匹配"；具体卡种国别限制未在官方页确认。
9. **中国大陆其他 CA（CFCA、GDCA、上海 CA）的个人代码签名证书**：CCADB 显示 CFCA/GDCA/上海 CA 有 Included 根（有受信潜力），但其"个人代码签名"产品是否存在、价格、发证流程均未核实（其官网未提供可直接抓取的价目；本次仅核实沃通案例即已证明该方向对个人/对 Windows 可信度双重不利）。
10. **沃通标准代码签名是否存在"个人"通道**：其价目页标题含"个人代码签名证书多少钱"（SEO 词），但价目表与购买页全部要求营业执照；是否存在客服渠道可开的"个人版"未逐一核实（结论仍以购买页原文为准）。
11. **汇率**：6.74 为 2026-08-28 open.er-api.com 参考汇率，非银行牌价或实时中间价，仅作粗算。

---

## 附：主要引用链接（抓取日期均为 2026-08-28）

- Azure Artifact Signing 定价页：https://azure.microsoft.com/en-us/pricing/details/artifact-signing/（Basic $9.99 / Premium $99.99 / 超量 $0.005；price data 内嵌于页面 HTML）
- Azure Trusted Signing 旧 URL 已跳转至上述 artifact-signing 页
- Learn「What is Artifact Signing?」：https://learn.microsoft.com/en-us/azure/artifact-signing/overview
- Learn「Quickstart: Set up Artifact Signing」（地理限制、地区表、个人验证流程、AU10TIX、证件要求）：https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart
- Learn「Artifact Signing FAQ」（付费订阅、不签发 EV、声誉累积、不可自定义 CN/O、不按比例计费）：https://learn.microsoft.com/en-us/azure/artifact-signing/faq
- Learn「SmartScreen reputation for Windows app developers」（EV 不再豁免、声誉建立、各证书类型警告行为、"hundreds of clean installs"、Artifact Signing 为官方推荐）：https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation
- electron-builder 26.15.3 本地 schema/实现：`node_modules/.pnpm/app-builder-lib@26.15.3_*/node_modules/app-builder-lib/scheme.json`（`WindowsAzureSigningConfiguration`）与 `out/codeSign/windowsSignAzureManager.js`（TrustedSigning PowerShell 模块 + EnvironmentCredential）
- SSL.com eSigner for Code：https://www.ssl.com/products/software-integrity/signing-service/（订购面板数据经该页自身 REST 端点 https://www.ssl.com/wp-json/wp/v2/pages/49146 读取：certs 数组 $129/$129/$349/$359，tier 数组、云 HSM、FIPS 140-2 L3、CI 支持）
- Sectigo 官方授权店（The SSL Store，DigiCert 子公司、获 Sectigo 授权运营）：https://sectigostore.com/code-signing/sectigo-code-signing-certificate 与 .../sectigo-ev-code-signing-certificate（$313.50 / $410.85、个人可 OV、EV 仅组织、强制 HSM/令牌）
- 微软可信根计划 CCADB「Included CA Certificate List」（As of August 28, 2026）：https://ccadb.my.salesforce-sites.com/microsoft/IncludedCACertificateReportForMSFT（沃通全禁用、SSL.com/Sectigo/DigiCert/GlobalSign 代码签名根 Included）
- 沃通价目表：https://www.wosign.com/price_code.htm ；购买页（营业执照要求）：https://buy.wosign.com/OVCodeSignPro.html ；根证书手动导入页：https://wotrus.com/download/winroot.htm
