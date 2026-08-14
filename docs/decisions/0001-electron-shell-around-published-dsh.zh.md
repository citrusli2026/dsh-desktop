# 0001:用 Electron 壳包裹已发布的 @deepseek-ai/dsh,功能保持不变

- 日期:2026-02-09
- 状态:已接受

## 背景

DeepSeek Harness(`dsh`)是 MIT 开源的 agent 框架,已发布到 npm:`npx @deepseek-ai/dsh web`
即可在 `http://127.0.0.1:3080` 启动完整的 Web UI(React 前端 + 本地 HTTP/WebSocket 服务端)。
需求是给用户一个"下载即用"的桌面应用,同时**所有 agent 功能与上游保持一致**,壳本身也开源。

## 决策

Electron 壳不做任何 agent 功能的二次实现:

- 壳只负责:窗口、harness 子进程监督(启动/就绪/重启/优雅退出)、托盘、日志、自动更新;
- 壳内运行的就是 npm 上发布的 `@deepseek-ai/dsh` 原包(精确 pin 版本),启动 `dsh --profile web --port 0`;
- 渲染进程直接加载 harness 就绪后提供的本地回环 URL,复用上游 Web UI 的全部功能
  (对话、设置、API key 配置、会话管理等),壳不新增任何配置界面。

依据(来自上游代码的调研):

- `apps/cli` 的 web profile = `dsh-base` + `dsh-web-app` 两个 bundle 的 cordis patch 组合;
- WebServer 支持 `--port 0`(OS 自动分配端口),且 `--host 0.0.0.0` 被上游刻意禁用,
  只允许回环绑定,天然适合桌面壳;
- 启动就绪信号是 stdout 的一行 `dsh web: http://127.0.0.1:<port>`,
  上游代码注释明确说明该行是给 supervisor 的就绪信号;
- API key / 模型 / provider 均在 Web UI 设置页配置,数据存于 `DSH_HOME`(默认 `~/.dsh`)。

## 后果

- 正面:功能与上游逐字节一致;上游每次发版,壳只需 bump 一个版本号;安全边界由上游维护;
- 负面:壳无法做"原生窗口级"的深度集成(如 OS 通知逐条定制),这是有意的取舍;
  上游 rc 版本可能 breaking,壳需要跟随节奏(见 0004)。

## 备选方案

- 在 Electron 里重写一套原生 UI:工作量大且功能必然滞后,违背"功能保持不变",否决;
- 壳仓库直接依赖上游 git 源码:上游为 pre-release,源码节奏不可控,npm 发布包才是官方消费面,否决。
