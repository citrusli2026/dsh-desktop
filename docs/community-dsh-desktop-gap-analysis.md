# 与高星 DSH 桌面端的差距与取舍分析

> 2026-08-29。基于 [community-dsh-desktop-research.md](community-dsh-desktop-research.md)（2026-08-28 全量调研,含主来源链接）与本日新增调研（dsh-market 安装机制、vibeinging Bundle Edition 预装策略、awesome-dsh-plugin 精选目录）。星数为 2026-08-28 采样。
> 产品策略更正（2026-08-30）：dsh-desktop 不预装社区插件；用户需手动安装 dsh-market 后再按需选择其他插件。

## 1. 同质化:骨架趋同,差异在"窗口之外"

30+ 个社区桌面端高度同质。几乎全部是同一骨架:**固定版本上游 dsh + 打包 Node 运行时 + Electron/Tauri 原生窗口加载 127.0.0.1 官方 Web UI**。窗口里大家长得一样(都必须如此——官方 Web UI 是公共面),真正的产品差异全部集中在窗口之外,收敛为约十个功能簇:

| 功能簇 | 谁在做 | 我们 |
|---|---|---|
| 插件市场/安装入口 | dsh-market(2.7k)、anywhere-labs(21.4k)、EAC(1.4k)、vibeinging(632) | ✅ 市场入口保留；社区插件改为全部手动安装(ADR 0029) |
| 代码签名/公证 | dataelement(3.0k)、vibeinging、liguobao | ❌ 最大信任缺口 |
| vision/画面捕获 | FuqiangCraft、Studio、EAC | ❌ 仅有规划 |
| 本地模型 | Minke(572)、Studio(548) | ❌ |
| 远程接入路线 | Minke(Tailscale×3)、dataelement(CF 隧道)、liguobao(APK) | 🟡 仅 LAN QR |
| 会话级 worktree | dsh-tauri-desk(1.3k)、vibeinging | ❌(可经插件覆盖) |
| 内核版本管理/双更新链 | qufei1993、EAC、dsh-tauri-desk | ❌ 随包固定 |
| 桌宠/游戏化 | myYangyunfan(597)、FuqiangCraft | ❌ |
| 余额/成本组件 | myYangyunfan、GeekRicardo | ❌ |
| 安全恢复体系 | EAC(快照回滚)、anywhere-labs(检查点)、dataelement(Safe Mode) | ✅ Safe Mode+恢复中心 |

结论:**"又一个套壳"没有生存空间**——同质化意味着用户只按信任度(签名)、开箱体验(预装/引导)、差异化功能三件事选。前两件是硬门槛,本轮已补第二件。

## 2. 我们有、别人没有的(应保持并放大)

1. **系统级全局召唤快捷键**——调研范围内无逐项对标者(唯一的 Alt+Space 规划自述未实现);
2. **LAN QR 配对 + 专用手机壳 dsh-mobile-shell** 的成对组合;
3. **三态原生通知**(完成/失败/需确认)——竞品最多做到完成态;
4. **一键诊断导出** + Safe Mode 疑似插件点名的组合;
5. **扩展入口浮层 + Harness 设置内同源"扩展设置"区**的形态;
6. **启动偏好**(开机自启/启动隐藏)几乎无人做全。

## 3. 值得做的(按投入产出比排序)

1. **macOS 签名+公证 / Windows 签名**——三家居高星项目已把签名做成发布门禁,是信任维度上我们与头部最大的差距;仓库已有两份调研(docs/windows-signing-*)可直接落地;
2. **余额/成本小部件**——低成本高感知(myYangyunfan 证明其拉新能力),可挂进托盘状态或通知体系;GeekRicardo/dsh-balance 已覆盖多提供方(MIT);
3. **内核版本管理+双更新链**——上游 rc 阶段破坏性变更频繁,qufei1993/EAC/dsh-tauri-desk 都为此做了产品化;我们的"每发布固定内核+恢复中心"已有半个答案,补"应用内装新内核到数据目录 overlay+失败回退"即完整;
4. **vision/画面捕获**——抄 FuqiangCraft 的"opt-in+截图回填会话"透明注入形态,不做静默截屏;
5. **诊断报告内只读预览**(PDF/CSV/JSON/YAML)——liguobao 证明十分钟级工作量;
6. **Tailscale Serve 第二远程路线**——Minke 已端到端验证,覆盖"不在同一局域网"场景;
7. **Agent Browser 人机共控**——Minke 旗舰,工程量最大,列长期路线。

## 4. 本轮已落地

- **社区插件安装**(ADR 0029):安装包不再预装 dshmarket、Better Sidebar 或任务看板;用户先从扩展设置手动安装 dsh-market,再按需从插件市场安装其他社区插件。ADR 0024 的首启预装仅保留为历史对比。
