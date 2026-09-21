# Cutimg 上线与暂停说明

## 当前状态

当前工作树中的 `functions/_middleware.js` 设置了：

```js
const SERVICE_PAUSED = true;
```

因此，如果这份代码重新部署到 Cloudflare Pages，所有新请求都会先收到 `503 Service Unavailable`，不会加载静态页面、图片处理脚本或 `/api/country`。中国大陆地区的 `CN` 拦截逻辑仍保留在同一个中间件中。

当前 Cloudflare Pages 项目已由维护者删除；本地代码不会自动恢复线上地址。

## 重新开放前的检查

1. 补齐 [PRIVACY.md](PRIVACY.md) 中的运营主体、联系邮箱、适用法律和用户权利渠道。
2. 核对 [NOTICE.md](NOTICE.md) 中 logo、示例图和文案的权利来源。
3. 确认 Cloudflare 账户开启双重验证，GitHub `main` 分支有保护规则，且没有把 API Token 或密钥写入仓库。
4. 执行 `npm test`，再进行一次真实浏览器回归。
5. 只有确认要开放时，才将 `SERVICE_PAUSED` 改为 `false`，并重新审阅地域拦截、隐私声明和安全响应头。

## 关闭方式

临时关闭：保持 `SERVICE_PAUSED = true` 并部署；这是可恢复的应用层暂停。

彻底删除：在 Cloudflare 删除 Pages 项目。删除项目不会删除 GitHub 仓库，但可能影响项目地址、部署记录和后续恢复，应先保存需要的配置和产物。

## 限制

应用层暂停依赖 Cloudflare Pages Functions。若改用 GitHub Pages 等纯静态托管，`functions/_middleware.js` 不会执行；需要在新托管平台使用其访问控制或防火墙能力重新实现暂停和地域限制。
