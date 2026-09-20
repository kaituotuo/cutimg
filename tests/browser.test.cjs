'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'assets', 'demo-long.png');
const sourceBuffer = fs.readFileSync(source);
const imageDir = '/private/tmp';
const sourceWidth = 640;
const sourceHeight = 1443;
const equalTargetHeight = 100;
const equalSliceCount = Math.ceil(sourceHeight / equalTargetHeight);
const equalGuideCount = equalSliceCount - 1;

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

async function startServer(country) {
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    if (pathname === '/api/country') {
      country.requests += 1;
      setTimeout(() => {
        response.writeHead(200, {
          'Cache-Control': 'no-store',
          'Content-Type': 'application/json; charset=utf-8'
        });
        response.end(JSON.stringify({ country: country.code }));
      }, country.delay);
      return;
    }

    const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const filePath = path.resolve(root, relativePath);
    if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    fs.readFile(filePath, (error, data) => {
      if (error) {
        response.writeHead(error.code === 'ENOENT' ? 404 : 500).end('Not found');
        return;
      }
      response.writeHead(200, { 'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream' });
      response.end(data);
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  return {
    server,
    url: `http://127.0.0.1:${address.port}/`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

async function assertNoHorizontalOverflow(page, width) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 1, `${width}px horizontal overflow: ${overflow}px`);
}

async function assertApplyRejected(page, input, value, expectedGuideCount) {
  await input.fill(String(value));
  await page.locator('#apply-equal').click();
  assert.equal(await page.locator('.guide').count(), expectedGuideCount);
  assert.match(await page.locator('#toast').getAttribute('class'), /error/);
}

async function run() {
  const country = { code: 'US', delay: 0, requests: 0 };
  const site = await startServer(country);
  const url = site.url;
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {})
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    await context.addInitScript(() => {
      localStorage.setItem('cutimg.locale.preference', 'zh');
      const originalDecode = HTMLImageElement.prototype.decode;
      HTMLImageElement.prototype.decode = function (...args) {
        const delay = Number(window.__cutimgDelayNextDecode || 0);
        if (!delay || !this.src.startsWith('blob:')) return originalDecode.apply(this, args);
        window.__cutimgDelayNextDecode = 0;
        return new Promise((resolve) => setTimeout(resolve, delay)).then(() => originalDecode.apply(this, args));
      };
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(url);
    await page.locator('#upload-button').waitFor();
    assert.match(await page.locator('html').getAttribute('lang'), /^zh/);
    assert.equal(await page.title(), 'cutimg · 长图分割');
    assert.equal(await page.locator('.product-name').textContent(), '长图分割');
    assert.equal(await page.locator('#empty-state h1').textContent(), '上传长图，开始分割');
    assert.equal((await page.locator('#language-toggle').innerText()).trim(), '中');
    assert.equal(await page.locator('#language-toggle').getAttribute('aria-label'), '切换到英文');
    assert.equal(await page.locator('.brand-mark svg').count(), 1);
    await page.locator('#mode-manual').click();
    assert.equal(await page.locator('#mode-manual').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#manual-controls').isVisible(), true);
    await page.locator('#mode-equal').click();
    assert.equal(await page.locator('#mode-equal').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#equal-controls').isVisible(), true);
    const heightInput = page.locator('#height-input');
    const countInput = page.locator('#count-input');
    assert.equal(await heightInput.inputValue(), '');
    assert.equal(await heightInput.getAttribute('placeholder'), '上传图片后可设置');
    assert.equal(await heightInput.isDisabled(), true);
    assert.equal(await heightInput.getAttribute('aria-invalid'), 'false');
    assert.equal(await heightInput.getAttribute('aria-describedby'), 'equal-empty-hint');
    assert.equal(await heightInput.getAttribute('min'), null);
    assert.equal(await heightInput.getAttribute('max'), null);
    assert.equal(await page.locator('#height-decrement').isDisabled(), true);
    assert.equal(await page.locator('#height-increment').isDisabled(), true);
    const emptyFieldBorders = await page.locator('#height-field').evaluate((node) => {
      const style = getComputedStyle(node);
      return [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth];
    });
    assert.deepEqual(emptyFieldBorders, ['0px', '0px', '0px', '0px']);
    const stepperBorder = await page.locator('#height-field .number-stepper').evaluate((node) => getComputedStyle(node).borderTopWidth);
    assert.notEqual(stepperBorder, '0px');
    await page.locator('#basis-count').click();
    assert.equal(await countInput.inputValue(), '');
    assert.equal(await countInput.getAttribute('placeholder'), '上传图片后可设置');
    assert.equal(await countInput.isDisabled(), true);
    assert.equal(await countInput.getAttribute('aria-invalid'), 'false');
    assert.equal(await countInput.getAttribute('aria-describedby'), 'equal-empty-hint');
    assert.equal(await countInput.getAttribute('min'), null);
    assert.equal(await countInput.getAttribute('max'), null);
    assert.equal(await page.locator('#count-decrement').isDisabled(), true);
    assert.equal(await page.locator('#count-increment').isDisabled(), true);
    await page.locator('#basis-height').click();
    await page.screenshot({ path: path.join(imageDir, 'cutimg-desktop-empty.png') });

    await page.locator('#file-input').setInputFiles(source);
    await page.locator('.result-row').first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(150);
    assert.equal(await page.locator('.guide').count(), 1);
    assert.equal(await page.locator('.result-row').count(), 2);
    assert.equal(await page.locator('#segment-highlight').count(), 0);
    assert.equal(await page.locator('.row-select').first().getAttribute('aria-pressed'), 'true');
    await page.locator('.row-select').nth(1).click();
    assert.equal(await page.locator('.result-row').nth(1).getAttribute('class'), 'result-row active');
    assert.equal(await page.locator('.row-select').first().getAttribute('aria-pressed'), 'false');
    assert.equal(await page.locator('.row-select').nth(1).getAttribute('aria-pressed'), 'true');
    await page.locator('.row-select').first().click();
    assert.equal(await page.locator('#download-all').isEnabled(), true);
    assert.match(await page.locator('#file-meta').textContent(), new RegExp(`${sourceWidth} × ${sourceHeight}`));
    assert.equal(await page.locator('#status-lines').textContent(), '1 条分割线');
    assert.equal(await page.locator('.row-copy strong').first().textContent(), '切片 01');
    await heightInput.fill('731');
    const stateBeforeLanguageSwitch = {
      guides: await page.locator('.guide').count(),
      results: await page.locator('.result-row').count(),
      title: await page.locator('#file-title').textContent()
    };
    await page.locator('#language-toggle').click();
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    assert.equal(await page.title(), 'cutimg · Long Image Splitter');
    assert.equal(await page.locator('.product-name').textContent(), 'Image Splitter');
    assert.equal((await page.locator('#language-toggle').innerText()).trim(), 'EN');
    assert.equal(await page.locator('#status-lines').textContent(), '1 cut line');
    assert.equal(await page.locator('.row-copy strong').first().textContent(), 'Slice 01');
    assert.equal(await heightInput.inputValue(), '731');
    assert.equal(await page.locator('#language-toggle').getAttribute('aria-label'), 'Switch to Chinese');
    assert.deepEqual({
      guides: await page.locator('.guide').count(),
      results: await page.locator('.result-row').count(),
      title: await page.locator('#file-title').textContent()
    }, stateBeforeLanguageSwitch, 'language switching must preserve the active edit state');
    await page.locator('#language-toggle').click();
    assert.match(await page.locator('html').getAttribute('lang'), /^zh/);
    assert.equal(await heightInput.inputValue(), '731');
    await heightInput.fill(String(Math.ceil(sourceHeight / 2)));
    await assertNoHorizontalOverflow(page, 1440);

    assert.equal(await heightInput.inputValue(), String(Math.ceil(sourceHeight / 2)));
    assert.equal(await countInput.inputValue(), '2');
    assert.equal(await heightInput.getAttribute('aria-describedby'), null);
    assert.equal(await countInput.getAttribute('aria-describedby'), null);
    assert.equal(await heightInput.getAttribute('min'), '2');
    assert.equal(await heightInput.getAttribute('max'), String(sourceHeight - 1));
    assert.equal(await countInput.getAttribute('min'), '2');
    assert.equal(await countInput.getAttribute('max'), String(Math.min(100, sourceHeight - 1)));

    const zoomPercent = Number((await page.locator('#zoom-label').textContent()).replace('%', ''));
    assert.ok(zoomPercent > 0 && zoomPercent <= 50, `initial zoom should be in (0, 50], got ${zoomPercent}%`);
    const initialFit = await page.evaluate(() => {
      const scroll = document.getElementById('canvas-scroll');
      const image = document.getElementById('preview-image');
      const style = getComputedStyle(scroll);
      return {
        imageHeight: image.getBoundingClientRect().height,
        availableHeight: scroll.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom),
        scrollHeight: scroll.scrollHeight,
        clientHeight: scroll.clientHeight
      };
    });
    assert.ok(initialFit.imageHeight <= initialFit.availableHeight + 1,
      `preview height ${initialFit.imageHeight}px exceeds available height ${initialFit.availableHeight}px`);
    assert.ok(initialFit.scrollHeight <= initialFit.clientHeight + 1,
      `initial preview should not need vertical scrolling: ${initialFit.scrollHeight}px > ${initialFit.clientHeight}px`);

    assert.equal(await page.locator('#remove-button').isVisible(), true);
    await page.evaluate(() => { window.__cutimgDelayNextDecode = 350; });
    await page.locator('#file-input').setInputFiles(source);
    await page.locator('#remove-button').click();
    await page.locator('#empty-state').waitFor({ state: 'visible' });
    await page.waitForTimeout(450);
    assert.equal(await page.locator('#empty-state').isVisible(), true, 'a late image decode must not restore a removed image');
    assert.equal(await page.locator('.result-row').count(), 0);
    assert.equal(await page.locator('#file-title').textContent(), '新建分割');
    assert.equal(await page.locator('#status-lines').textContent(), '0 条分割线');
    assert.equal(await heightInput.inputValue(), '');
    assert.equal(await heightInput.getAttribute('placeholder'), '上传图片后可设置');
    assert.equal(await heightInput.isDisabled(), true);
    assert.equal(await heightInput.getAttribute('min'), null);
    assert.equal(await heightInput.getAttribute('max'), null);
    assert.equal(await page.locator('#remove-button').isHidden(), true);
    assert.equal(await page.locator('#replace-button').isHidden(), true);
    assert.equal(await page.locator('#top-export').isDisabled(), true);

    await page.locator('#file-input').setInputFiles(source);
    await page.locator('.result-row').first().waitFor({ timeout: 30000 });
    assert.equal(await page.locator('#remove-button').isVisible(), true);
    assert.equal(await page.locator('#replace-button').isVisible(), true);
    assert.equal(await page.locator('.result-row').count(), 2);
    assert.equal(await heightInput.getAttribute('min'), '2');
    assert.equal(await heightInput.getAttribute('max'), String(sourceHeight - 1));

    await page.evaluate(() => { window.__cutimgDelayNextDecode = 350; });
    await page.locator('#file-input').setInputFiles({ name: 'older.png', mimeType: 'image/png', buffer: sourceBuffer });
    await page.locator('#file-input').setInputFiles({ name: 'latest.png', mimeType: 'image/png', buffer: sourceBuffer });
    await page.locator('#file-title').filter({ hasText: 'latest.png' }).waitFor();
    await page.waitForTimeout(450);
    assert.equal(await page.locator('#file-title').textContent(), 'latest.png', 'an older decode must not overwrite the latest selection');

    await heightInput.fill('720');
    assert.equal(await heightInput.inputValue(), '720');
    await page.locator('#height-increment').click();
    const incrementedHeight = Number(await heightInput.inputValue());
    assert.ok(incrementedHeight > 720, `height increment did not increase 720: ${incrementedHeight}`);
    await page.locator('#height-decrement').click();
    assert.equal(Number(await heightInput.inputValue()), 720);

    await assertApplyRejected(page, heightInput, 1, 1);
    await assertApplyRejected(page, heightInput, sourceHeight, 1);
    await assertApplyRejected(page, heightInput, sourceHeight + 1, 1);
    await heightInput.fill(String(sourceHeight - 1));
    await page.locator('#apply-equal').click();
    assert.equal(await page.locator('.guide').count(), 1);
    assert.equal(await page.locator('.result-row').count(), 2);

    await page.locator('#basis-count').click();
    assert.equal(await page.locator('#count-field').isVisible(), true);
    await countInput.fill('3');
    assert.equal(await countInput.inputValue(), '3');
    await page.locator('#count-increment').click();
    assert.equal(Number(await countInput.inputValue()), 4);
    await page.locator('#count-decrement').click();
    assert.equal(Number(await countInput.inputValue()), 3);
    await assertApplyRejected(page, countInput, 1, 1);
    await assertApplyRejected(page, countInput, Math.min(100, sourceHeight - 1) + 1, 1);
    await countInput.fill('2');
    await page.locator('#apply-equal').click();
    assert.equal(await page.locator('.guide').count(), 1);
    assert.equal(await page.locator('.result-row').count(), 2);
    await countInput.fill(String(equalSliceCount));
    await page.locator('#apply-equal').click();
    assert.equal(await page.locator('.guide').count(), equalGuideCount);
    await page.locator('#basis-height').click();
    await heightInput.fill(String(equalTargetHeight));
    await page.locator('#apply-equal').click();
    assert.equal(await page.locator('.guide').count(), equalGuideCount);

    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(imageDir, 'cutimg-desktop-editor.png') });

    const previewBox = await page.locator('#preview-image').boundingBox();
    assert.ok(previewBox && previewBox.width > 2 && previewBox.height > 2);
    await page.locator('#preview-image').click({
      position: {
        x: Math.max(1, Math.min(previewBox.width - 1, previewBox.width / 2)),
        y: Math.max(1, Math.min(previewBox.height - 1, previewBox.height * 50 / sourceHeight))
      }
    });
    assert.equal(await page.locator('.guide').count(), equalGuideCount + 1);
    await page.locator('#undo-button').click();
    assert.equal(await page.locator('.guide').count(), equalGuideCount);

    await page.locator('#mode-manual').click();
    await page.locator('#add-line').click();
    assert.equal(await page.locator('.guide').count(), equalGuideCount + 1);
    const before = await page.locator('.guide').first().getAttribute('title');
    const firstGuide = await page.locator('.guide').first().boundingBox();
    const guideDragX = firstGuide.x + firstGuide.width / 2;
    await page.mouse.move(guideDragX, firstGuide.y + 16);
    await page.mouse.down();
    await page.mouse.move(guideDragX, firstGuide.y + 55, { steps: 5 });
    await page.mouse.up();
    const moved = await page.locator('.guide').first().getAttribute('title');
    assert.notEqual(moved, before);
    const manualHeight = Number(moved.match(/(\d+) px$/)[1]);
    const manualDownload = page.waitForEvent('download', { timeout: 120000 });
    await page.locator('.row-download').first().click();
    await (await manualDownload).saveAs(path.join(imageDir, 'cutimg-qa-manual.png'));
    const pngHeader = fs.readFileSync(path.join(imageDir, 'cutimg-qa-manual.png'));
    assert.equal(pngHeader.readUInt32BE(16), sourceWidth);
    assert.equal(pngHeader.readUInt32BE(20), manualHeight);
    await page.locator('#undo-button').click();
    assert.equal(await page.locator('.guide').count(), equalGuideCount + 1);
    await page.locator('#redo-button').click();
    assert.equal(await page.locator('.guide').count(), equalGuideCount + 1);
    await page.locator('#clear-lines').click();
    assert.equal(await page.locator('.guide').count(), 0);
    await page.locator('#undo-button').click();
    assert.equal(await page.locator('.guide').count(), equalGuideCount + 1);
    await page.locator('#mode-equal').click();
    assert.equal(await page.locator('.guide').count(), equalGuideCount + 1);
    await page.locator('#basis-count').click();
    assert.equal(await page.locator('.guide').count(), equalGuideCount + 1);
    assert.equal(await page.locator('#count-field').isVisible(), true);
    await page.locator('#basis-height').click();
    assert.equal(await page.locator('.guide').count(), equalGuideCount + 1);
    await page.locator('#apply-equal').click();
    assert.equal(await page.locator('.guide').count(), equalGuideCount);

    const oneDownload = page.waitForEvent('download', { timeout: 120000 });
    await page.locator('.row-download').first().click();
    const one = await oneDownload;
    assert.match(one.suggestedFilename(), /cutimg-01\.png$/);
    await one.saveAs(path.join(imageDir, 'cutimg-qa-slice-01.png'));

    const allDownload = page.waitForEvent('download', { timeout: 180000 });
    await page.locator('#download-all').click();
    const all = await allDownload;
    assert.match(all.suggestedFilename(), new RegExp(`cutimg-${equalSliceCount}\\.zip$`));
    await all.saveAs(path.join(imageDir, 'cutimg-qa-all.zip'));
    assert.deepEqual(errors, []);
    await context.close();

    const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 1, acceptDownloads: true });
    const mobile = await mobileContext.newPage();
    mobile.on('pageerror', (error) => errors.push(error.message));
    await mobile.goto(url);
    await mobile.screenshot({ path: path.join(imageDir, 'cutimg-mobile-empty.png') });
    await mobile.locator('#sample-button').click();
    await mobile.locator('.result-row').first().waitFor();
    await mobile.waitForTimeout(3800);
    await mobile.screenshot({ path: path.join(imageDir, 'cutimg-mobile-editor.png'), fullPage: true });
    await assertNoHorizontalOverflow(mobile, 390);
    assert.deepEqual(errors, []);
    await mobileContext.close();

    const narrow = await browser.newPage({ viewport: { width: 320, height: 700 } });
    await narrow.goto(url);
    await narrow.locator('#sample-button').click();
    await narrow.locator('.result-row').first().waitFor();
    await assertNoHorizontalOverflow(narrow, 320);
    await narrow.close();

    country.code = 'CN';
    country.delay = 0;
    const geoContext = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-US' });
    const geoPage = await geoContext.newPage();
    geoPage.on('pageerror', (error) => errors.push(error.message));
    await geoPage.goto(url);
    await geoPage.waitForFunction(() => document.documentElement.lang === 'zh-CN');
    assert.equal(await geoPage.locator('.product-name').textContent(), '长图分割');
    assert.ok(country.requests > 0, 'country endpoint should be used when no manual preference or fresh cache exists');
    await geoContext.close();

    country.code = 'CN';
    country.delay = 1000;
    const delayedContext = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-US' });
    const delayedPage = await delayedContext.newPage();
    delayedPage.on('pageerror', (error) => errors.push(error.message));
    await delayedPage.goto(url);
    await delayedPage.locator('#language-toggle').waitFor();
    assert.equal(await delayedPage.locator('html').getAttribute('lang'), 'en');
    await delayedPage.locator('#language-toggle').click();
    await delayedPage.locator('#language-toggle').click();
    await delayedPage.waitForTimeout(1200);
    assert.equal(await delayedPage.locator('html').getAttribute('lang'), 'en');
    assert.equal(await delayedPage.locator('.product-name').textContent(), 'Image Splitter');
    assert.equal(await delayedPage.evaluate(() => localStorage.getItem('cutimg.locale.preference')), 'en');
    await delayedPage.reload();
    assert.equal(await delayedPage.locator('html').getAttribute('lang'), 'en');
    assert.equal(await delayedPage.locator('.product-name').textContent(), 'Image Splitter');
    await delayedContext.close();

    assert.deepEqual(errors, []);
    console.log('browser tests passed; screenshots and downloads in /private/tmp/cutimg-*');
  } finally {
    await browser.close();
    await site.close();
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
