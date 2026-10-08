# 飞书 CLI 与 DSH Desktop

## 一键安装 skills 与授权

在仓库根目录、交互式终端中运行：

```bash
pnpm run feishu:setup
```

这会调用飞书官方 CLI 安装向导：

```bash
npx --yes @larksuite/cli@latest install --lang zh
```

向导会安装官方 Feishu/Lark skills，并通过浏览器或手机确认应用配置和
用户 OAuth。完成后可用以下只读命令检查状态：

```bash
lark-cli whoami
lark-cli doctor
```

官方 CLI 的用户授权数据和 skills 由它自己管理；本仓库不会复制、打印或
提交 App Secret、token、OAuth 文件，也不会替换用户的 DSH 配置目录。

## 与 cc-connect 的区别

两条链路的身份不同：

- `lark-cli`：以当前用户身份操作飞书，并提供给 AI Agent 使用的官方
  skills。
- `cc-connect`：以飞书机器人身份接收消息，再把消息路由到 DSH Desktop。

因此，仅安装官方 CLI 不会自动配置 Desktop 的消息机器人。要启用消息
连接，请在 Desktop 的「设置 → 飞书消息连接」中配置机器人，或在隔离的
配置目录运行：

```bash
cc-connect feishu setup --project dsh-desktop
```

没有凭证时该命令会显示飞书二维码；扫码新建机器人后会把凭证写回指定的
cc-connect 配置。已有机器人可以使用 `--app app_id:app_secret` 绑定，但
不要把真实 Secret 写进 shell 历史、仓库或日志。

## 安全边界

- 测试和演示使用临时 HOME、临时配置目录和假 Secret。
- 不要把真实 `~/.cc-connect`、`~/.dsh` 或 `~/.dsh-desktop` 当作测试目录。
- 飞书应用授权范围由飞书后台控制；授权完成后可以用
  `lark-cli doctor` 检查连通性。
