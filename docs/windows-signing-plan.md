# Windows 代码签名:决策与实施规划

> 决策日期:2026-09-18 · 触发:Windows 安装器累计下载 **2,030**(占全平台 75%,总安装器 2,691)
> 证据基础:三份既有调研(2026-08-28,全部主源核实,本文不重复论证):
> [windows-signing-analysis.md](windows-signing-analysis.md)(社区 11 项目做法)、
> [windows-signing-cost-comparison.md](windows-signing-cost-comparison.md)(Azure/SSL.com/Sectigo/沃通费用与可行性)、
> [windows-signing-options-comparison.md](windows-signing-options-comparison.md)(Certum/SignPath/Store 补充与推荐排序)。
> 本文回答的问题:**现在签不签、签哪个、怎么接进我们的流水线、谁做什么、怎么验收。**

## 1. 决策:现在开始签,按"SignPath(免费)→ Certum(¥391/年)→ SSL.com(备胎)"顺序执行

ADR 0030 把签名押后到"使用量足以覆盖成本"。三个触发条件现在的状态:

| ADR 0030 触发条件 | 现状 | 判定 |
|---|---|---|
| 使用量足以覆盖证书与维护成本 | Windows 2,030 下载;Certum 约 ¥391/年 ≈ 每千下载 ¥0.2 量级;SignPath 为 $0 | ✅ 满足 |
| 用户反馈把 SmartScreen 当主要流失原因 | issue 里**没有**直接的 SmartScreen 投诉;但 #39(杀软损坏 node.exe)证明信任摩擦真实存在,且**沉默流失不可见**——未签名状态下用户可能根本不开 issue 就走了。Win11 Smart App Control 会直接拦截无声誉可执行文件,影响面在扩大 | ⚠️ 无直接证据,但不等了 |
| 稳定的预算、证书主体、可持续 CI 签名环境 | 个人开发者;SignPath $0 或 Certum €49/年;CI 路线已有社区可复现实证 | ✅ 满足 |

**决定**:启动签名。理由不是"有投诉了",而是三条新事实:① 使用量已到临界点,SmartScreen 首装警告对每个新 Windows 用户都在发生;② 免费路线(SignPath)出现了, previously 的"成本覆盖"论据不再成立;③ 不签名的代价在升级(Win11 SAC 拦截是硬拦截,不是"多点一下")。**任何情况下不为 EV 付费**(微软已明确 EV 不再豁免 SmartScreen)。

## 2. 执行顺序(命中即停,预计总耗时 1–3 周日历时间,大部分在等第三方)

### 第一步:SignPath Foundation 申请(成本 $0,本周发出)

- **资格现状**:三份调研标记的最大风险是"捆绑 @deepseek-ai/dsh 预编译内核可能算专有组件"。已核实:**内核 MIT 许可、公开仓库(deepseek-ai/deepseek-harness)**——项目全部组成均为 OSI 开源,无专有代码。剩余问题只是"捆绑的第三方 MIT 组件是否要求本项目维护"——这是申请前必须**书面问 Foundation** 的问题,不是自我否决的理由。
- 需要接受的现实:发布者显示为 **SignPath Foundation**(不是项目名,不是个人名);每次发布需人工点一次 Approve(单人项目一人三角色,需向 Foundation 确认接受)。
- 动作(维护者):填 signpath.org/apply 表单 + 邮件问捆绑认定 + 单人三角色确认。准备材料:仓库地址、MIT LICENSE、README、code signing policy 页(我来起草)。
- 不通过/两周无回复 → 第二步。

### 第二步:Certum Open Source 云签(约 ¥391/年,并行准备)

