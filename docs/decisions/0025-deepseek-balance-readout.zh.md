# 0025:托盘与扩展设置中的 DeepSeek 余额展示

- 日期:2026-08-29
- 状态:已接受
- English:[0025](0025-deepseek-balance-readout.md)

## 背景

社区壳把余额/成本可见性当作低成本高感知的功能(myYangyunfan 的余额
小部件、GeekRicardo 的 dsh-balance 插件、AppliedYuu 的壁纸+成本合并
插件)。我们此前完全没有:用户想知道额度还剩多少,只能去 DeepSeek
开放平台网页看。

## 决策

- 壳从 harness 凭据存储(`.credentials.yaml` 的
  `refs.DEEPSEEK_API_KEY`)读取 DeepSeek Key,调用官方 user-balance
  API——按需拉取,五分钟缓存加在途去重;不做后台轮询;密钥除该 API
  外不离开主进程。
- 两个展示面:托盘一行(`余额：¥…`,点击打开 DeepSeek 平台充值页,
  位于 harness 状态之后),以及扩展设置区的一行只读余额加「充值」
  按钮。
- 未配置 Key、网络失败或响应异常 → 展示面直接消失。不报错、不出
  空状态噪音。

## 后果

- 正面:两大壳自有面上无需触碰 harness Web UI 即可看到余额;充值
  一步可达;
- 负面:仅支持 DeepSeek(多提供方仍是 dsh-market 生态的事);托盘
  行最多滞后一个缓存周期;首次拉取落地前打开的托盘菜单暂无该行。

## 备选方案

- 把 dsh-balance 作为种子 Bundle 预装:其 npm 包未声明 license 字段
  (0024 已因此拒绝),且与托盘原生一行功能重复;
- 后台轮询实现低额提醒:为未验证的价值持续花请求——推迟。
