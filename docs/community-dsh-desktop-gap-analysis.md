# 与高星 DSH 桌面端的差距与取舍分析

> 2026-08-29。基于 [community-dsh-desktop-research.md](community-dsh-desktop-research.md)（2026-08-28 全量调研,含主来源链接）与本日新增调研（dsh-market 安装机制、vibeinging Bundle Edition 预装策略、awesome-dsh-plugin 精选目录）。星数为 2026-08-28 采样。
> 产品定位收敛（2026-08-30）：dsh-desktop 是“可靠的 Electron 壳 + 开箱即用的支持”。不做 Agent 工作台；社区插件全部手动安装；签名、公证待实际使用量和反馈足够后再评估。

## 1. 同质化:骨架趋同,差异在"窗口之外"

30+ 个社区桌面端高度同质。几乎全部是同一骨架:**固定版本上游 dsh + 打包 Node 运行时 + Electron/Tauri 原生窗口加载 127.0.0.1 官方 Web UI**。窗口里大家长得一样(都必须如此——官方 Web UI 是公共面),真正的产品差异全部集中在窗口之外,收敛为约十个功能簇:

| 功能簇 | 谁在做 | 我们 |
|---|---|---|
| 插件市场/安装入口 | dsh-market(2.7k)、anywhere-labs(21.4k)、EAC(1.4k)、vibeinging(632) | ✅ 市场入口保留；社区插件改为全部手动安装(ADR 0029) |
| 代码签名/公证 | dataelement(3.0k)、vibeinging、liguobao | ⏸ 暂缓，待使用量与反馈评估 |
| vision/画面捕获 | FuqiangCraft、Studio、EAC | 🚫 不属于当前定位 |
| 本地模型 | Minke(572)、Studio(548) | ❌ |
| 远程接入路线 | Minke(Tailscale×3)、dataelement(CF 隧道)、liguobao(APK) | 🟡 仅 LAN QR |
| 会话级 worktree | dsh-tauri-desk(1.3k)、vibeinging | 🚫 不属于当前定位 |
| 内核版本管理/双更新链 | qufei1993、EAC、dsh-tauri-desk | ✅ 已有基础，继续收口恢复体验 |
| 桌宠/游戏化 | myYangyunfan(597)、FuqiangCraft | 🚫 不属于当前定位 |
| 余额/成本组件 | myYangyunfan、GeekRicardo | ✅ 已有基础，保持克制 |
| 安全恢复体系 | EAC(快照回滚)、anywhere-labs(检查点)、dataelement(Safe Mode) | ✅ Safe Mode+恢复中心 |

结论：不追求成为功能最多的桌面项目。dsh-desktop 的差异化是把官方 Harness 可靠地带到桌面，提供可验证、可恢复、少配置的开箱体验；社区插件保持手动安装，签名和公证暂不提前投入。只有直接改善可靠运行、安装、恢复或桌面使用的能力才进入当前路线。

## 2. 我们有、别人没有的(应保持并放大)

1. **系统级全局召唤快捷键**——调研范围内无逐项对标者(唯一的 Alt+Space 规划自述未实现);
2. **LAN QR 配对 + 专用手机壳 dsh-mobile-shell** 的成对组合;
3. **三态原生通知**(完成/失败/需确认)——竞品最多做到完成态;
4. **一键诊断导出** + Safe Mode 疑似插件点名的组合;
5. **扩展入口浮层 + Harness 设置内同源"扩展设置"区**的形态;
6. **启动偏好**(开机自启/启动隐藏)几乎无人做全。

## 3. 当前迭代方向(按优先级排序)

1. **开箱即用收口**——首启、异常 profile、独立/共享 `DSH_HOME`、代理、路径和多语言路径都能稳定工作；手动安装 dsh-market 的入口清晰可恢复。
2. **桌面壳完整性**——继续打磨托盘、窗口、单实例、快捷键、开机启动、通知、日志和诊断，不新增第二套 Agent 界面。
3. **运行时与恢复闭环**——完善内核 overlay、更新提示、失败回滚、安全模式和错误页，让用户不靠删除 profile 恢复。
4. **社区插件支持收口**——支持手动安装、卸载、更新、禁用、兼容性提示和失败恢复；不预装、不静默恢复、不建立壳自有插件平台。
5. **已有 LAN 连接维护**——完善配对、断开、过期和撤销；第二条远程路线只有在真实需求出现后再评估。

以下项目暂不进入路线：Agent 工作台、多 Agent、worktree 文件工作区、Agent Browser、Vision、默认屏幕捕获、本地模型平台、互联网远程控制、桌宠和游戏化。

签名与公证单独延后：等下载量、活跃使用量或用户反馈证明它是主要阻塞点后，再建立发布基础设施专项。

## 4. 本轮已落地

- **社区插件安装**(ADR 0029):安装包不再预装 dshmarket、Better Sidebar 或任务看板;用户先从扩展设置手动安装 dsh-market,再按需从插件市场安装其他社区插件。ADR 0024 的首启预装仅保留为历史对比。