- 调研已核实:个人可远程办理(证件照 + 名下账单,1–3 天签发)、云签名无硬件、5 个根全部在微软信任名单、CI 有可复现实证(`dismine/windows-app-signing-setup-action`:windows runner 装 SimplySign Desktop + TOTP 自动登录 + signtool)。
- 主体:`Open Source Developer <真实姓名>`;**非商业分发限制**(我们免费开源,成立);459 天有效期规则意味着**每年重新签发一次**(期内免费重发)。
- 动作(维护者):欧元店下单(避开美元店缺货页)、PayPal/国际卡支付、护照 + 名下账单远程验证。**先决未核实项**:大陆证件是否被 Certum 自动验证接受——下单前用其 support 渠道问一次。
- 两条路都失败 → SSL.com(≈¥2,082/年,客服先确认大陆证件/回拨/卡)或继续不签名 + 用户文档提示(兜底,见 §6)。

### 并行(不阻塞 1–2):Microsoft Store 渠道评估(中期项)

- 个人开发者账户 $0($19 已豁免)、商店应用由微软重签**永不触发 SmartScreen**——这是唯一"零警告"路线。
- 但它不解决 GitHub Releases 直装路径,且需要 MSIX 打包实测 + 商店版禁用 electron-updater + 每版过审。**列为独立中期工作项**,不与签名互斥,不在本轮实施。

## 3. 技术集成方案(维护者拿到证书后,全部由代理执行)

### 3.1 SignPath 路线(服务端后置签名)

1. 仓库安装 SignPath GitHub App(来源验证由 GitHub 提供元数据,防伪造)。
2. `release.yml` Windows 构建产出未签名 NSIS → 新增签名 job:官方 `SignPath/github-action-submit-signing-request`,策略限定 `v*` tag 构建;**签名成功是 publish 的前置条件**(照搬 dataelement 模式)。
3. 签名后必须**重建 blockmap 与 latest.yml**(electron-builder 的差分更新描述基于原文件;后置签名改变文件哈希)——新增 `scripts/finalize-signed-windows.mjs`,并把该重建逻辑纳入 8 资产契约校验(`check-release-assets` 不变,数据由重建保证)。
4. `electron-builder.yml`:`win.publisherName: "SignPath Foundation"`(一次性钉住,之后永不再换,见 §4);`verifyUpdateCodeSignature` 保持默认 true。
5. 冒烟加固:Windows 冒烟新增 `Get-AuthenticodeSignature` 断言(签名有效 + 主体匹配),未配置签名环境时跳过。

### 3.2 Certum 路线(runner 内签名,electron-builder 原生)

1. Windows runner 安装 SimplySign Desktop MSI(files.certum.eu 官方包,SHA-256 固定)+ `dismine/windows-app-signing-setup-action` 三个 secret(username / TOTP URI / key-id)。
2. `electron-builder.yml`:`win.signtoolOptions.certificateSubjectName: "Open Source Developer <姓名>"` + `publisherName` 同值——electron-builder 自己调 signtool,**签名在打包内完成,blockmap/latest.yml 无需重建**,发布链改动最小。
3. 时间戳用默认 `http://timestamp.digicert.com`(RFC 3161)。
4. 同 §3.1 第 5 点的签名冒烟断言。

### 3.3 两条路线共同的发布链事实

- 8 资产契约、GitCode 镜像、官网数据、资产校验脚本全部不变(签名不改变资产文件名)。
- secrets 管理:签名凭据只进 GitHub Actions secrets;证书主体信息一旦上线写进 HANDOFF,**永不变更**(变更 = 全体用户重装)。
- 工作量估算:SignPath 约 0.5 天(GitHub App + Action + 重建脚本);Certum 约 1 天(action 集成 + 配置);均含文档。

## 4. 升级链与用户过渡(必须一次做对)

