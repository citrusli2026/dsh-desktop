# 迭代计划：实时下载统计（服务端代理 + 缓存）

> 创建日期：2026-08-17
> 目标：让官网显示接近实时的 GitHub Release 下载数

## 背景

当前官网下载数来自静态 `release.json`，由 GitHub Actions 定时生成（每日两次 + Release 触发），数据有延迟。GitCode API 不提供下载计数，故只统计 GitHub 侧。

## 方案 C 设计

### 架构

```
用户浏览器 ←──fetch──→ Vercel Edge Network (缓存 5min)
                              │
                              └──miss──→ /api/downloads (Serverless Function)
                                                    │
                                                    └──fetch──→ GitHub API
                                                    │
                                                    └──Cache-Control: s-maxage=300
```

### 组件

| 文件 | 职责 |
|---|---|
| `site/api/downloads.js` | Vercel Serverless Function：代理 GitHub API，返回下载数据，边缘缓存 5min |
| `site/assets/app.js` | 前端：加载时先显示静态数据，异步 fetch `/api/downloads`，成功后刷新数字 |

### 缓存策略

- **服务端**：`Cache-Control: public, s-maxage=300, stale-while-revalidate=600` — Vercel Edge 缓存 5min，过期后允许在后台刷新
- **客户端**：每 30s 轮询一次，静默更新
- **回退**：API 失败时不报错，保留静态数据

### 请求路径

```
GET /api/downloads?repo=citrusli2026/dsh-electron-shell
→ {
  "tag": "v0.1.0-rc.6.shell.15",
  "generated_at": "2026-08-17T09:00:00Z",
  "assets": [
    {"name": "...dmg", "downloads": 12},
    {"name": "...exe", "downloads": 25}
  ]
}
```

### 边界处理

- GitHub API rate limit（60/h 未认证）：Edge 缓存兜底，即使 rate limit 也返回缓存数据
- GitCode：API 不返回 download_count，暂不支持；UI 标注"GitHub 统计"
- 网络失败：前端静默回退，不弹错误

## 实现步骤

1. [ ] 创建 `site/api/downloads.js` — Serverless Function
2. [ ] 修改 `site/assets/app.js` — 前端实时拉取
3. [ ] 修改 `site/vercel.json` — API 路由和缓存头
4. [ ] 本地测试 + 部署验证

## 预估

- API 端点：30min
- 前端集成：20min
- 测试调试：10min
- **总计：~1h**
