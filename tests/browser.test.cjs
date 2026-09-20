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

function sectionsForGuides(guides) {
  const boundaries = [0, ...guides, sourceHeight];
  return boundaries.slice(0, -1).map((start, index) => ({
    start,
    height: boundaries[index + 1] - start
  }));
}

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

function assertClose(actual, expected, tolerance, message) {
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `${message}: expected ${expected} +/- ${tolerance}, got ${actual}`);
}

async function assertFileActions(page, expectedVisible, viewportWidth) {
  const state = await page.evaluate(() => {
    const group = document.getElementById('file-actions');
    const toolbar = group?.closest('.work-toolbar');
    const heading = group?.closest('.file-heading');
    const fileText = heading?.querySelector('.file-heading-text');
    const groupBox = group?.getBoundingClientRect();
    const toolbarBox = toolbar?.getBoundingClientRect();
    const fileTextBox = fileText?.getBoundingClientRect();
    const visible = Boolean(group && getComputedStyle(group).display !== 'none' && groupBox.width && groupBox.height);
    return {
      groupCount: document.querySelectorAll('#file-actions.file-actions').length,
      removeCount: document.querySelectorAll('#remove-button').length,
      replaceCount: document.querySelectorAll('#replace-button').length,
      removeInGroup: Boolean(group?.querySelector(':scope > #remove-button')),
      replaceInGroup: Boolean(group?.querySelector(':scope > #replace-button')),
      inHeading: Boolean(heading && heading.querySelector(':scope > #file-actions') === group),
      inToolbar: Boolean(toolbar),
      actionsInHeader: document.querySelectorAll('header .top-actions #remove-button, header .top-actions #replace-button').length,
      hiddenAttribute: Boolean(group?.hidden),
      visible,
      fileTextWidth: fileTextBox?.width || 0,
      withinToolbar: !visible || Boolean(
        groupBox.left >= toolbarBox.left - 1 && groupBox.right <= toolbarBox.right + 1
      ),
      withinViewport: !visible || Boolean(groupBox.left >= -1 && groupBox.right <= window.innerWidth + 1)
    };
  });

  assert.equal(state.groupCount, 1, 'file actions must have one stable local group');
  assert.equal(state.removeCount, 1, 'remove action must occur exactly once');
  assert.equal(state.replaceCount, 1, 'replace action must occur exactly once');
  assert.equal(state.removeInGroup, true, 'remove action must be a direct child of .file-actions');
  assert.equal(state.replaceInGroup, true, 'replace action must be a direct child of .file-actions');
  assert.equal(state.inHeading, true, '.file-actions must sit beside file information in .file-heading');
  assert.equal(state.inToolbar, true, '.file-actions must remain inside .work-toolbar');
  assert.equal(state.actionsInHeader, 0, 'image actions must not be placed in header .top-actions');
  assert.equal(state.hiddenAttribute, !expectedVisible,
    `file actions hidden state is wrong at ${viewportWidth}px`);
  assert.equal(state.visible, expectedVisible,
    `file actions visibility is wrong at ${viewportWidth}px`);
  if (expectedVisible) {
    assert.ok(state.fileTextWidth >= 80,
      `file information is squeezed to ${state.fileTextWidth}px at ${viewportWidth}px`);
  }
  assert.equal(state.withinToolbar, true, `file actions exceed .work-toolbar at ${viewportWidth}px`);
  assert.equal(state.withinViewport, true, `file actions exceed the ${viewportWidth}px viewport`);
}