1. **unsigned → signed 过渡**:现有未签名安装经 electron-updater 升级到签名版没有旧签名可冲突,直接可升级;SmartScreen 会对第一个签名版本再警告一次,之后进入声誉积累(微软口径:数周 + 数百次干净安装;cert 主体不变则跨版本延续)。
2. **publisherName 是单行道**:一旦发布签名版,`publisherName` 与证书主体永不再改。将来若从 SignPath 换 Certum(或反向),主体变化 = electron-updater 拒装 + SmartScreen 重新积累,**必须避免**——所以 §2 的顺序要想清楚再出手,不建议先用 SignPath 试用再换 Certum。
3. **发布说明模板**:签名后首个版本的 release notes 增加一段"已签名,发行者显示为 X;首次安装可能仍有一次 SmartScreen 提示,属正常声誉积累"。

## 5. 风险与未核实项(继承三份调研的清单,只列影响决策的)

| 风险 | 影响 | 缓解 |
|---|---|---|
| SignPath 对单人三角色 / 捆绑 MIT 内核的认定 | 免费路线是否成立 | 申请前书面确认;不通过走 Certum |
| Certum 自动验证是否接受大陆身份证/护照 | ¥391/年路线是否成立 | 下单前 support 渠道问一次;拒绝则 SSL.com |
| Certum 非商业条款 | 未来若有商业化动作需换证书(主体变更 = 用户重装) | 届时平移 SSL.com/Standard 档;接受一次性过渡成本 |
| 签名后首装仍有数周警告(所有非 Store 路线) | 用户预期管理 | 发布说明明示;不承诺"零警告" |
| 459 天年度重签(CSC-31 新规) | 每年一次人工签发流程 | 写进巡检自动化的年度提醒项 |
| SignPath 服务可用性 / 条款单方变更 | 发布被卡 | 证书本体在其 HSM,极端情况下按 §2 顺序平移;发布链有未签名兜底路径(关 secret 即回退) |

## 6. 兜底(所有路线失败时)

维持不签名($0),但补两件现在就该做的事(无论签名与否):

1. README/FAQ/下载页明示:"未签名,首次安装点「更多信息 → 仍要运行」;Win11 开启 Smart App Control 的机器需在设置中放行"——这是当下 2,030 个 Windows 用户正在经历的摩擦,一行文档就能降低流失。
2. 下载页把 GitCode 镜像排在前面(已有)并保留 sha256 校验指引,让"信任"有非签名的替代物。

## 7. 验收标准

- [ ] SignPath 申请已提交(含捆绑认定询问),或 Certum 下单完成—— whichever 先发生。
- [ ] 证书主体确定后:`publisherName` 写入 electron-builder.yml 且进入 HANDOFF"永不变更"清单。
- [ ] release.yml:Windows publish 以签名为前置;签名产物过 `Get-AuthenticodeSignature` 冒烟断言。
- [ ] 首个签名版本发布后:连续两个版本 electron-updater 升级冒烟通过(签名链上差分更新不受影响);GitHub 与 GitCode 资产逐字节一致(镜像校验已有)。
- [ ] README/FAQ 更新签名状态与首装提示。

## 7b. 补充问答(2026-09-18,应用户问)

**Certum 对中国大陆个人的可行性(2026-09-18 网络核实)**

