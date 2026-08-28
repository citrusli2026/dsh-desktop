# Release Notes（发布说明）

每个 tag 必须随发布提交一份 `docs/release-notes/v<tag>.md`——它是 GitHub Release
正文的唯一来源，**缺失时 release.yml 的 publish job 直接失败**（本目录即发布门禁）。

## 怎么写

1. 发版前运行脚手架生成草稿（带当前版本与模板结构）：

   ```sh
   node scripts/write-release-notes.mjs v0.1.1-rc.2.shell.9
   ```

2. 按模板更新内容：本次功能（面向用户的语言，说明解决了什么问题）、验证
   （单测/E2E/打包门禁/镜像）、英文摘要（English Summary）。安装与下载小节由
   CI 在发布时统一追加，不需要写进文件。
3. 草稿与 bump 一起提交；CI publish 时缺失或为空即报错。
4. 本地预览：`node scripts/write-release-notes.mjs check v<tag>`（退出 0 表示已就绪）。

## 命名与规范

- 文件名必须是 `v<完整版本号>.md`，与 tag 完全一致。
- 正文首行为 `# dsh-desktop v<版本号>`；不要包含签名/哈希（那部分由 CI 模板生成）。
- 中英双语：中文正文 + English Summary 段落。
