(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CutimgI18n = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  const MANUAL_LANGUAGE_KEY = "cutimg.locale.preference";
  const AUTO_LANGUAGE_KEY = "cutimg.locale.auto";
  const AUTO_LANGUAGE_TTL = 24 * 60 * 60 * 1000;
  const COUNTRY_LOOKUP_TIMEOUT = 2000;

  const messages = {
    zh: {
      documentTitle: "cutimg · 长图分割",
      metaDescription: "cutimg：在浏览器中添加、拖动分割线，将长图切成小图并打包下载。",
      productName: "长图分割",
      privacyTitle: "图片文件仅在当前浏览器处理，不上传服务器",
      localProcessing: "本地处理",
      imageActions: "图片操作",
      reuploadImage: "重新上传",
      removeImage: "删除当前图片",
      downloadAllTitle: "下载全部 ZIP",
      downloadAll: "下载全部",
      workAreaLabel: "图片分割画布",
      newSplit: "新建分割",
      uploadToBegin: "上传长图开始",
      editHistory: "编辑历史",
      undo: "撤销",
      redo: "重做",
      previewZoom: "预览缩放",
      zoomOut: "缩小预览",
      zoomIn: "放大预览",
      uploadHeading: "上传长图，开始分割",
      uploadInstructions: "拖放图片到这里，或从电脑选择",
      chooseImage: "选择图片",
      fileSupport: "支持 PNG、JPG、WebP · 单张不超过 100 MB",
      trySample: "试用示例长图",
      previewAlt: "待分割的长图",
      splitPreview: "分割预览",
      waitingForImage: "等待图片",
      sidePanelLabel: "分割设置与导出",
      splitSettings: "分割设置",
      splitMode: "分割方式",
      equalSplit: "等高分割",
      manualSplit: "手动分割",
      splitBy: "分割依据",
      equalBasis: "等高分割依据",
      byHeight: "按目标高度",
      byCount: "按张数",
      availableAfterUploadSentence: "上传图片后可设置。",
      availableAfterUpload: "上传图片后可设置",
      eachSlice: "每张约",
      targetHeight: "目标高度",
      decreaseHeightAria: "目标高度减 1 像素",
      decreaseHeightTitle: "减 1 像素",
      targetHeightInput: "目标高度，单位像素",
      increaseHeightAria: "目标高度加 1 像素",
      increaseHeightTitle: "加 1 像素",
      splitInto: "分成",
      sliceCount: "切片张数",
      decreaseCountAria: "切片张数减 1",
      decreaseCountTitle: "减 1 张",
      increaseCountAria: "切片张数加 1",
      increaseCountTitle: "加 1 张",
      sliceUnit: "张",
      applyEqual: "应用等高分割",
      addGuide: "添加分割线",
      clearGuides: "清空全部分割线",
      guidePosition: "分割线位置",
      deleteGuide: "删除所选分割线",
      slicesLabel: "切片数量",
      sliceHeightLabel: "切片高度",
      slicePreview: "切片预览",
      noSlices: "暂无切片",
      preparingExport: "准备导出",
      cancel: "取消",
      downloadAllZip: "下载全部 ZIP",
      exportMeta: "PNG 原图尺寸 · 浏览器本地生成",
      languageToggle: "界面语言",
      switchToEnglish: "切换到英文",
      switchToChinese: "Switch to Chinese",
      sampleFilename: "cutimg-sample.png",
      guideAria: "第 {index} 条分割线，位置 {position} 像素；方向键微调，Delete 删除",
      guideTitle: "分割线 {index} · {position} px",
      viewSlice: "查看第 {index} 张切片，{height} 像素高",
      sliceTitle: "切片 {index}",
      downloadSlice: "下载切片 {index}",
      originalMeta: "{dimensions} · 原图",
      unreadableImage: "图片无法读取，请换一张 PNG、JPG 或 WebP。",
      imageTooShort: "图片高度至少需要 3 px，才能分成两张。",
      imageTooLarge: "图片尺寸过大，当前浏览器可能无法处理。请先缩小原图。",
      imageLoaded: "已载入图片，分成 {count}",
      invalidFileType: "请选择 PNG、JPG 或 WebP 图片。",
      fileTooLarge: "图片超过 100 MB，请先压缩原文件。",
      imageLoadFailed: "图片加载失败，请重试。",
      sampleLoadFailed: "示例图片加载失败。",
      targetHeightRange: "目标高度需在 2–{max} px 之间。",
      sliceCountRange: "张数需在 2–{max} 之间。",
      tooManySlices: "一次最多分成 100 张，请增大高度或减少张数。",
      guideTooClose: "分割线与边缘或其他分割线距离太近。",
      sliceTooLarge: "单张切片尺寸太大，请增加分割线后重试。",
      canvasFailed: "浏览器无法创建图片画布，请缩小切片尺寸。",
      encodeFailed: "图片编码失败，请缩小切片尺寸。",
      creatingSlice: "生成切片 {current} / {total}",
      completedSlices: "已完成 {current} / {total}",
      creatingZip: "正在打包 ZIP",
      exportedSlices: "已导出 {count}",
      exportedSlice: "已导出切片 {index}",
      exportFailed: "导出失败，请重试。",
      cancelling: "正在取消…",
      imageRemoved: "已删除当前图片"
    },
    en: {
      documentTitle: "cutimg · Long Image Splitter",
      metaDescription: "cutimg: Add and drag cut lines in your browser, split long images, and download every slice as a ZIP.",
      productName: "Image Splitter",
      privacyTitle: "Image files are processed only in this browser and are never uploaded",
      localProcessing: "Local processing",
      imageActions: "Image actions",
      reuploadImage: "Replace image",
      removeImage: "Remove current image",
      downloadAllTitle: "Download all as ZIP",
      downloadAll: "Download all",
      workAreaLabel: "Image splitting canvas",
      newSplit: "New split",
      uploadToBegin: "Upload a long image to begin",
      editHistory: "Edit history",
      undo: "Undo",
      redo: "Redo",
      previewZoom: "Preview zoom",
      zoomOut: "Zoom out",
      zoomIn: "Zoom in",
      uploadHeading: "Upload a long image to start",
      uploadInstructions: "Drop an image here, or choose one from your device",
      chooseImage: "Choose image",
      fileSupport: "PNG, JPG or WebP · Up to 100 MB",
      trySample: "Try sample image",
      previewAlt: "Long image to split",
      splitPreview: "Split preview",
      waitingForImage: "Waiting for image",
      sidePanelLabel: "Split settings and export",
      splitSettings: "Split settings",
      splitMode: "Split mode",
      equalSplit: "Equal split",
      manualSplit: "Manual split",
      splitBy: "Split by",
      equalBasis: "Equal split basis",
      byHeight: "Target height",
      byCount: "Slice count",
      availableAfterUploadSentence: "Available after upload.",
      availableAfterUpload: "Upload to set",
      eachSlice: "Each slice",
      targetHeight: "Target height",
      decreaseHeightAria: "Decrease target height by 1 pixel",
      decreaseHeightTitle: "Decrease by 1 px",
      targetHeightInput: "Target height in pixels",
      increaseHeightAria: "Increase target height by 1 pixel",
      increaseHeightTitle: "Increase by 1 px",
      splitInto: "Split into",
      sliceCount: "Number of slices",
      decreaseCountAria: "Decrease slice count by 1",
      decreaseCountTitle: "Decrease by 1 slice",
      increaseCountAria: "Increase slice count by 1",
      increaseCountTitle: "Increase by 1 slice",
      sliceUnit: "slices",
      applyEqual: "Apply equal split",
      addGuide: "Add cut line",
      clearGuides: "Clear all cut lines",
      guidePosition: "Cut line position",
      deleteGuide: "Delete selected cut line",
      slicesLabel: "Slices",
      sliceHeightLabel: "Slice height",
      slicePreview: "Slice preview",
      noSlices: "No slices yet",
      preparingExport: "Preparing export",
      cancel: "Cancel",
      downloadAllZip: "Download all as ZIP",
      exportMeta: "Original PNG dimensions · Generated locally",
      languageToggle: "Interface language",
      switchToEnglish: "Switch to English",
      switchToChinese: "Switch to Chinese",
      sampleFilename: "cutimg-sample.png",
      guideAria: "Cut line {index}, at {position} pixels. Use arrow keys to adjust; press Delete to remove.",
      guideTitle: "Cut line {index} · {position} px",
      viewSlice: "View slice {index}, {height} pixels high",
      sliceTitle: "Slice {index}",
      downloadSlice: "Download slice {index}",
      originalMeta: "{dimensions} · Original",
      unreadableImage: "Couldn't read this image. Try another PNG, JPG, or WebP.",
      imageTooShort: "Image must be at least 3 px tall to create two slices.",
      imageTooLarge: "This image is too large for your browser. Resize it and try again.",
      imageLoaded: "Image loaded and split into {count}.",
      invalidFileType: "Choose a PNG, JPG, or WebP image.",
      fileTooLarge: "Image is over 100 MB. Compress it before uploading.",
      imageLoadFailed: "Couldn't load the image. Try again.",
      sampleLoadFailed: "Couldn't load the sample image.",
      targetHeightRange: "Target height must be between 2 and {max} px.",
      sliceCountRange: "Slice count must be between 2 and {max}.",
      tooManySlices: "Maximum 100 slices. Increase the height or reduce the slice count.",
      guideTooClose: "Cut line is too close to an edge or another line.",
      sliceTooLarge: "This slice is too large. Add more cut lines and try again.",
      canvasFailed: "Couldn't create an image canvas. Reduce the slice size.",
      encodeFailed: "Couldn't encode the image. Reduce the slice size.",
      creatingSlice: "Creating slice {current} / {total}",
      completedSlices: "Completed {current} / {total}",
      creatingZip: "Creating ZIP",
      exportedSlices: "Exported {count}.",
      exportedSlice: "Exported slice {index}.",
      exportFailed: "Export failed. Try again.",
      cancelling: "Cancelling…",
      imageRemoved: "Current image removed"
    }
  };

  function normalizeLanguage(value) {
    return String(value || "").toLowerCase().startsWith("zh") ? "zh" : "en";
  }

  function languageForCountry(country) {
    return String(country || "").trim().toUpperCase() === "CN" ? "zh" : "en";
  }

  function languageForBrowser(languages) {
    const values = Array.isArray(languages) ? languages : [languages];
    return values.some((value) => String(value || "").toLowerCase().startsWith("zh")) ? "zh" : "en";
  }

  function t(language, key, variables) {
    const locale = normalizeLanguage(language);
    const template = messages[locale][key] || messages.en[key] || key;
    return String(template).replace(/\{(\w+)\}/g, function (_, name) {
      return variables && Object.prototype.hasOwnProperty.call(variables, name) ? String(variables[name]) : "";
    });
  }

  function formatCount(language, kind, count) {
    const locale = normalizeLanguage(language);
    const value = Number(count);
    if (locale === "zh") return kind === "guide" ? `${value} 条分割线` : `${value} 张`;
    if (kind === "guide") return `${value} cut ${value === 1 ? "line" : "lines"}`;
    return `${value} ${value === 1 ? "slice" : "slices"}`;
  }

  function readManualLanguage(storage) {
    try {
      const value = storage && storage.getItem(MANUAL_LANGUAGE_KEY);
      return value === "zh" || value === "en" ? value : null;
    } catch {
      return null;
    }
  }

  function writeManualLanguage(storage, language) {
    try {
      if (storage) storage.setItem(MANUAL_LANGUAGE_KEY, normalizeLanguage(language));
    } catch {
      // Storage may be unavailable in private or local-file contexts.
    }
  }

  function readAutoLanguage(storage, now) {
    try {
      const record = JSON.parse(storage && storage.getItem(AUTO_LANGUAGE_KEY));
      const currentTime = Number.isFinite(now) ? now : Date.now();
      return record && (record.language === "zh" || record.language === "en") && record.expiresAt > currentTime
        ? record.language
        : null;
    } catch {
      return null;
    }
  }

  function writeAutoLanguage(storage, language, now) {
    try {
      const currentTime = Number.isFinite(now) ? now : Date.now();
      if (storage) storage.setItem(AUTO_LANGUAGE_KEY, JSON.stringify({
        language: normalizeLanguage(language),
        expiresAt: currentTime + AUTO_LANGUAGE_TTL
      }));
    } catch {
      // The automatic language still applies for the current page.
    }
  }

  function initialLanguage(storage, browserLanguages, now) {
    return readManualLanguage(storage) || readAutoLanguage(storage, now) || languageForBrowser(browserLanguages);
  }

  async function detectCountryLanguage(fetchImpl, timeoutMs, injectedCountry) {
    if (/^[A-Za-z]{2}$/.test(String(injectedCountry || ""))) return languageForCountry(injectedCountry);
    if (typeof fetchImpl !== "function") throw new Error("Country lookup unavailable");
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const duration = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : COUNTRY_LOOKUP_TIMEOUT;
    let timeout;
    try {
      const lookup = Promise.resolve().then(async function () {
        const response = await fetchImpl("/api/country", {
          method: "GET",
          headers: { Accept: "application/json" },
          credentials: "same-origin",
          cache: "no-store",
          signal: controller ? controller.signal : undefined
        });
        if (!response.ok) throw new Error("Country lookup failed");
        const data = await response.json();
        const country = String(data && data.country || "").trim().toUpperCase();
        if (!/^[A-Z]{2}$/.test(country)) throw new Error("Invalid country code");
        return languageForCountry(country);
      });

      const expiry = new Promise(function (_, reject) {
        timeout = setTimeout(function () {
          if (controller) controller.abort();
          reject(new Error("Country lookup timed out"));
        }, duration);
      });

      return await Promise.race([lookup, expiry]);
    } finally {
      clearTimeout(timeout);
    }
  }

  async function resolveLanguage(options) {
    const settings = options || {};
    const storage = settings.storage;
    const now = Number.isFinite(settings.now) ? settings.now : Date.now();
    const manual = readManualLanguage(storage);
    if (manual) return { language: manual, source: "manual" };

    const cached = readAutoLanguage(storage, now);
    if (cached) return { language: cached, source: "cache" };

    const fallback = languageForBrowser(settings.browserLanguages);
    let detected;
    try {
      detected = await detectCountryLanguage(
        settings.fetchImpl,
        settings.timeoutMs,
        settings.injectedCountry
      );
    } catch {
      return { language: fallback, source: "browser" };
    }

    // A user may choose a language while the country request is in flight.
    // Re-read persisted state before caching or applying the automatic result.
    const latestManual = readManualLanguage(storage);
    if (latestManual) return { language: latestManual, source: "manual" };
    const latestCached = readAutoLanguage(storage, now);
    if (latestCached) return { language: latestCached, source: "cache" };

    writeAutoLanguage(storage, detected, now);
    return { language: detected, source: "country" };
  }

  return {
    AUTO_LANGUAGE_KEY,
    AUTO_LANGUAGE_TTL,
    COUNTRY_LOOKUP_TIMEOUT,
    MANUAL_LANGUAGE_KEY,
    messages,
    normalizeLanguage,
    languageForCountry,
    languageForBrowser,
    t,
    formatCount,
    readManualLanguage,
    writeManualLanguage,
    readAutoLanguage,
    writeAutoLanguage,
    initialLanguage,
    detectCountryLanguage,
    resolveLanguage
  };
});