async function assertWysiwygThumbnails(page, expectedSections) {
  const thumbnails = await page.locator('.result-row').evaluateAll((rows) => rows.map((row) => {
    const thumbnail = row.querySelector('.row-thumbnail');
    const crop = thumbnail?.querySelector(':scope > .row-crop');
    const image = crop?.querySelector(':scope > img');
    const thumbnailBox = thumbnail?.getBoundingClientRect();
    const cropBox = crop?.getBoundingClientRect();
    const imageBox = image?.getBoundingClientRect();
    const imageStyle = image ? getComputedStyle(image) : null;
    const cropStyle = crop ? getComputedStyle(crop) : null;
    return {
      index: Number(row.dataset.index),
      thumbnailWidth: thumbnailBox?.width,
      thumbnailHeight: thumbnailBox?.height,
      cropCount: thumbnail?.querySelectorAll(':scope > .row-crop').length || 0,
      start: Number(crop?.dataset.start),
      height: Number(crop?.dataset.height),
      scale: Number(crop?.dataset.scale),
      cropWidth: Number.parseFloat(crop?.style.width || ''),
      cropHeight: Number.parseFloat(crop?.style.height || ''),
      imageWidth: Number.parseFloat(image?.style.width || ''),
      imageTop: Number.parseFloat(image?.style.top || ''),
      imageComplete: Boolean(image?.complete),
      imageNaturalWidth: image?.naturalWidth || 0,
      imageNaturalHeight: image?.naturalHeight || 0,
      renderedImageWidth: imageBox?.width || 0,
      renderedImageHeight: imageBox?.height || 0,
      imageDisplay: imageStyle?.display || '',
      imageVisibility: imageStyle?.visibility || '',
      imageOpacity: imageStyle?.opacity || '',
      overflowX: cropStyle?.overflowX || '',
      overflowY: cropStyle?.overflowY || '',
      outlineOffset: cropStyle?.outlineOffset || '',
      cropInsideThumbnail: Boolean(
        cropBox && thumbnailBox &&
        cropBox.left >= thumbnailBox.left - 1 && cropBox.right <= thumbnailBox.right + 1 &&
        cropBox.top >= thumbnailBox.top - 1 && cropBox.bottom <= thumbnailBox.bottom + 1
      )
    };
  }));

  assert.equal(thumbnails.length, expectedSections.length, 'every section must have one preview row');
  assert.ok(new Set(expectedSections.map((section) => section.height)).size > 1,
    'thumbnail regression fixture must include slices with different heights');

  thumbnails.forEach((thumbnail, index) => {
    const expected = expectedSections[index];
    const expectedScale = Math.min(64 / sourceWidth, 48 / expected.height);
    const expectedCropWidth = sourceWidth * expectedScale;
    const expectedCropHeight = expected.height * expectedScale;
    const message = `slice ${index + 1}`;

    assert.equal(thumbnail.index, index, `${message} row order must match its section`);
    assert.equal(thumbnail.cropCount, 1, `${message} must use one real .row-crop viewport`);
    assertClose(thumbnail.thumbnailWidth, 66, 0.5, `${message} display slot width`);
    assertClose(thumbnail.thumbnailHeight, 52, 0.5, `${message} display slot height`);
    assert.equal(thumbnail.start, expected.start, `${message} crop start metadata`);
    assert.equal(thumbnail.height, expected.height, `${message} crop height metadata`);
    assertClose(thumbnail.scale, expectedScale, 1e-9, `${message} scale`);
    assertClose(thumbnail.cropWidth, expectedCropWidth, 0.02, `${message} crop width`);
    assertClose(thumbnail.cropHeight, expectedCropHeight, 0.02, `${message} crop height`);
    assertClose(thumbnail.cropWidth / thumbnail.cropHeight, sourceWidth / expected.height, 0.01,
      `${message} viewport aspect ratio`);
    assertClose(thumbnail.imageWidth, expectedCropWidth, 0.02, `${message} source image width`);
    assert.equal(thumbnail.imageComplete, true, `${message} source image must finish decoding`);
    assert.equal(thumbnail.imageNaturalWidth, sourceWidth, `${message} source natural width`);
    assert.equal(thumbnail.imageNaturalHeight, sourceHeight, `${message} source natural height`);
    assertClose(thumbnail.renderedImageWidth, expectedCropWidth, 0.1, `${message} rendered source width`);
    assertClose(thumbnail.renderedImageHeight, sourceHeight * expectedScale, 0.1,
      `${message} rendered source height`);
    assert.notEqual(thumbnail.imageDisplay, 'none', `${message} source image must render`);
    assert.notEqual(thumbnail.imageVisibility, 'hidden', `${message} source image must be visible`);
    assert.notEqual(thumbnail.imageOpacity, '0', `${message} source image must not be transparent`);
    assertClose(thumbnail.imageTop, -expected.start * expectedScale, 0.02,
      `${message} source image offset`);
    assertClose(-thumbnail.imageTop / thumbnail.scale, expected.start, 0.02,
      `${message} visible range start`);
    assertClose((thumbnail.cropHeight - thumbnail.imageTop) / thumbnail.scale,
      expected.start + expected.height, 0.02, `${message} visible range end`);
    assert.equal(thumbnail.overflowX, 'hidden', `${message} must clip horizontal overflow`);
    assert.equal(thumbnail.overflowY, 'hidden', `${message} must clip vertical overflow`);
    assert.equal(thumbnail.outlineOffset, '0px', `${message} outline must not cover source pixels`);
    assert.equal(thumbnail.cropInsideThumbnail, true, `${message} crop must stay inside its display slot`);
  });
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
    assert.equal(await page.locator('#empty-state h1').textContent(), '打开长图，开始分割');
    assert.equal((await page.locator('#language-toggle').innerText()).trim(), '中');
    assert.equal(await page.locator('#language-toggle').getAttribute('aria-label'), '切换到英文');
    assert.equal(await page.locator('.brand-mark svg').count(), 1);
    await assertFileActions(page, false, 1440);
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
    await assertFileActions(page, true, 1440);
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
    assert.equal(await page.locator('.guide-delete').first().getAttribute('aria-label'), 'Delete cut line 1 at 721 px');
    assert.equal(await heightInput.inputValue(), '731');
    assert.equal(await page.locator('#language-toggle').getAttribute('aria-label'), 'Switch to Chinese');
    assert.deepEqual({
      guides: await page.locator('.guide').count(),
      results: await page.locator('.result-row').count(),
      title: await page.locator('#file-title').textContent()
    }, stateBeforeLanguageSwitch, 'language switching must preserve the active edit state');
    await page.locator('#language-toggle').click();
    assert.match(await page.locator('html').getAttribute('lang'), /^zh/);
    assert.equal(await page.locator('.guide-delete').first().getAttribute('aria-label'), '删除第 1 条分割线（721 px）');
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
    await assertFileActions(page, false, 1440);

    await page.locator('#file-input').setInputFiles(source);
    await page.locator('.result-row').first().waitFor({ timeout: 30000 });
    assert.equal(await page.locator('#remove-button').isVisible(), true);
    assert.equal(await page.locator('#replace-button').isVisible(), true);
    await assertFileActions(page, true, 1440);
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
    const equalBoundaries = Array.from(
      { length: equalSliceCount + 1 },
      (_, index) => Math.floor(sourceHeight * index / equalSliceCount)
    );
    const equalGuides = equalBoundaries.slice(1, -1);
    const equalSections = sectionsForGuides(equalGuides);
    await assertWysiwygThumbnails(page, equalSections);

    await page.locator('#mode-manual').click();
    const previewBox = await page.locator('#preview-image').boundingBox();
    assert.ok(previewBox && previewBox.width > 2 && previewBox.height > 2);
    await page.locator('#preview-image').click({
      position: {
        x: Math.max(1, Math.min(previewBox.width - 1, previewBox.width / 2)),
        y: Math.max(1, Math.min(previewBox.height - 1, previewBox.height * 1395 / sourceHeight))
      }
    });
    await page.locator('#line-position').fill('1400');
    await page.locator('#line-position').dispatchEvent('change');
    assert.equal(await page.locator('.guide').count(), equalGuideCount + 1);
    await assertWysiwygThumbnails(page, sectionsForGuides([...equalGuides, 1400]));
    assert.equal(await page.locator('.row-crop').last().getAttribute('data-height'), '43');
    await page.locator('#mode-equal').click();
    await heightInput.fill(String(equalTargetHeight));
    await page.locator('#apply-equal').click();
    assert.equal(await page.locator('.guide').count(), equalGuideCount);
    assert.equal(await page.locator('#mode-equal').getAttribute('aria-pressed'), 'true');

    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(imageDir, 'cutimg-desktop-editor.png') });

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
    const before = await page.locator('.guide-drag').first().getAttribute('title');
    const firstGuide = await page.locator('.guide').first().boundingBox();
    const guideDragX = firstGuide.x + firstGuide.width / 2;
    await page.mouse.move(guideDragX, firstGuide.y + 16);
    await page.mouse.down();
    await page.mouse.move(guideDragX, firstGuide.y + 55, { steps: 5 });
    await page.mouse.up();
    const moved = await page.locator('.guide-drag').first().getAttribute('title');
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

    const manualPage = await context.newPage();
    manualPage.on('pageerror', (error) => errors.push(error.message));
    await manualPage.goto(url);
    await manualPage.locator('#sample-button').click();
    await manualPage.locator('.result-row').first().waitFor();
    await manualPage.locator('#mode-manual').click();
    assert.deepEqual(await manualPage.locator('.guide').evaluateAll((guides) =>
      guides.map((guide) => Number(guide.dataset.position))), [721]);
    assert.equal(await manualPage.locator('.guide-delete').count(), 1);
    assert.equal(await manualPage.locator('button button').count(), 0);

    await manualPage.locator('#add-line').click();
    assert.deepEqual(await manualPage.locator('.guide').evaluateAll((guides) =>
      guides.map((guide) => Number(guide.dataset.position))), [481, 962]);
    assert.equal(await manualPage.locator('.guide-delete').count(), 2);
    assert.deepEqual(await manualPage.locator('.guide-delete').evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute('aria-label'))),
    ['删除第 1 条分割线（481 px）', '删除第 2 条分割线（962 px）']);
    assert.match(await manualPage.locator('.guide').last().getAttribute('class'), /active/);

    const stableGuidesBeforeDragUndo = await manualPage.locator('.guide').evaluateAll((guides) =>
      guides.map((guide) => Number(guide.dataset.position)));
    const dragBeforeUndo = await manualPage.locator('.guide-drag').first().boundingBox();
    assert.ok(dragBeforeUndo);
    await manualPage.mouse.move(dragBeforeUndo.x + dragBeforeUndo.width / 2, dragBeforeUndo.y + dragBeforeUndo.height / 2);
    await manualPage.mouse.down();
    await manualPage.mouse.move(dragBeforeUndo.x + dragBeforeUndo.width / 2, dragBeforeUndo.y + 25, { steps: 3 });
    await manualPage.keyboard.press('Control+z');
    await manualPage.mouse.up();
    assert.deepEqual(await manualPage.locator('.guide').evaluateAll((guides) =>
      guides.map((guide) => Number(guide.dataset.position))), stableGuidesBeforeDragUndo);
    await manualPage.locator('#undo-button').click();
    assert.deepEqual(await manualPage.locator('.guide').evaluateAll((guides) =>
      guides.map((guide) => Number(guide.dataset.position))), [721]);
    await manualPage.locator('#redo-button').click();
    assert.deepEqual(await manualPage.locator('.guide').evaluateAll((guides) =>
      guides.map((guide) => Number(guide.dataset.position))), stableGuidesBeforeDragUndo);

    await manualPage.locator('#add-line').click();
    assert.deepEqual(await manualPage.locator('.guide').evaluateAll((guides) =>
      guides.map((guide) => Number(guide.dataset.position))), [360, 721, 1082]);
    assert.equal(await manualPage.locator('.guide-delete').count(), 3);
    await manualPage.locator('.guide-delete').nth(1).click();
    assert.deepEqual(await manualPage.locator('.guide').evaluateAll((guides) =>
      guides.map((guide) => Number(guide.dataset.position))), [360, 1082]);
    assert.equal(await manualPage.locator('.guide-delete').nth(1).evaluate((button) => button === document.activeElement), true);
    await manualPage.locator('#undo-button').click();
    assert.deepEqual(await manualPage.locator('.guide').evaluateAll((guides) =>
      guides.map((guide) => Number(guide.dataset.position))), [360, 721, 1082]);
    await manualPage.locator('#redo-button').click();
    assert.deepEqual(await manualPage.locator('.guide').evaluateAll((guides) =>
      guides.map((guide) => Number(guide.dataset.position))), [360, 1082]);
    await manualPage.locator('#undo-button').click();
    await manualPage.locator('.guide-drag').first().focus();
    await manualPage.keyboard.press('Delete');
    assert.deepEqual(await manualPage.locator('.guide').evaluateAll((guides) =>
      guides.map((guide) => Number(guide.dataset.position))), [721, 1082]);
    assert.equal(await manualPage.locator('.guide-drag').first().evaluate((button) => button === document.activeElement), true);
    await manualPage.locator('#undo-button').click();
    await manualPage.locator('.guide-delete').last().focus();
    await manualPage.keyboard.press('Enter');
    assert.deepEqual(await manualPage.locator('.guide').evaluateAll((guides) =>
      guides.map((guide) => Number(guide.dataset.position))), [360, 721]);
    assert.equal(await manualPage.locator('.guide-delete').last().evaluate((button) => button === document.activeElement), true);
    await manualPage.locator('#undo-button').click();
    await manualPage.screenshot({ path: path.join(imageDir, 'cutimg-manual-guides.png') });

    await manualPage.locator('.guide-drag').first().click();
    await manualPage.locator('#line-position').fill('400');
    await manualPage.locator('#line-position').dispatchEvent('change');
    assert.deepEqual(await manualPage.locator('.guide').evaluateAll((guides) =>
      guides.map((guide) => Number(guide.dataset.position))), [400, 721, 1082]);
    await manualPage.locator('#add-line').click();
    assert.deepEqual(await manualPage.locator('.guide').evaluateAll((guides) =>
      guides.map((guide) => Number(guide.dataset.position))), [288, 577, 865, 1154]);
    await manualPage.locator('#undo-button').click();
    assert.deepEqual(await manualPage.locator('.guide').evaluateAll((guides) =>
      guides.map((guide) => Number(guide.dataset.position))), [400, 721, 1082]);

    const tallPng = Buffer.from(await manualPage.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 4000;
      const context = canvas.getContext('2d');
      context.fillStyle = '#f4f7fa';
      context.fillRect(0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    }));
    await manualPage.locator('#file-input').setInputFiles({ name: 'dense-guides.png', mimeType: 'image/png', buffer: tallPng });
    await manualPage.waitForFunction(() => document.querySelector('#file-title')?.textContent === 'dense-guides.png');
    await manualPage.locator('#basis-count').click();
    await manualPage.locator('#count-input').fill('100');
    await manualPage.locator('#apply-equal').click();
    await manualPage.locator('#mode-manual').click();
    assert.equal(await manualPage.locator('.guide').count(), 99);
    assert.equal(await manualPage.locator('#add-line').isDisabled(), true);
    assert.ok(Number(await manualPage.locator('#line-layer').getAttribute('data-guide-lanes')) > 3);
    await manualPage.locator('.guide-drag').first().focus();
    await manualPage.keyboard.press('Shift+ArrowUp');
    assert.equal(await manualPage.locator('.guide').first().getAttribute('data-position'), '30');
    await manualPage.locator('#undo-button').click();
    assert.equal(await manualPage.locator('.guide').first().getAttribute('data-position'), '40');
    const denseDeleteButtons = await manualPage.locator('.guide-delete').evaluateAll((buttons) =>
      buttons.map((button) => {
        const box = button.getBoundingClientRect();
        const target = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return {
          left: box.left, right: box.right, top: box.top, bottom: box.bottom,
          hit: button === target || button.contains(target)
        };
      }));
    for (let first = 0; first < denseDeleteButtons.length; first += 1) {
      for (let second = first + 1; second < denseDeleteButtons.length; second += 1) {
        const a = denseDeleteButtons[first];
        const b = denseDeleteButtons[second];
        const overlaps = a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        assert.equal(overlaps, false, `dense guide delete buttons ${first + 1} and ${second + 1} overlap`);
      }
      assert.equal(denseDeleteButtons[first].hit, true, `dense guide delete button ${first + 1} must be clickable`);
    }
    for (const position of [0, 49, 98]) {
      await manualPage.locator('.guide-delete').nth(position).click();
      assert.equal(await manualPage.locator('.guide').count(), 98);
      await manualPage.locator('#undo-button').click();
      assert.equal(await manualPage.locator('.guide').count(), 99);
    }
    await manualPage.setViewportSize({ width: 1000, height: 700 });
    await manualPage.waitForTimeout(100);
    const resizedDenseButtons = await manualPage.locator('.guide-delete').evaluateAll((buttons) =>
      buttons.map((button) => {
        const box = button.getBoundingClientRect();
        const target = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return button === target || button.contains(target);
      }));
    assert.equal(resizedDenseButtons.every(Boolean), true, 'dense guide buttons must remain clickable after resize');
    assert.deepEqual(errors, []);
    await manualPage.close();
    await context.close();

    const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, acceptDownloads: true });
    const mobile = await mobileContext.newPage();
    mobile.on('pageerror', (error) => errors.push(error.message));
    await mobile.goto(url);
    await assertFileActions(mobile, false, 390);
    await mobile.screenshot({ path: path.join(imageDir, 'cutimg-mobile-empty.png') });
    await mobile.locator('#sample-button').click();
    await mobile.locator('.result-row').first().waitFor();
    await assertFileActions(mobile, true, 390);
    assert.equal(await mobile.locator('.guide-delete').count(), await mobile.locator('.guide').count());
    assert.equal(await mobile.locator('.guide-delete').first().isVisible(), true);
    const mobileGuidePosition = await mobile.locator('.guide').first().getAttribute('data-position');
    await mobile.locator('.guide-delete').first().tap();
    assert.equal(await mobile.locator('.guide').count(), 0);
    await mobile.locator('#undo-button').tap();
    assert.equal(await mobile.locator('.guide').count(), 1);
    assert.equal(await mobile.locator('.guide').first().getAttribute('data-position'), mobileGuidePosition);
    await mobile.waitForTimeout(3800);
    await mobile.screenshot({ path: path.join(imageDir, 'cutimg-mobile-editor.png'), fullPage: true });
    await assertNoHorizontalOverflow(mobile, 390);
    assert.deepEqual(errors, []);
    await mobileContext.close();

    const narrow = await browser.newPage({ viewport: { width: 320, height: 700 } });
    await narrow.goto(url);
    await assertFileActions(narrow, false, 320);
    await narrow.locator('#sample-button').click();
    await narrow.locator('.result-row').first().waitFor();
    await assertFileActions(narrow, true, 320);
    await assertNoHorizontalOverflow(narrow, 320);
    await narrow.close();

    for (const width of [800, 761, 520]) {
      const intermediate = await browser.newPage({ viewport: { width, height: 800 } });
      await intermediate.goto(url);
      await intermediate.locator('#sample-button').click();
      await intermediate.locator('.result-row').first().waitFor();
      await assertFileActions(intermediate, true, width);
      await assertNoHorizontalOverflow(intermediate, width);
      if (width === 761) {
        await intermediate.screenshot({ path: path.join(imageDir, 'cutimg-tablet-editor.png') });
      }
      await intermediate.close();
    }

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
