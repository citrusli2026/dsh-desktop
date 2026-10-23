# 插件伴随窗口（开发契约）

`dsh-desktop` 可以为**已安装的插件**提供一个独立的桌面伴随窗口：主窗口最小化后仍留在屏幕上，主窗口
恢复/唤起时自动收起。能力是通用的，壳不认识任何具体插件（ADR 0043）。

## 插件怎么声明

在插件自己的 `package.json` 加一个字段：

```json
{
  "name": "dsh-whale-widget",
  "dsh": {
    "companion": {
      "route": "/dsh-whale/pet",
      "width": 560,
      "height": 620,
      "title": "小鲸鱼",
      "showOnMinimize": true
    }
  }
}
```

| 字段 | 必填 | 规则 |
|---|---|---|
| `route` | 是 | 以 `/` 开头的绝对路径；禁止 scheme、`//`、`..`、`?`、`#`、空白；≤ 200 字符 |
| `width` / `height` | 否 | 整数 240–1200；默认 480×600 |
| `title` | 否 | ≤ 80 字符；默认包名 |
| `showOnMinimize` | 否 | 默认 `true`；主窗口最小化时自动显示 |

插件还必须**真的提供这条路由**（例如通过 `ctx.webServer.register` 注册）。壳会在显示前探测：
4 秒内返回 2xx 且 `content-type: text/html` 才创建窗口，否则安静地不显示。

## 壳保证什么

- 只读扫描当前 Web profile 的 `node_modules/*/package.json`，不执行插件代码。
- 窗口 `sandbox` + `contextIsolation`，无 `nodeIntegration`，拒绝 `window.open`，导航/重定向锁定在
  声明路径。
- 只转发 Harness 的登录 token；其他查询参数不会带过去。
- 位置在主窗口所在显示器的右下角，多个伴随窗口依次错开；显示器变化会重新定位。
- 主窗口恢复、显示、隐藏、关闭时收起；应用退出时销毁。
- 桌面工具面板「伴随窗口」分组可手动开关。

## 伴随窗口里能做什么

预加载脚本只暴露两个方法：

```js
await window.dshCompanion.hide()       // 只隐藏自己
await window.dshCompanion.focusMain()  // 隐藏自己并聚焦主窗口
```

**没有** DOM 访问、`executeJavaScript` 或审批桥。需要用户确认的操作请回到主窗口完成——这是刻意的
安全边界，不建议扩展。

## 验证

```sh
node --test test/companion-policy.test.ts test/companion-discovery.test.ts
DSH_E2E_PACKAGED=1 pnpm exec playwright test e2e/companion.spec.ts --grep @smoke
```

端到端用例会用一个 fixture 插件声明两条路由（一条有页面、一条没有），验证：最小化后只出现有页面的
窗口、`focusMain` 能恢复主窗口、面板能再次打开，以及缺路由时不会出现透明残窗。

## 真实插件回归（发布门禁）

默认的 `e2e/companion.spec.ts` 用 fixture 覆盖通用契约。真实鲸鱼插件是第三方代码，pet 页也还没进
npm，所以 `e2e/whale-companion.spec.ts` 是 **opt-in** 的发布门禁，不进默认 CI：

```sh
pnpm run dist:dir
WHALE_PLUGIN_DIR=/path/to/prepared/dsh-whale-widget pnpm run test:e2e:whale
```

准备插件目录时，除了 `dsh.companion` 声明，pet 页还需要一层很小的桥：

- 加载 `widget.js` 前把 `dshwPet=1` 写进 URL，让挂件进入 pet 模式；
- 把 `window.whalePet.minimize` / `focusMain` 映射到 `window.dshCompanion.focusMain()`；
- 不要期待通用壳提供 `answerApproval`；审批仍在主窗口完成。

用例会走一遍：发现插件 → 最小化主窗口 → 伴窗出现（标题「小鲸鱼」、`−` 按钮可见）→ 点 `−` 恢复
主窗口并收起伴窗 → 面板「伴随窗口」再次打开/收起。截图落在 Playwright 的 `test-results/` 下。
