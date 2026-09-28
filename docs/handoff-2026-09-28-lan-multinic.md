# HANDOFF — #65 多网卡多二维码「完全支持」迭代（进行中，2026-09-28）

> 交接给下一个会话。目标（用户原话）：「65 多网卡多二维码增强,需要完全支持,再迭代一个版本」。
> 当前进度：**实现基本完成，验证进行到 dev E2E，尚有 2 个 LAN 用例未收敛**——这是本
> handoff 的核心上下文，接手后从这里继续。

## 背景与已完成

1. **#65 的两项已在 v0.1.7-rc.2.shell.1 发布**：CGNAT 入私有段 + VPN 网卡排名提升
   （shell.4）、配对窗口多地址二维码（同版）。本迭代补齐报告人钉的另外两件：
   **同时监听多网卡** 与 **同屏多二维码**，外加 **网卡勾选**。
2. **mobile-shell（../dsh-mobile-shell，已提交 7a1e44c，未推送）**：
   - `proxy/dsh-remote.mjs`：`DSH_LAN_IPS`（逗号分隔地址表）→ 每地址一个完整
     server（handlers 内含），共享 device store；无 DSH_LAN_IPS 时回退单
     `DSH_LISTEN_HOST`。
   - `proxy/pairing-qr.mjs`：`discoverPublicBases` 接受 `listenHosts` 显式列表，
     每地址一个 pairing base。
3. **dsh-desktop（本仓库，工作区未提交）**：
   - `src/main/lan.ts`：`resolveLanListenHosts()`（偏好勾选 > `DSH_LAN_IP`
     单/逗号/0.0.0.0 > 自动候选）；多候选时 `DSH_LISTEN_HOST='0.0.0.0'`（proxy
     通配 = 全网卡同时可达）且 baseUrl 走 `127.0.0.1`；`LanPairing` 新增
     `pairingUrls: string[]`（proxy 按每绑定地址枚举，全部通过 origin 校验）。
   - `src/main/index.ts`：`desktop:lan-interfaces` IPC（枚举 IPv4 私有地址）；
     preferences sanitizer 放行 `lanListenAddresses`；偏好更新后若 LAN 在运行
     则自动 stop+start 使新监听集立即生效。
   - `src/preload/index.ts`：`listLanInterfaces` 桥。
   - `plugins/dsh-desktop-controls/lib/client.js`：桌面设置「连接移动设备」行下
     新增网卡勾选 UI（`LanNicSection`），绑定 `lanListenAddresses` 偏好。
   - `src/main/shell-preferences.ts` / `desktop-preferences.ts`：
     `lanListenAddresses?: string[]` 字段与 update 分支。

## ⚠️ 进行中的问题（接手后第一件事）

**dev E2E 有 2 个 LAN 用例失败**（`/tmp/e2e-y.log`，14 passed / 2 failed）：
`LAN pairing shows a scannable QR link` 与 `LAN pairing completes from QR`。
现象：测试超时，**proxy 进程在首个请求上崩溃**（`ReferenceError: handle is
not defined`——dsh-remote.mjs:761 的 `handleRequest` 引用 `handle`，而另一会话
提交的版本把 `async function handle` 声明在了 for 循环块**内部**，块作用域对
handleRequest 不可见）。

**已验证有效的修复**（2026-09-28 手工验证通过，但尚未提交）：
`for` 循环只保留 `const server = ...` 创建行；`async function handle`
**整体提升到模块级**（handleRequest 之前）。提升后单主机 healthz 200、双地址
（127.0.0.1 + 192.168.1.26）两台服务器 banner 齐全、bases 枚举正确。

> 我在多次尝试中把文件改出过几种损坏状态。**接手后若文件状态可疑，直接
> `cd ../dsh-mobile-shell && git checkout -- proxy/dsh-remote.mjs
> proxy/pairing-qr.mjs` 回到干净基线，然后按本节描述重新套用修复**
> （修复本质：handle 提升出循环；creation 留在循环内；循环体 =
> creation + handlers 附着 + listen + startup；无 DSH_LAN_IPS 时
> LISTEN_HOSTS 空数组需回退 `[LISTEN_HOST]`——注意这个回退在 for 循环
> 头部，别在 servers map 里映射空数组）。

## 接手步骤

1. **套用/确认 handle 提升**（见上节 ⚠️），`node --check` + 手工双地址冒烟
   （参考本节冒烟命令：`DSH_LAN_IPS='127.0.0.1,<LAN IP>' DSH_LISTEN_PORT=3894
   node -e ...`，两个地址各 fetch `/healthz` 应 200）。
2. `npm run package:web`（mobile-shell 仓库）→ `pnpm run bootstrap`（本仓库）
   → resources 再 stage。
3. dev E2E 复跑：此前 2 个 LAN 用例失败的直接原因是 proxy 崩溃（上述
   ReferenceError），handle 提升后应转绿；若仍有失败，读
   `/tmp/e2e-y.log` 与 trace。
4. 打包侧全门禁：300 单测、三冒烟（含 SAFE_BREAK 与 DSH_SMOKE_CLOSURE）、
   sign-in / trash / market offline+real、LAN QR 2/2。
5. 发版 `v0.1.7-rc.2.shell.2`：notes 要点 = #65 完全支持（多网卡同时监听 +
   同屏多二维码 + 网卡勾选）+ #79 macOS 封印修复 + 登录流 E2E；tag 推双远端；
   CI；GitCode 镜像（**平台附件 404 故障持续，见 §60-65，工单待提**）；官网
   数据刷新；HANDOFF §66 补 shell.2 小节；回复 #65/#79 关闭确认。

## 相关文件

- `../dsh-mobile-shell/proxy/dsh-remote.mjs`（多地址监听，7a1e44c 已提交部分 +
  工作区 handle 提升待套用）
- `../dsh-mobile-shell/proxy/pairing-qr.mjs`（listenHosts 参数，已提交）
- `src/main/lan.ts`（resolveLanListenHosts / 多监听 / pairingUrls）
- `src/main/desktop-preferences.ts` + `src/main/shell-preferences.ts`
  （lanListenAddresses 字段与分支）
- `src/main/index.ts`（lan-interfaces IPC / sanitizer / LAN 自动重启）
- `plugins/dsh-desktop-controls/lib/client.js`（LanNicSection 勾选 UI）
- `e2e/electron-shell.spec.ts`（两个 LAN 用例，多地址契约已更新）
