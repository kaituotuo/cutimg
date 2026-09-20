(() => {
  "use strict";

  const core = window.CutimgCore;
  const $ = (id) => document.getElementById(id);
  const els = {
    fileInput: $("file-input"), replace: $("replace-button"), upload: $("upload-button"),
    dropTarget: $("drop-target"), sample: $("sample-button"), canvasShell: $("canvas-shell"),
    empty: $("empty-state"), scroll: $("canvas-scroll"), previewArt: $("preview-art"),
    image: $("preview-image"), layer: $("line-layer"),
    watermark: $("canvas-watermark"), fileTitle: $("file-title"), fileMeta: $("file-meta"),
    statusImage: $("status-image"), statusLines: $("status-lines"), undo: $("undo-button"),
    redo: $("redo-button"), zoomOut: $("zoom-out"), zoomIn: $("zoom-in"), zoomLabel: $("zoom-label"),
    equal: $("mode-equal"), manual: $("mode-manual"), equalControls: $("equal-controls"),
    manualControls: $("manual-controls"), heightBasis: $("basis-height"), countBasis: $("basis-count"),
    heightField: $("height-field"), countField: $("count-field"), height: $("height-input"),
    heightDecrement: $("height-decrement"), heightIncrement: $("height-increment"), count: $("count-input"),
    countDecrement: $("count-decrement"), countIncrement: $("count-increment"),
    apply: $("apply-equal"), addLine: $("add-line"), clearLines: $("clear-lines"),
    selectedLine: $("selected-line"), linePosition: $("line-position"), deleteLine: $("delete-line"),
    sliceTotal: $("slice-total"), sliceHeight: $("slice-height"), panelCount: $("panel-count"),
    resultsCount: $("results-count"), resultsList: $("results-list"), downloadAll: $("download-all"),
    topExport: $("top-export"), exportProgress: $("export-progress"), progressFill: $("progress-fill"),
    progressLabel: $("progress-label"), cancelExport: $("cancel-export"), toast: $("toast")
  };

  const state = {
    image: null, objectUrl: null, name: "", width: 0, height: 0,
    guides: [], mode: "equal", basis: "height", targetHeight: 2000, targetCount: 2,
    history: [], historyIndex: 0, selectedGuide: null, selectedSegment: 0, zoom: 50,
    dragging: null, exporting: false, exportCancelled: false
  };
  const ZOOM_STOPS = [1, 2, 5, 10, 15, 25, 50, 75, 100, 125, 150, 175, 200];
  let toastTimeout;

  function refreshIcons() {
    if (window.lucide) window.lucide.createIcons({ attrs: { "stroke-width": 2 } });
  }

  function notify(message, error = false) {
    clearTimeout(toastTimeout);
    els.toast.textContent = message;
    els.toast.classList.toggle("error", error);
    els.toast.classList.add("visible");
    toastTimeout = setTimeout(() => els.toast.classList.remove("visible"), 3600);
  }

  function snapshot() {
    return {
      guides: [...state.guides], mode: state.mode, basis: state.basis,
      targetHeight: state.targetHeight, targetCount: state.targetCount
    };
  }

  function restore(record) {
    state.guides = [...record.guides];
    state.mode = record.mode;
    state.basis = record.basis;
    state.targetHeight = record.targetHeight;
    state.targetCount = record.targetCount;
    state.selectedGuide = null;
    state.selectedSegment = Math.min(state.selectedSegment, state.guides.length);
    render();
  }

  function recordChange() {
    const next = snapshot();
    if (JSON.stringify(next) === JSON.stringify(state.history[state.historyIndex])) return;
    state.history = state.history.slice(0, state.historyIndex + 1);
    state.history.push(next);
    if (state.history.length > 60) state.history.shift();
    state.historyIndex = state.history.length - 1;
  }

  function sections() { return state.image ? core.segments(state.height, state.guides) : []; }

  function equalInputBounds(basis) {
    if (basis === "height") return { min: 2, max: Math.max(2, state.height - 1) };
    return { min: 2, max: Math.max(2, Math.min(100, state.height)) };
  }

  function updateEqualInputState() {
    const disabled = !state.image || state.exporting;
    const controls = [
      { input: els.height, decrement: els.heightDecrement, increment: els.heightIncrement, basis: "height" },
      { input: els.count, decrement: els.countDecrement, increment: els.countIncrement, basis: "count" }
    ];
    for (const control of controls) {
      if (!state.image) {
        control.input.removeAttribute("min");
        control.input.removeAttribute("max");
        control.input.disabled = true;
        control.input.setAttribute("aria-invalid", "false");
        control.input.setAttribute("aria-describedby", "equal-empty-hint");
        control.decrement.disabled = true;
        control.increment.disabled = true;
        continue;
      }
      const bounds = equalInputBounds(control.basis);
      const value = Number(control.input.value);
      const hasValue = control.input.value.trim() !== "";
      const valid = hasValue && Number.isInteger(value) && value >= bounds.min && value <= bounds.max;
      control.input.min = String(bounds.min);
      control.input.max = String(bounds.max);
      control.input.disabled = disabled;
      control.input.removeAttribute("aria-describedby");
      control.input.setAttribute("aria-invalid", String(hasValue && !valid));
      control.decrement.disabled = disabled || (Number.isFinite(value) && value <= bounds.min);
      control.increment.disabled = disabled || (Number.isFinite(value) && value >= bounds.max);
    }
  }

  function stepEqualInput(input, basis, delta) {
    if (!state.image || state.exporting) return;
    const bounds = equalInputBounds(basis);
    const fallback = basis === "height" ? state.targetHeight : state.targetCount;
    const current = Number(input.value);
    const base = Number.isInteger(current) ? current : fallback;
    input.value = String(Math.max(bounds.min, Math.min(bounds.max, base + delta)));
    updateEqualInputState();
    input.focus();
  }

  function fitZoomToViewport() {
    const style = getComputedStyle(els.scroll);
    const horizontalPadding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const verticalPadding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const availableWidth = Math.max(1, els.scroll.clientWidth - horizontalPadding);
    const availableHeight = Math.max(1, els.scroll.clientHeight - verticalPadding);
    const heightFit = availableHeight * state.width / (availableWidth * state.height) * 100;
    return Math.max(1, Math.min(50, Math.floor(heightFit * 10) / 10));
  }

  function formatZoom(value) {
    const rounded = Math.round(value * 10) / 10;
    return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%`;
  }

  function changeZoom(direction) {
    if (!state.image || state.exporting) return;
    if (direction < 0) {
      state.zoom = [...ZOOM_STOPS].reverse().find((value) => value < state.zoom - 0.01) ?? ZOOM_STOPS[0];
    } else {
      state.zoom = ZOOM_STOPS.find((value) => value > state.zoom + 0.01) ?? ZOOM_STOPS.at(-1);
    }
    render();
  }

  function focusSegment(index) {
    const section = sections()[index];
    if (!section) return;
    state.selectedSegment = index;
    for (const row of els.resultsList.querySelectorAll(".result-row")) {
      const active = Number(row.dataset.index) === index;
      row.classList.toggle("active", active);
      row.querySelector(".row-select")?.setAttribute("aria-pressed", String(active));
    }
    const imageTop = section.start / state.height * els.image.getBoundingClientRect().height;
    els.scroll.scrollTo({ top: Math.max(0, imageTop - 25), behavior: "smooth" });
  }

  function createGuide(index, y) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `guide${state.selectedGuide === index ? " active" : ""}`;
    button.dataset.guideIndex = String(index);
    button.style.top = `${y / state.height * 100}%`;
    button.setAttribute("aria-label", `第 ${index + 1} 条分割线，位置 ${y} 像素；方向键微调，Delete 删除`);
    button.title = `分割线 ${index + 1} · ${y} px`;
    const label = document.createElement("span");
    label.className = "guide-label";
    label.innerHTML = '<i data-lucide="grip-horizontal"></i>';
    const value = document.createElement("span");
    value.className = "guide-value";
    value.textContent = `${y} px`;
    label.append(value);
    button.append(label);

    button.addEventListener("pointerdown", (event) => {
      if (state.exporting || event.button !== 0) return;
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      state.selectedGuide = index;
      state.selectedSegment = index;
      state.dragging = { index, pointerId: event.pointerId, guides: [...state.guides], mode: state.mode };
      button.classList.add("active");
    });
    button.addEventListener("pointermove", (event) => {
      if (!state.dragging || state.dragging.pointerId !== event.pointerId) return;
      const yNext = imageYAt(event.clientY);
      state.guides = core.moveGuide(state.guides, index, yNext, state.height, 40);
      state.mode = "manual";
      button.style.top = `${state.guides[index] / state.height * 100}%`;
      value.textContent = `${state.guides[index]} px`;
      button.title = `分割线 ${index + 1} · ${state.guides[index]} px`;
    });
    button.addEventListener("pointerup", (event) => {
      if (!state.dragging || state.dragging.pointerId !== event.pointerId) return;
      state.dragging = null;
      state.mode = "manual";
      recordChange();
      render();
    });
    button.addEventListener("pointercancel", (event) => {
      if (!state.dragging || state.dragging.pointerId !== event.pointerId) return;
      state.guides = state.dragging.guides;
      state.mode = state.dragging.mode;
      state.dragging = null;
      render();
    });
    button.addEventListener("keydown", (event) => {
      if (state.exporting) return;
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        removeGuide(index);
      } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        const delta = (event.key === "ArrowUp" ? -1 : 1) * (event.shiftKey ? 10 : 1);
        state.guides = core.moveGuide(state.guides, index, state.guides[index] + delta, state.height, 40);
        state.mode = "manual";
        state.selectedGuide = index;
        recordChange();
        render();
        els.layer.querySelector(`[data-guide-index="${index}"]`)?.focus();
      }
    });
    return button;
  }

  function renderGuides() {
    els.layer.replaceChildren(...state.guides.map((y, index) => createGuide(index, y)));
    refreshIcons();
  }

  function createResultRow(section, index) {
    const row = document.createElement("div");
    row.className = `result-row${index === state.selectedSegment ? " active" : ""}`;
    row.dataset.index = String(index);
    const select = document.createElement("button");
    select.type = "button";
    select.className = "row-select";
    select.setAttribute("aria-label", `查看第 ${index + 1} 张切片，${section.height} 像素高`);
    select.setAttribute("aria-pressed", String(index === state.selectedSegment));
    const thumb = document.createElement("span");
    thumb.className = "row-thumbnail";
    const image = document.createElement("img");
    image.alt = "";
    image.src = state.image.src;
    image.style.width = "52px";
    image.style.top = `${27 - ((section.start + section.height / 2) * 52 / state.width)}px`;
    thumb.append(image);
    const copy = document.createElement("span");
    copy.className = "row-copy";
    const title = document.createElement("strong");
    title.textContent = `切片 ${String(index + 1).padStart(2, "0")}`;
    const detail = document.createElement("small");
    detail.textContent = `${state.width} × ${section.height} px`;
    copy.append(title, detail);
    select.append(thumb, copy);
    select.addEventListener("click", () => focusSegment(index));
    const download = document.createElement("button");
    download.type = "button";
    download.className = "icon-btn row-download";
    download.title = `下载切片 ${index + 1}`;
    download.setAttribute("aria-label", `下载切片 ${index + 1}`);
    download.disabled = state.exporting;
    download.innerHTML = '<i data-lucide="download"></i>';
    download.addEventListener("click", () => exportOne(index));
    row.append(select, download);
    return row;
  }

  function renderResults(parts) {
    const scrollTop = els.resultsList.scrollTop;
    if (!state.image) {
      els.resultsList.innerHTML = '<div class="results-empty"><i data-lucide="layers-2"></i><span>暂无切片</span></div>';
    } else {
      els.resultsList.replaceChildren(...parts.map(createResultRow));
    }
    els.resultsList.scrollTop = scrollTop;
    refreshIcons();
  }

  function render() {
    const ready = !!state.image;
    const parts = sections();
    state.selectedSegment = Math.min(state.selectedSegment, Math.max(0, parts.length - 1));
    document.body.classList.toggle("has-image", ready);
    els.empty.hidden = ready;
    els.scroll.hidden = !ready;
    els.watermark.hidden = !ready;
    els.replace.hidden = !ready;
    els.equal.classList.toggle("active", state.mode === "equal");
    els.manual.classList.toggle("active", state.mode === "manual");
    els.equal.setAttribute("aria-pressed", String(state.mode === "equal"));
    els.manual.setAttribute("aria-pressed", String(state.mode === "manual"));
    els.equalControls.hidden = state.mode !== "equal";
    els.manualControls.hidden = state.mode !== "manual";
    els.heightBasis.classList.toggle("active", state.basis === "height");
    els.countBasis.classList.toggle("active", state.basis === "count");
    els.heightBasis.setAttribute("aria-pressed", String(state.basis === "height"));
    els.countBasis.setAttribute("aria-pressed", String(state.basis === "count"));
    els.heightField.hidden = state.basis !== "height";
    els.countField.hidden = state.basis !== "count";
    els.height.value = ready ? String(state.targetHeight) : "";
    els.count.value = ready ? String(state.targetCount) : "";
    els.selectedLine.hidden = !ready || state.selectedGuide == null || state.mode !== "manual";
    if (!els.selectedLine.hidden) els.linePosition.value = String(state.guides[state.selectedGuide]);

    els.fileTitle.textContent = ready ? state.name : "新建分割";
    els.fileTitle.title = ready ? state.name : "";
    els.fileMeta.textContent = ready ? `${state.width} × ${state.height} px · 原图` : "上传长图开始";
    const dot = els.statusImage.querySelector(".status-dot");
    els.statusImage.replaceChildren(dot, document.createTextNode(ready ? `${state.width} × ${state.height} px` : "等待图片"));
    els.statusLines.textContent = `${state.guides.length} 条分割线`;
    els.panelCount.textContent = String(parts.length).padStart(2, "0");
    els.sliceTotal.textContent = ready ? `${parts.length} 张` : "--";
    const heights = parts.map((part) => part.height);
    els.sliceHeight.textContent = ready ? `${Math.min(...heights)}${Math.min(...heights) === Math.max(...heights) ? "" : `–${Math.max(...heights)}`} px` : "--";
    els.resultsCount.textContent = `${parts.length} 张`;
    els.zoomLabel.textContent = formatZoom(state.zoom);
    els.undo.disabled = !ready || state.exporting || state.historyIndex <= 0;
    els.redo.disabled = !ready || state.exporting || state.historyIndex >= state.history.length - 1;
    els.zoomOut.disabled = !ready || state.zoom <= ZOOM_STOPS[0];
    els.zoomIn.disabled = !ready || state.zoom >= ZOOM_STOPS.at(-1);
    els.apply.disabled = !ready || state.exporting;
    els.addLine.disabled = !ready || state.exporting || state.guides.length >= 99;
    els.clearLines.disabled = !ready || state.exporting || state.guides.length === 0;
    els.downloadAll.disabled = !ready || state.exporting;
    els.topExport.disabled = !ready || state.exporting;
    els.replace.disabled = state.exporting;
    els.equal.disabled = state.exporting;
    els.manual.disabled = state.exporting;
    els.heightBasis.disabled = state.exporting;
    els.countBasis.disabled = state.exporting;
    els.deleteLine.disabled = state.exporting;
    els.linePosition.disabled = state.exporting;
    updateEqualInputState();
    if (ready) {
      els.previewArt.style.setProperty("--zoom", `${state.zoom}%`);
      renderGuides();
    }
    renderResults(parts);
  }

  function imageYAt(clientY) {
    const rect = els.image.getBoundingClientRect();
    return Math.round((clientY - rect.top) / rect.height * state.height);
  }

  async function useImage(image, name, objectUrl = null) {
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("图片无法读取，请换一张 PNG、JPG 或 WebP。");
    if (image.naturalHeight < 3) throw new Error("图片高度至少需要 3 px，才能分成两张。");
    if (image.naturalWidth * image.naturalHeight > 180_000_000) throw new Error("图片尺寸过大，当前浏览器可能无法处理。请先缩小原图。");
    const oldUrl = state.objectUrl;
    state.image = image;
    state.objectUrl = objectUrl;
    state.name = name;
    state.width = image.naturalWidth;
    state.height = image.naturalHeight;
    state.mode = "equal";
    state.basis = "height";
    state.targetHeight = Math.max(2, Math.min(2000, Math.ceil(state.height / 2)));
    state.guides = core.equalCuts(state.height, "height", state.targetHeight);
    state.targetCount = state.guides.length + 1;
    state.selectedGuide = null;
    state.selectedSegment = 0;
    state.zoom = 50;
    state.history = [snapshot()];
    state.historyIndex = 0;
    els.image.src = image.src;
    els.scroll.scrollTop = 0;
    els.resultsList.scrollTop = 0;
    render();
    await new Promise(requestAnimationFrame);
    state.zoom = fitZoomToViewport();
    render();
    await new Promise(requestAnimationFrame);
    const settledZoom = fitZoomToViewport();
    if (settledZoom < state.zoom) {
      state.zoom = settledZoom;
      render();
    }
    if (oldUrl) URL.revokeObjectURL(oldUrl);
    notify(`已载入图片，分成 ${state.targetCount} 张`);
  }

  async function loadFile(file) {
    if (!file || state.exporting) return;
    if (!/^(image\/png|image\/jpeg|image\/webp)$/.test(file.type) && !/\.(png|jpe?g|webp)$/i.test(file.name)) {
      notify("请选择 PNG、JPG 或 WebP 图片。", true);
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      notify("图片超过 100 MB，请先压缩原文件。", true);
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
      await useImage(image, file.name, url);
    } catch (error) {
      URL.revokeObjectURL(url);
      notify(error.message || "图片加载失败，请重试。", true);
    }
  }

  async function loadSample() {
    if (state.exporting) return;
    const image = new Image();
    image.src = "assets/demo-long.png";
    try {
      await image.decode();
      await useImage(image, "示例长图 · 六猫制作分享.png");
    } catch {
      notify("示例图片加载失败。", true);
    }
  }

  function applyEqual() {
    if (!state.image || state.exporting) return;
    const source = state.basis === "height" ? els.height : els.count;
    const value = Number(source.value);
    const bounds = equalInputBounds(state.basis);
    if (!Number.isInteger(value) || value < bounds.min || value > bounds.max) {
      notify(state.basis === "height"
        ? `目标高度需在 2–${bounds.max} px 之间。`
        : `张数需在 2–${bounds.max} 之间。`, true);
      source.focus();
      updateEqualInputState();
      return;
    }
    const requestedCount = state.basis === "height" ? Math.ceil(state.height / value) : value;
    if (requestedCount > 100) {
      notify("一次最多分成 100 张，请增大高度或减少张数。", true);
      source.focus();
      return;
    }
    state.mode = "equal";
    if (state.basis === "height") state.targetHeight = value;
    else state.targetCount = value;
    state.guides = core.equalCuts(state.height, "count", requestedCount);
    state.targetCount = state.guides.length + 1;
    state.selectedGuide = null;
    state.selectedSegment = 0;
    recordChange();
    render();
  }

  function switchMode(mode) {
    if (state.exporting || state.mode === mode) return;
    state.mode = mode;
    recordChange();
    render();
  }

  function switchBasis(basis) {
    if (state.exporting || state.basis === basis) return;
    state.basis = basis;
    recordChange();
    render();
  }

  function addGuideAt(y) {
    if (!state.image || state.exporting || state.guides.length >= 99) return;
    const next = core.addGuide(state.guides, y, state.height, 40);
    if (next.length === state.guides.length) {
      notify("分割线与边缘或其他分割线距离太近。", true);
      return;
    }
    state.guides = next;
    state.selectedGuide = next.indexOf(y);
    state.selectedSegment = Math.max(0, state.selectedGuide);
    state.mode = "manual";
    recordChange();
    render();
  }

  function removeGuide(index) {
    if (!state.image || state.exporting || index == null) return;
    state.guides.splice(index, 1);
    state.selectedGuide = null;
    state.selectedSegment = Math.min(index, state.guides.length);
    state.mode = "manual";
    recordChange();
    render();
  }

  function baseName() {
    return state.name.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]/g, "-").slice(0, 48) || "cutimg";
  }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  function pngFor(section, image, width) {
    if (width > 16384 || section.height > 16384 || width * section.height > 65_000_000) {
      return Promise.reject(new Error("单张切片尺寸太大，请增加分割线后重试。"));
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = section.height;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return Promise.reject(new Error("浏览器无法创建图片画布，请缩小切片尺寸。"));
    context.drawImage(image, 0, section.start, width, section.height, 0, 0, width, section.height);
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("图片编码失败，请缩小切片尺寸。")), "image/png");
    });
  }

  function setExportProgress(done, total, label) {
    els.exportProgress.hidden = false;
    els.progressFill.style.width = `${done / total * 100}%`;
    els.progressLabel.textContent = label;
  }

  async function exportPieces(index = null) {
    if (!state.image || state.exporting) return;
    const parts = sections();
    const selected = index == null ? parts.map((part, i) => ({ part, index: i })) : [{ part: parts[index], index }];
    if (selected.some(({ part }) => !part)) return;
    state.exporting = true;
    state.exportCancelled = false;
    render();
    const files = [];
    try {
      for (const [position, item] of selected.entries()) {
        if (state.exportCancelled) return;
        setExportProgress(position, selected.length, `生成切片 ${position + 1} / ${selected.length}`);
        await new Promise(requestAnimationFrame);
        const blob = await pngFor(item.part, state.image, state.width);
        files.push({ name: `cutimg-${String(item.index + 1).padStart(2, "0")}.png`, blob });
        setExportProgress(position + 1, selected.length, `已完成 ${position + 1} / ${selected.length}`);
      }
      if (state.exportCancelled) return;
      if (index == null) {
        els.progressLabel.textContent = "正在打包 ZIP";
        const archive = await core.buildZip(files);
        if (state.exportCancelled) return;
        downloadBlob(archive, `${baseName()}-cutimg-${files.length}.zip`);
        notify(`已导出 ${files.length} 张切片`);
      } else {
        downloadBlob(files[0].blob, `${baseName()}-${files[0].name}`);
        notify(`已导出切片 ${index + 1}`);
      }
    } catch (error) {
      notify(error.message || "导出失败，请重试。", true);
    } finally {
      state.exporting = false;
      els.exportProgress.hidden = true;
      render();
    }
  }

  function exportOne(index) { return exportPieces(index); }

  els.upload.addEventListener("click", (event) => { event.stopPropagation(); els.fileInput.click(); });
  els.replace.addEventListener("click", () => els.fileInput.click());
  els.dropTarget.addEventListener("click", () => els.fileInput.click());
  els.fileInput.addEventListener("change", () => { loadFile(els.fileInput.files?.[0]); els.fileInput.value = ""; });
  els.sample.addEventListener("click", loadSample);
  els.canvasShell.addEventListener("dragover", (event) => { event.preventDefault(); els.canvasShell.classList.add("is-dragover"); });
  els.canvasShell.addEventListener("dragleave", (event) => {
    if (!els.canvasShell.contains(event.relatedTarget)) els.canvasShell.classList.remove("is-dragover");
  });
  els.canvasShell.addEventListener("drop", (event) => {
    event.preventDefault();
    els.canvasShell.classList.remove("is-dragover");
    loadFile([...event.dataTransfer.files].find((file) => file.type.startsWith("image/")) || event.dataTransfer.files[0]);
  });
  window.addEventListener("paste", (event) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    const image = [...(event.clipboardData?.files || [])].find((file) => file.type.startsWith("image/"));
    if (image) loadFile(image);
  });
  els.image.addEventListener("click", (event) => addGuideAt(imageYAt(event.clientY)));

  els.equal.addEventListener("click", () => switchMode("equal"));
  els.manual.addEventListener("click", () => switchMode("manual"));
  els.heightBasis.addEventListener("click", () => switchBasis("height"));
  els.countBasis.addEventListener("click", () => switchBasis("count"));
  els.apply.addEventListener("click", applyEqual);
  for (const input of [els.height, els.count]) {
    input.addEventListener("input", updateEqualInputState);
    input.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); applyEqual(); input.blur(); } });
  }
  els.heightDecrement.addEventListener("click", () => stepEqualInput(els.height, "height", -1));
  els.heightIncrement.addEventListener("click", () => stepEqualInput(els.height, "height", 1));
  els.countDecrement.addEventListener("click", () => stepEqualInput(els.count, "count", -1));
  els.countIncrement.addEventListener("click", () => stepEqualInput(els.count, "count", 1));
  els.addLine.addEventListener("click", () => {
    if (!state.image) return;
    const segment = sections()[state.selectedSegment] || sections().sort((a, b) => b.height - a.height)[0];
    const y = Math.round((segment.start + segment.end) / 2);
    addGuideAt(y);
    focusSegment(state.selectedSegment);
  });
  els.clearLines.addEventListener("click", () => {
    if (!state.image || state.exporting || !state.guides.length) return;
    state.guides = [];
    state.selectedGuide = null;
    state.selectedSegment = 0;
    state.mode = "manual";
    recordChange();
    render();
  });
  els.linePosition.addEventListener("change", () => {
    if (state.selectedGuide == null || state.exporting) return;
    state.guides = core.moveGuide(state.guides, state.selectedGuide, Number(els.linePosition.value), state.height, 40);
    state.mode = "manual";
    recordChange();
    render();
  });
  els.deleteLine.addEventListener("click", () => removeGuide(state.selectedGuide));
  els.undo.addEventListener("click", () => {
    if (state.exporting || state.historyIndex <= 0) return;
    restore(state.history[--state.historyIndex]);
  });
  els.redo.addEventListener("click", () => {
    if (state.exporting || state.historyIndex >= state.history.length - 1) return;
    restore(state.history[++state.historyIndex]);
  });
  window.addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || state.exporting) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      (event.shiftKey ? els.redo : els.undo).click();
    } else if (event.key === "Escape" && state.dragging) {
      state.guides = state.dragging.guides;
      state.mode = state.dragging.mode;
      state.dragging = null;
      render();
    }
  });
  els.zoomOut.addEventListener("click", () => changeZoom(-1));
  els.zoomIn.addEventListener("click", () => changeZoom(1));
  els.downloadAll.addEventListener("click", () => exportPieces());
  els.topExport.addEventListener("click", () => exportPieces());
  els.cancelExport.addEventListener("click", () => { state.exportCancelled = true; els.progressLabel.textContent = "正在取消…"; });

  render();
})();
