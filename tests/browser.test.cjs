'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'assets', 'demo-long.png');
const url = pathToFileURL(path.join(root, 'index.html')).href;
const imageDir = '/private/tmp';
const sourceWidth = 640;
const sourceHeight = 1443;
const equalTargetHeight = 100;
const equalSliceCount = Math.ceil(sourceHeight / equalTargetHeight);
const equalGuideCount = equalSliceCount - 1;

async function assertApplyRejected(page, input, value, expectedGuideCount) {
  await input.fill(String(value));
  await page.locator('#apply-equal').click();
  assert.equal(await page.locator('.guide').count(), expectedGuideCount);
  assert.match(await page.locator('#toast').getAttribute('class'), /error/);
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(url);
    await page.locator('#upload-button').waitFor();
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

    assert.equal(await heightInput.inputValue(), String(Math.ceil(sourceHeight / 2)));
    assert.equal(await countInput.inputValue(), '2');
    assert.equal(await heightInput.getAttribute('aria-describedby'), null);
    assert.equal(await countInput.getAttribute('aria-describedby'), null);
    assert.equal(await heightInput.getAttribute('min'), '2');
    assert.equal(await heightInput.getAttribute('max'), String(sourceHeight - 1));
    assert.equal(await countInput.getAttribute('min'), '2');

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
        y: Math.max(1, Math.min(previewBox.height - 1, previewBox.height / 3))
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
    const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 1, `horizontal overflow: ${overflow}px`);
    assert.deepEqual(errors, []);
    await mobileContext.close();

    const narrow = await browser.newPage({ viewport: { width: 320, height: 700 } });
    await narrow.goto(url);
    await narrow.locator('#sample-button').click();
    await narrow.locator('.result-row').first().waitFor();
    const narrowOverflow = await narrow.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(narrowOverflow <= 1, `320px horizontal overflow: ${narrowOverflow}px`);
    await narrow.close();
    console.log('browser tests passed; screenshots and downloads in /private/tmp/cutimg-*');
  } finally {
    await browser.close();
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
