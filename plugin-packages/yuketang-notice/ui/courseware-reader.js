import { sdk, icon, esc, pushBackHandler } from './shared.js';
import { readCourseware, COURSEWARE_PROGRESS_HINT, coursewareOfficialUrl } from './courseware-api.js';
import { createSlideSvg, prepareSlideLayout, decodeSlideImage } from './courseware-layout.js';

let activeReader;

export function openCoursewareReader(item) {
  activeReader?.();
  const previousFocus = document.activeElement;
  const sheet = document.getElementById('sheet');
  if (sheet) { sheet.inert = true; sheet.setAttribute('aria-hidden', 'true'); }
  const root = document.createElement('section');
  root.id = 'courseware-reader'; root.className = 'courseware-reader';
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', '阅读课件');
  const button = (id, ic, name) => `<button class="icon" id="${id}" aria-label="${name}">${icon(ic)}</button>`;
  root.innerHTML = `<header class="cr-header">${button('cr-back','prev','返回课件详情')}<h2>${esc(item.title)}</h2><button class="secondary cr-rotate" id="cr-rotate">${icon('rotate')}<span>横屏</span></button></header>
    <div class="cr-stage"><div class="cr-page" hidden></div><div class="cr-status" role="status"></div></div>
    <footer class="cr-controls"><div class="cr-paging">${button('cr-prev','prev','上一页')}<label class="cr-number"><input id="cr-page-number" type="number" min="1" inputmode="numeric" aria-label="跳转到页码"><span id="cr-total"></span></label>${button('cr-next','next','下一页')}</div>
    <div class="cr-zoom">${button('cr-out','zoomOut','缩小')}<span class="cr-percent" role="status"></span>${button('cr-in','zoomIn','放大')}${button('cr-fit','refresh','适应页面')}</div><button class="cr-quality secondary" hidden></button><div class="cr-help cr-gesture-help">单击放大 · 左右翻页 · 双指缩放</div><div class="cr-official"><p class="cr-help">${esc(COURSEWARE_PROGRESS_HINT)}</p><button class="secondary" id="cr-official">前往雨课堂</button><div class="cr-official-error" role="alert" hidden></div></div></footer>`;
  document.body.append(root);
  const find = id => root.querySelector('#' + id);
  const stage = root.querySelector('.cr-stage'), page = root.querySelector('.cr-page');
  const status = root.querySelector('.cr-status'), quality = root.querySelector('.cr-quality');
  const input = find('cr-page-number');
  find('cr-official').onclick = async () => {
    const control = find('cr-official'), error = root.querySelector('.cr-official-error');
    if (control.disabled) return;
    control.disabled = true; control.setAttribute('aria-busy', 'true'); error.hidden = true;
    control.innerHTML = '<span class="spinner"></span>前往雨课堂';
    try { await sdk.request('ui.openExternal', { url: coursewareOfficialUrl(item, sdk.state.data.settings?.site) }); }
    catch (failure) { error.textContent = failure.message || '雨课堂打开失败，请重试'; error.hidden = false; }
    finally { control.disabled = false; control.removeAttribute('aria-busy'); control.textContent = '前往雨课堂'; }
  };
  let documentData, index = 0, zoom = 1, tx = 0, ty = 0, fitWidth = 0, fitHeight = 0;
  let controller, timeout, imageTimeout, pageController, imageSequence = 0, closed = false, sequence = 0, imageLoaded = false, imageWidth = 0, imageHeight = 0;
  const points = new Map();
  let pan, pinch, tapTimer = 0, lastTap = 0, lastTapPoint;
  let releaseBack = () => {};
  const clamp = () => {
    const maxX = Math.max(0, (fitWidth * zoom - stage.clientWidth) / 2);
    const maxY = Math.max(0, (fitHeight * zoom - stage.clientHeight) / 2);
    tx = Math.max(-maxX, Math.min(maxX, tx)); ty = Math.max(-maxY, Math.min(maxY, ty));
  };
  const apply = () => {
    clamp(); page.style.transform = `translate(${tx}px,${ty}px) scale(${zoom})`;
    root.querySelector('.cr-percent').textContent = `${Math.round(zoom * 100)}%`;
    find('cr-out').disabled = !imageLoaded || zoom <= 1;
    find('cr-in').disabled = !imageLoaded || zoom >= 5;
    find('cr-fit').disabled = !imageLoaded || zoom === 1;
  };
  const point = e => { const r = stage.getBoundingClientRect(); return { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 }; };
  const zoomAt = (value, center = { x: 0, y: 0 }) => {
    const next = Math.max(1, Math.min(5, value)), ratio = next / zoom;
    tx = center.x + (tx - center.x) * ratio; ty = center.y + (ty - center.y) * ratio;
    zoom = next; apply();
  };
  const fit = () => {
    if (!imageLoaded) return;
    const current = documentData.pages[index], width = current.width || imageWidth, height = current.height || imageHeight;
    const ratio = Math.min(stage.clientWidth / width, stage.clientHeight / height);
    fitWidth = width * ratio; fitHeight = height * ratio;
    page.style.width = fitWidth + 'px'; page.style.height = fitHeight + 'px'; apply();
  };
  const controls = () => {
    input.value = String(index + 1); input.max = String(documentData?.pages.length || 1); input.disabled = !documentData;
    find('cr-total').textContent = documentData ? `/ ${documentData.pages.length}` : '/ —';
    find('cr-prev').disabled = !documentData || index === 0;
    find('cr-next').disabled = !documentData || index >= documentData.pages.length - 1;
    apply();
  };
  const message = (text, retry = false) => {
    status.hidden = false;
    status.innerHTML = retry ? `<span>${esc(text)}</span><button class="secondary" id="cr-retry">${icon('refresh')}重试</button>` : `<span class="spinner"></span><span>${esc(text)}</span>`;
    status.querySelector('button')?.addEventListener('click', () => documentData ? show() : load());
  };
  const show = async () => {
    clearTimeout(imageTimeout); clearTimeout(tapTimer); pageController?.abort();
    const request = ++imageSequence; pageController = new AbortController();
    const signal = pageController.signal;
    let timedOut = false;
    imageLoaded = false; zoom = 1; tx = ty = 0; points.clear(); pan = pinch = null; lastTap = 0;
    page.hidden = true; quality.hidden = true; controls(); message('正在加载课件页面…');
    const current = documentData.pages[index];
    const title = `${item.title}，第 ${index + 1} 页`;
    if (!current.url && !current.layout) { message('这一页暂时无法预览，请重试或切换其他页', true); return; }
    imageTimeout = setTimeout(() => { timedOut = true; pageController?.abort(); }, 20000);
    try {
      let content, degraded = false;
      if (current.layout) {
        try { await prepareSlideLayout(current.layout, { signal }); content = createSlideSvg(current.layout, title); }
        catch (error) { if (signal.aborted || !current.url) throw error; degraded = true; }
      }
      if (!content) {
        let image;
        try { image = await decodeSlideImage(current.url, { signal }); }
        catch (error) {
          if (signal.aborted || !current.fallbackUrl) throw error;
          image = await decodeSlideImage(current.fallbackUrl, { signal }); degraded = true;
        }
        image.alt = title; image.draggable = false;
        image.style.objectFit = current.width ? 'fill' : 'contain';
        imageWidth = image.naturalWidth; imageHeight = image.naturalHeight; content = image;
        degraded ||= imageWidth < 400;
      }
      if (closed || request !== imageSequence || signal.aborted) return;
      page.replaceChildren(content); imageLoaded = true; fit(); page.hidden = false; status.hidden = true;
      quality.textContent = current.layout || current.fallbackUrl ? '高清加载失败，点击重试' : '这页仅提供缩略图，点击重试';
      quality.hidden = !degraded; quality.onclick = load;
    } catch (error) {
      if (!closed && request === imageSequence && (timedOut || !signal.aborted)) message(timedOut ? '这一页加载超时，请重试' : '这一页加载失败，请重试', true);
    } finally { if (request === imageSequence) clearTimeout(imageTimeout); }
  };
  async function load() {
    controller?.abort(); clearTimeout(timeout); clearTimeout(imageTimeout);
    pageController?.abort(); ++imageSequence; page.replaceChildren();
    const request = ++sequence; controller = new AbortController();
    const currentController = controller;
    let timedOut = false;
    timeout = setTimeout(() => { timedOut = true; currentController.abort(); }, 20000);
    page.hidden = true; imageLoaded = false; message('正在读取课件…');
    documentData = undefined; controls();
    try {
      const data = await readCourseware(item, { site: sdk.state.data.settings?.site, signal: currentController.signal });
      if (closed || request !== sequence) return;
      documentData = data; index = Math.min(index, data.pages.length - 1); show();
    } catch (error) {
      if (!closed && request === sequence) message(timedOut ? '课件读取超时，请重试' : error.message || '课件读取失败，请重试', true);
    } finally { if (request === sequence) clearTimeout(timeout); }
  }
  const go = next => { if (!documentData || next < 0 || next >= documentData.pages.length || next === index) return; index = next; show(); };
  find('cr-prev').onclick = () => go(index - 1); find('cr-next').onclick = () => go(index + 1);
  input.onchange = () => { const n = Number(input.value); if (documentData && Number.isInteger(n) && n > 0) go(Math.min(documentData.pages.length - 1, n - 1)); input.value = String(index + 1); };
  input.onkeydown = e => { if (e.key === 'Enter') { input.onchange(); input.blur(); } };
  find('cr-out').onclick = () => zoomAt(zoom / 1.5); find('cr-in').onclick = () => zoomAt(zoom * 1.5);
  find('cr-fit').onclick = () => zoomAt(1);
  stage.onpointerdown = e => {
    if (!imageLoaded || e.target.closest('button')) return;
    stage.setPointerCapture(e.pointerId); const p = point(e); points.set(e.pointerId, p);
    if (points.size === 1) pan = { ...p, tx, ty };
    if (points.size === 2) {
      const [a,b] = [...points.values()];
      pinch = { distance: Math.hypot(a.x-b.x,a.y-b.y), x:(a.x+b.x)/2, y:(a.y+b.y)/2, zoom, tx, ty };
    }
  };
  stage.onpointermove = e => {
    if (!points.has(e.pointerId)) return;
    const p = point(e); points.set(e.pointerId, p);
    if (points.size === 2 && pinch?.distance) {
      const [a,b] = [...points.values()]; zoom = Math.max(1, Math.min(5, pinch.zoom * Math.hypot(a.x-b.x,a.y-b.y)/pinch.distance));
      const ratio = zoom/pinch.zoom;
      tx = (a.x+b.x)/2 - (pinch.x-pinch.tx)*ratio; ty = (a.y+b.y)/2 - (pinch.y-pinch.ty)*ratio;
      apply();
    } else if (points.size === 1 && pan && zoom > 1) { tx = pan.tx+p.x-pan.x; ty = pan.ty+p.y-pan.y; apply(); }
  };
  const lift = e => {
    if (!points.has(e.pointerId)) return;
    const p = point(e), wasPinch = Boolean(pinch); points.delete(e.pointerId);
    if (points.size === 1) { pan = { ...[...points.values()][0], tx, ty }; return; }
    if (points.size) return;
    if (e.type !== 'pointercancel' && !wasPinch && pan) {
      const dx = p.x-pan.x, dy = p.y-pan.y;
      const edge = Math.max(0, (fitWidth * zoom - stage.clientWidth) / 2);
      if (Math.abs(dx)>60 && Math.abs(dx)>Math.abs(dy) &&
          (zoom === 1 || (dx < 0 ? pan.tx <= -edge + 2 : pan.tx >= edge - 2))) {
        pan = pinch = null; go(index+(dx<0?1:-1)); return;
      }
      if (Math.hypot(dx,dy)<12) {
        const time = Date.now();
        if (time-lastTap<280 && lastTapPoint && Math.hypot(p.x-lastTapPoint.x,p.y-lastTapPoint.y)<24) { clearTimeout(tapTimer); zoomAt(1); lastTap = 0; }
        else { lastTap = time; lastTapPoint = p; clearTimeout(tapTimer); tapTimer = setTimeout(() => { if (!closed && imageLoaded && zoom === 1) zoomAt(2.5, p); }, 280); }
      }
    }
    pan = pinch = null; apply();
  };
  stage.onpointerup = lift; stage.onpointercancel = lift;
  const updateOrientation = () => {
    const landscape = innerWidth > innerHeight;
    root.classList.toggle('landscape', landscape);
    find('cr-rotate').querySelector('span').textContent = landscape ? '竖屏' : '横屏';
    find('cr-rotate').setAttribute('aria-label', landscape ? '切换到竖屏' : '切换到横屏');
    fit();
  };
  find('cr-rotate').onclick = async () => {
    const control = find('cr-rotate'); if (control.disabled) return;
    control.disabled = true;
    try { await sdk.request('ui.orientation', { mode: innerWidth > innerHeight ? 'portrait' : 'landscape' }); }
    catch (error) { const message = root.querySelector('.cr-official-error'); message.textContent = error.message || '屏幕切换失败，请重试'; message.hidden = false; }
    finally { control.disabled = false; }
  };
  updateOrientation(); window.addEventListener('resize', updateOrientation);
  const resize = new ResizeObserver(fit); resize.observe(stage);
  const close = () => {
    if (closed) return; closed = true; ++sequence; ++imageSequence; controller?.abort(); pageController?.abort(); clearTimeout(timeout); clearTimeout(imageTimeout); clearTimeout(tapTimer); resize.disconnect();
    page.replaceChildren(); root.remove(); window.removeEventListener('resize', updateOrientation);
    sdk.request('ui.orientation', { mode: 'restore' }).catch(() => {});
    if (sheet?.isConnected) { sheet.inert = false; sheet.removeAttribute('aria-hidden'); }
    releaseBack(); document.removeEventListener('keydown', key, true);
    window.removeEventListener('cursimple-visibility', visibility);
    previousFocus?.focus({ preventScroll:true }); if (activeReader === close) activeReader = undefined;
  };
  const key = e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); }
    else if (e.target.tagName !== 'INPUT' && ['ArrowLeft','ArrowRight'].includes(e.key)) { e.preventDefault(); e.stopImmediatePropagation(); go(index+(e.key==='ArrowRight'?1:-1)); }
    else if (e.key === 'Tab') {
      const focusable = [...root.querySelectorAll('button:not(:disabled),input:not(:disabled)')];
      const target = e.shiftKey?focusable.at(-1):focusable[0];
      if (document.activeElement===(e.shiftKey?focusable[0]:focusable.at(-1))) { e.preventDefault(); target.focus(); }
    }
  };
  const visibility = e => { if (e.detail?.visible === false) close(); };
  find('cr-back').onclick = close; activeReader = close;
  releaseBack = pushBackHandler(close); document.addEventListener('keydown', key, true);
  window.addEventListener('cursimple-visibility', visibility);
  find('cr-back').focus(); load();
}