- ✅ 官方自动身份验证[support.certum.eu](https://support.certum.eu)支持 **180+ 国家证件**,实时核验证件真伪与人脸。
- ✅ 证件硬要求是**拉丁字符**:中国**护照**(姓名为拼音)满足;纯中文的身份证大概率不满足 → 准备护照。
- ✅ 中国开发者成功先例充分:V2EX 一手帖(2024-01,含 SimplySign Desktop 签名实操)、[blog.irain.in](https://blog.irain.in) 全流程、CSDN"开源代码签名证书 2024 申请实战";Certum 有官方中文站([certum.cn](https://www.certum.cn))与中文教程——中文服务本身即对大陆用户敞开的信号。
- ✅ 库存与渠道(当日实测):**欧元店 shop.certum.eu "Open Source Code Signing in the Cloud" €49 在售**;美元店 certum.store 缺货——只走欧元店。
- ⚠️ 残余未知(不影响"能办",只影响"顺不顺"):App 自动验证对 +86 手机号的接受度、护照自动通过率(180+ 国家≠逐国自动通过,可能回落到远程人工核验,同样可办)。发一句 support 问题确认即可,模板保留在 §9 阶段 0。

**免费路线(SignPath Foundation)现有哪些项目?小项目能行吗?**
名录共 **332 个项目**(signpath.org/fdn-website 数据源,2026-09-18 抓取):知名的有 Vim、Stellarium、Flameshot、Git Extensions、Mumble、Tiled、Zero Install、Bloxstrap、Starward;同时有大量单人小工具(如 OpenModScan——单人维护的 Modbus 扫描器)。**Electron 应用有直接先例**(irDashies、Motrix Next、PoE Overlay Community Fork、Sokuji 等 5 个)。许可证分布 GPL 160 / MIT 97 / Apache 27——MIT 是主流之一,我们的 MIT 毫无违和。条款要求的"活跃维护 + 已发布 + 有文档"我们(55 个发布、2,691 下载)超过名录里相当一部分项目。真正的两个未知数仍是:捆绑第三方 MIT 内核的认定、单人三角色——申请时书面问。

**Certum 是一年有效期吗?**
是。CA/B 论坛 CSC-31 新规(2026-02-27 起)单张代码签名证书最长 459 天,Certum 按 1 年卖;多年期付款改为期内免费重发,但**每年要重新走一次签发流程**(要不要重交身份材料未核实)。已列入巡检年度提醒。

**有频次限制吗?反复打包反复签行不行?**
- Certum SimplySign 云签:官方上限 **5,000 签名/月**。我们每个 Windows 版本签 1–2 个文件,一个月发 20 版也才 40 次,差两个数量级;超限后果是"可能当月封禁"(官方原文)。反复打包、反复发版,都能签。
- 但注意:**签名发生在 CI 的发布流程里**,本地 `pnpm run dist:dir` 的构建默认不签(凭据只在 GitHub secrets)。Certum 理论上可装 SimplySign Desktop 在本地签,但每次要手机 App 生成访问码人工登录——自动化的只有 CI。
- SignPath Foundation:调研未记录签名次数上限(未核实),但它要求**每次发布人工点一次 Approve**。对我们一周数发的节奏,这个人工环节是比签名次数更实际的约束——**如果在意"反复发版全自动",Certum(€49/年)路线反而更顺**;SignPath 的价值纯粹是省这 ¥391/年。

## 8. 给维护者的三个动作(现在就可以做)

1. **发 SignPath 申请**(10 分钟):signpath.org/apply;两句话说明项目 + 附仓库链接;单独问两点——捆绑第三方 MIT 内核的认定、单人兼任三角色。
2. **问 Certum 一句话**(5 分钟):support.certum.eu 提交"中国大陆身份证/护照 + 名下账单,能否走 Open Source 自动验证"。
3. **决定支付通道**:PayPal 或国际卡是否可用(两家的支付下限)。

这三步的结果直接决定走哪条路线;技术集成在证书到手后由代理一天内完成。

---

## 9. Certum 全流程 runbook(分工版,2026-09-18)

标记:🧑 = 必须人工(法律身份/资金/手机绑定/凭据),🤖 = 代理可完成,🧑🤖 = 人工提供值、代理执行或给逐条命令。

### 阶段 0:下单前确认(当天)

| # | 谁 | 动作 |
|---|---|---|
| 0.1 | 🧑 | ~~确认大陆证件可办~~ **已于 2026-09-18 网络核实(见 §7b)**:路线成立;仍建议花 5 分钟向 support 发一句确认护照自动验证,模板见下。 |
| 0.2 | 🤖 | 探测 shop.certum.eu / certum.store 的 "Open Source Code Signing on SimplySign"(€49)库存状态(美元店曾缺货,认准欧元店)。 |
| 0.3 | 🧑 | 确认支付通道:PayPal 或双币卡(eCard 通道支持卡/PayPal/Google Pay/Blik)。 |

预售问题模板(提交到 support.certum.eu,粘即用):
> I am a software developer residing in mainland China (citizenship: PRC, ID card and passport available; a utility bill in my name is available). I would like to purchase the "Open Source Code Signing on SimplySign" certificate. Can the (automated) remote identity validation accept PRC documents and a Chinese phone number for the callback/app verification? If automated validation is unavailable for PRC documents, which manual option would apply and what additional documents do you require?

### 阶段 1:购买与验证(签发 1–3 个工作日,全部人工)

| # | 谁 | 动作 |
|---|---|---|
| 1.1 | 🧑 | 注册 shop.certum.eu 账户(邮箱)。 |
| 1.2 | 🧑 | 下单 **Open Source Code Signing on SimplySign**(€49,无硬件)。订单要求提供"在维护的开源项目网址"——填 `https://github.com/citrusli2026/dsh-desktop`,你的提交历史即关联证明。 |
| 1.3 | 🧑 | 支付。 |
| 1.4 | 🧑 | 身份验证:证件照(护照/身份证正反面)+ 名下账单(不早于 13 个月)+ 可能的手持照;远程完成,1–3 天签发。 |
| 1.5 | 🧑 | 激活 SimplySign:手机 App + 云账户;在 App/账户设置里找到 **TOTP 认证器 URI(otpauth://…)**——CI 自动登录靠它。 |

### 阶段 2:交付物收集(10 分钟)

签发后你手里会有四个值:

1. 证书主体 CN(SimplySign 面板/证书详情,形如 `Open Source Developer <你的姓名>`);
2. SimplySign 用户名;
3. TOTP URI(otpauth:// 开头);
4. 证书 key id(SHA1 指纹)。

🧑 **安全约定:这四个值不要发进聊天/issue。** 在你自己的终端执行我给出的逐条 `gh secret set` 命令(值走你本机),或在 GitHub 网页 Settings → Secrets and variables → Actions 手工添加。secret 名:`CERTUM_USERNAME` / `CERTUM_OTP_URI` / `CERTUM_KEY_ID` /(`CERTUM_SUBJECT` 不是机密,可直接告诉我用于配置)。

### 阶段 3:CI 集成(纯 🤖,约半天)

1. `release.yml` Windows job:缓存并安装官方 SimplySign Desktop MSI(files.certum.eu,SHA-256 固定)→ `dismine/windows-app-signing-setup-action` 用三个 secret 自动登录 → 证书进系统证书库。
2. `electron-builder.yml`:`win.signtoolOptions.certificateSubjectName` 与 `publisherName` 设为你的真实主体(**一次性钉死,之后永不变更**);时间戳 `http://timestamp.digicert.com`(RFC 3161,electron-builder 默认)。
3. 回退设计:secrets 不存在时构建保持未签名(存在性判断),无证书环境/兜底路径不炸。
4. Windows 冒烟新增 `Get-AuthenticodeSignature` 断言:签名有效 + 主体匹配;未配置环境跳过。
5. 文档:README/FAQ 加"已签名 + 发行者显示 + 首装可能仍有一次 SmartScreen 提示(声誉积累期)";发布说明模板同。

### 阶段 4:验证与首签发布(纯 🤖,约一天)

1. main dispatch 全量验证(含 Windows 残留矩阵 + 新签名断言)。
2. `bump shell` → 首个签名版 tag;盯 release.yml 全绿;镜像/官网/HANDOFF 照常。
3. 巡检自动化追加年度项:证书 459 天到期前 30 天提醒重签。

### 时间线与限制

- 日历时间约 **3–5 天**(大部分在等 Certum 签发);代理工作量 ≈ 1.5 天。
- 硬性人工项(无法替代):支付、证件与人脸、手机 App 绑定(TOTP 种子只在你手机)、secrets 值的录入。
- 主体字符串 = 智能合约:上线后改主体 = electron-updater 拒装 + SmartScreen 声誉清零,下发前我会和你核对两次。
