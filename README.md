# cutimg

一款将图片精准分割成矮图的在线工具。它是纯静态网页，图片只在浏览器本地处理，不会上传到服务器。

## 功能

- 支持 PNG、JPG、WebP 的拖放、选择和粘贴，并提供内置示例长图。
- 支持按目标高度或张数等高分割；数值可以直接输入，也可以使用步进按钮调整。
- 支持手动添加、拖动、键盘微调和删除分割线，并提供撤销与重做。
- 图片默认以不超过 50% 的比例完整适配预览区，仍可继续缩放检查细节。
- 每张切片可单独下载为 PNG，也可以一次打包下载 ZIP。
- 导出保持原图宽度，切片之间没有缩放、重叠或空缺。

浏览器处理超大图片时受设备内存和 Canvas 限制。当前输入上限为 100 MB / 1.8 亿像素，ZIP 最多包含 100 张；单张输出超过 16,384 px 或 6,500 万像素时需要继续分割。

## 本地运行

```bash
python3 -m http.server 4173
```

打开 `http://127.0.0.1:4173/`。项目没有构建步骤、后端服务或环境变量。

## 测试

核心逻辑测试不需要安装依赖：

```bash
npm test
```

浏览器回归使用 Playwright 和仓库自带示例图：

```bash
npm install
npx playwright install chromium
npm run test:browser
```

## 静态部署

可直接部署到 Cloudflare Pages、GitHub Pages 或其他静态托管平台。发布根目录就是仓库根目录，不需要填写构建命令；请保持 `index.html`、`styles.css`、`app.js`、`core.js` 和 `assets/` 的相对目录结构。

图标使用 Lucide，授权信息见 `assets/lucide.LICENSE`。项目代码采用 [MIT License](LICENSE)。
