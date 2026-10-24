# 0045: 重装插件市场时保持已启用

- 日期：2026-10-24
- 状态：已接受
- English: [0045](0045-market-reinstall-enables.md)

## 背景

扩展设置里的「安装插件市场」会调用随包 `dsh plugin --profile web add dshmarket`，
然后校验 `dshmarket` 是否在 profile 的启动清单里。上游的两处行为会让这个校验失败，
而命令本身仍然返回 0：

- `dsh plugin add` 只会启用**新增**依赖。当 profile 的 `dependencies` 里已经有
  `dshmarket` 时，pnpm 会保留已锁定的版本，reconcile 步骤也刻意不会重新启用这个
  保留下来的 bundle——退出码 0，启动清单没变。
- 声明的内核要求被当前 Harness 拒绝的依赖，只会打印告警并保持「已安装但不引导」
  （"profile startup denies it until you grant an exemption"）。同样是退出码 0。

现场 profile 正好漂移成了这个样子：`dshmarket@1.45.1` 要求
`@deepseek-ai/dsh-settings ^0.1.x`，随包内核是 `0.2.1-rc.2`，插件市场已安装、已锁定、
但不在启动清单里。壳返回的失败原因是 `profile`（「数据目录不可写或 profile 状态不
完整」），等于让用户去修一个与权限毫无关系的问题。

## 决定

- 安装插件市场时显式请求 `dshmarket@latest`。裸包名对已保留的依赖是空操作，旧版本
  锁定会一直原地不动。
- 安装成功后，如果启动清单里仍然没有插件市场，壳自己补上这一条
  （`dsh.profile.bundles`），依赖版本范围与包目录都不动。用的还是插件恢复动作已经在
  写的同一个文件和同一种原子写入，也就是既有「禁用」动作的逆操作——仍然只改一个字段，
  仍然由用户所有，仍然可以在 Harness 设置里撤销。
- 兼容性判定仍然归上游。CLI 明确说该包与当前内核不兼容时，安装返回
  `incompatible`，把那一行作为脱敏详情；绝不去启用一个下次启动会被跳过的 bundle。
- `profile` 保持字面含义（目录不可写、清单损坏、包缺失），修复建议才不会被带偏。

## 后果

- 重装插件市场可以自愈「已安装、已锁定、未启用」的状态，用户不必手改文件；已是最新
  版本时也不会多走一次网络。
- 内核比最新插件市场旧时，失败信息会直接给出可执行的 `dsh plugin allow-version`
  命令，而不是错误的数据目录提示。
- 删除仍以上游 reconcile 为准；壳只会补回用户明确要求安装的那一个 bundle。
