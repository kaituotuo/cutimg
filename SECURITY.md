# Cutimg 安全说明

## 当前安全边界

Cutimg 当前没有账号、数据库、服务端图片上传或生产密钥。图片处理在浏览器内完成，线上代码由 GitHub 仓库和 Cloudflare Pages 发布权限共同控制。

## 维护者检查项

- GitHub 和 Cloudflare 账户启用双重验证或 Passkey。
- 限制仓库协作者和 Cloudflare API Token 权限；不在仓库、截图或前端代码中放置密钥。
- 保护 `main` 分支，发布前审阅 Pages 部署记录和提交来源。
- 保留 `_headers` 中的安全响应头，并在新增第三方脚本、统计或上传功能前重新评估内容安全策略和隐私说明。

## 报告问题

不要在公开 Issue 中上传用户图片、访问令牌或其他敏感信息。正式上线前，请将维护者的安全联系邮箱补充到本文件；如果仓库启用了 GitHub Security Advisories，优先使用私密报告渠道。
