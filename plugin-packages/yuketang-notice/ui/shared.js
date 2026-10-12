import {materialIcon} from './material-icons.js';
export const sdk = window.CurSimpleComponent;
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const icon = name => materialIcon(name) || materialIcon('info');
export const iconButton = (id,name,label) => `<button class="icon" id="${id}" aria-label="${label}">${icon(name)}</button>`;
export function applyTheme(state) {
 const scale=Number(state?.context?.fontScale);
 if(Number.isFinite(scale)&&scale>0)document.documentElement.style.setProperty("--font-scale",String(scale));
 const t=state?.context?.theme;if(!t)return;
 const map={background:'bg',surface:'card',surfaceVariant:'group',surfaceContainerLow:'surface-low',onSurface:'text',onSurfaceVariant:'muted',outlineVariant:'line',primary:'accent',onPrimary:'on-accent',primaryContainer:'accent-soft',onPrimaryContainer:'on-soft',error:'danger',onError:'tool-on-error',errorContainer:'danger-soft'};
 for(const [key,value] of Object.entries(map))if(/^#[\da-f]{6,8}$/i.test(t[key]||''))document.documentElement.style.setProperty('--'+value,t[key]);
 if(/^#[\da-f]{6}$/i.test(t.primary||''))document.documentElement.style.setProperty('--accent-line',t.primary+'8c');
 document.documentElement.style.colorScheme=t.dark?'dark':'light';
 // State colors follow host dark mode rather than WebView prefers-color-scheme.
 document.documentElement.dataset.theme=t.dark?'dark':'light';
}
/** Owned dropdown avoids unsupported native WebView select dialogs. */
export function selectField({id,label,description,value,options,onPick}) {
  const current = options.find(o => String(o.value) === String(value)) ?? options[0];
  const menuId = `${id}-menu`;
  const items = options.map(o => `<button type="button" class="option${String(o.value)===String(current?.value)?' on':''}" data-pick="${esc(o.value)}"><span>${esc(o.label)}</span>${String(o.value)===String(current?.value)?icon('check'):''}</button>`).join('');
  return {
    html: `<div class="field-block"><span class="field-label">${esc(label)}</span>${description?`<small>${esc(description)}</small>`:''}` +
      `<button type="button" class="select" id="${id}" aria-haspopup="listbox" aria-expanded="false" aria-controls="${menuId}"><span>${esc(current?.label ?? '')}</span>${icon('next')}</button>` +
      `<div class="select-menu" id="${menuId}" role="listbox" hidden>${items}</div></div>`,
    bind(root) {
      const trigger = root.querySelector(`#${id}`), menu = root.querySelector(`#${menuId}`);
      if (!trigger || !menu) return;
      trigger.onclick = () => { const open = trigger.getAttribute('aria-expanded') === 'true'; trigger.setAttribute('aria-expanded', String(!open)); menu.hidden = open; };
      menu.querySelectorAll('[data-pick]').forEach(b => { b.onclick = () => { trigger.setAttribute('aria-expanded','false'); menu.hidden = true; onPick(b.dataset.pick); }; });
    },
  };
}

export const bannerHtml = (text, tone='info') =>
  `<div class="banner ${{ok:1,err:1,info:1}[tone]?tone:'info'}">${esc(text)}</div>`;

export const segmented = (id, items, value) => `<div class="segs" role="tablist" id="${id}"><span class="seg-thumb" aria-hidden="true"></span>${items.map(i=>
  `<button type="button" data-seg="${esc(i.id)}" role="tab" aria-selected="${i.id===value}" class="${i.id===value?'on':''}">${i.icon?icon(i.icon):''}${esc(i.label)}</button>`).join('')}</div>`;

const segLast = new Map();

export function bindSegmented(root, id, onPick) {
  const segs = root.querySelector(`#${id}`);
  if (!segs) return;
  const thumb = segs.querySelector('.seg-thumb');
  if (!thumb) return;
  thumb.style.visibility = 'hidden';
  const prev = segLast.get(id);
  const cur = () => segs.querySelector('[data-seg][aria-selected="true"],[data-seg].on');
  const place = () => {
    const c = cur();
    if (!c) return;
    thumb.style.width = `${c.offsetWidth}px`;
    thumb.style.transform = `translateX(${c.offsetLeft}px)`;
    thumb.style.visibility = 'visible';
    segLast.set(id, { w: thumb.style.width, x: thumb.style.transform });
  };
  segs.querySelectorAll('[data-seg]').forEach(b => { b.onclick = () => onPick(b.dataset.seg); });
  requestAnimationFrame(() => {
    thumb.style.transition = 'none';
    if (prev) {
      thumb.style.width = prev.w;
      thumb.style.transform = prev.x;
      thumb.style.visibility = 'visible';
    } else {
      // Position initial selection without animation.
      const c = cur();
      if (c) { thumb.style.width = `${c.offsetWidth}px`; thumb.style.transform = `translateX(${c.offsetLeft}px)`; thumb.style.visibility = 'visible'; }
    }
    void thumb.offsetWidth;
    thumb.style.transition = '';
    if (prev) place();
    else { const c = cur(); if (c) segLast.set(id, { w: thumb.style.width, x: thumb.style.transform }); }
  });
}

export function bindAll(root, parts) { parts.forEach(p => p?.bind?.(root)); }

export function message(text, error=false) {const el=document.getElementById('feedback');if(el){el.textContent=text;el.hidden=!text;el.className=error?'feedback error':'feedback';}}
let activeClose;
const overlayBackHandlers = [];
/** Temporarily route the host's back action to an overlay above a sheet. */
export function pushBackHandler(close) {
 overlayBackHandlers.push(close);sheetBackState(true);
 return()=>{const index=overlayBackHandlers.lastIndexOf(close);if(index>=0)overlayBackHandlers.splice(index,1);sheetBackState(Boolean(activeClose));};
}
const reducedMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
window.addEventListener('cursimple-back',()=>{(overlayBackHandlers.at(-1)||activeClose)?.();});
const sheetBackState=enabled=>{if(sdk)sdk.request('ui.navigation',{canGoBack:enabled||overlayBackHandlers.length>0}).catch(()=>{});};
/** Keep the sheet container stable; animate only navigation, never background refreshes. */
export function sheet(title, body, bind, {back=false,onClose}={}) {
 let overlay=document.getElementById('sheet');
 const reuse=overlay&&!overlay.classList.contains('closing');
 const changed=reuse&&overlay.dataset.title!==title;
 const previousFocus=document.activeElement;
 const focused=reuse&&overlay.contains(previousFocus)?previousFocus:null;
 const focusAttribute=focused&&['data-host','data-setting','data-rule-key','aria-label'].find(name=>focused.hasAttribute(name));
 const focusSelector=focused?.id?'#'+CSS.escape(focused.id):focusAttribute?`[${focusAttribute}="${CSS.escape(focused.getAttribute(focusAttribute))}"]`:null;
 const focusedValue=focusSelector&&previousFocus.matches('input:not([type=checkbox]),textarea')?previousFocus.value:undefined;
 const selection=focusSelector&&typeof previousFocus.selectionStart==='number'?[previousFocus.selectionStart,previousFocus.selectionEnd]:null;
 const keep=reuse&&!changed?overlay.querySelector('.sheet-body')?.scrollTop:0;
 overlay?._finishTransition?.();
 let previous=null,oldHeight=0,previousScroll=0;
 if(changed&&!reducedMotion()){
  const panel=overlay.querySelector('.sheet'),content=overlay.querySelector('.sheet-body');
  oldHeight=panel.getBoundingClientRect().height;
  previous=content.cloneNode(true);previous.inert=true;previous.setAttribute('aria-hidden','true');
  previous.querySelectorAll('[id]').forEach(x=>x.removeAttribute('id'));
  previous.classList.add('sheet-previous');
  previous.style.top=content.offsetTop+'px';previous.style.height=content.getBoundingClientRect().height+'px';
  previousScroll=content.scrollTop;
 }
 if(!reuse){
  activeClose?.();overlay?.remove();overlay=document.createElement('div');overlay.id='sheet';overlay.className='scrim';
  overlay.innerHTML=`<section class="sheet" role="dialog" aria-modal="true"><div class="sheet-grip"><div class="sheet-handle"></div><header><h2></h2>${iconButton('sheet-close','close','关闭')}</header></div><div class="sheet-body"></div></section>`;
  overlay._focus=previousFocus;
  document.body.append(overlay);document.getElementById('app').inert=true;document.body.classList.add('sheet-open');sheetBackState(true);
 }
 overlay.dataset.title=title;
 const panel=overlay.querySelector('.sheet'),content=overlay.querySelector('.sheet-body');
 panel.setAttribute('aria-label',title);overlay.querySelector('h2').textContent=title;
 content.innerHTML=body;content.scrollTop=keep||0;
 let closed=false;
 const close=()=>{
  if(closed)return;closed=true;overlay._finishTransition?.();document.removeEventListener('keydown',key);
  if(activeClose===close)activeClose=null;
  onClose?.();sheetBackState(Boolean(activeClose));
  overlay.classList.add('closing');
  const done=()=>{overlay.remove();if(!document.querySelector('#sheet:not(.closing)')){document.getElementById('app').inert=false;document.body.classList.remove('sheet-open');overlay._focus?.focus?.({preventScroll:true});}};
  reducedMotion()?done():setTimeout(done,200);
 };
 activeClose=close;
 const key=e=>{if(e.key==='Escape'){e.preventDefault();close();}};
 overlay.querySelector('#sheet-close').onclick=close;overlay.onclick=e=>{if(e.target===overlay)close();};
 document.removeEventListener('keydown',overlay._key||(()=>{}));overlay._key=key;document.addEventListener('keydown',key);
 const grip=overlay.querySelector('.sheet-grip');let startY=0,lastY=0,lastT=0,velocity=0,dragging=false;
 grip.onpointerdown=e=>{if(e.target.closest('button'))return;overlay._finishTransition?.();dragging=true;startY=lastY=e.clientY;lastT=e.timeStamp;velocity=0;panel.style.transition='none';try{grip.setPointerCapture(e.pointerId);}catch{}};
 grip.onpointermove=e=>{if(!dragging)return;const dy=Math.max(0,e.clientY-startY);velocity=(e.clientY-lastY)/Math.max(1,e.timeStamp-lastT);lastY=e.clientY;lastT=e.timeStamp;panel.style.transform=`translateY(${dy}px)`;};
 const end=e=>{if(!dragging)return;dragging=false;const dy=Math.max(0,e.clientY-startY);panel.style.transition='';
  if(dy>panel.offsetHeight/4||velocity>0.6){panel.style.transform=`translateY(${panel.offsetHeight}px)`;close();}else panel.style.transform='';};
 grip.onpointerup=end;grip.onpointercancel=end;
 bind?.(overlay,close);
 if(previous){
  const newHeight=panel.getBoundingClientRect().height;
  panel.append(previous);previous.scrollTop=previousScroll;
  const timing={duration:240,easing:'cubic-bezier(.2,0,0,1)'},direction=back?-1:1;
  const animations=[
   panel.animate([{height:oldHeight+'px'},{height:newHeight+'px'}],timing),
   content.animate([{opacity:0,transform:`translateX(${16*direction}px)`},{opacity:1,transform:'translateX(0)'}],timing),
   previous.animate([{opacity:1,transform:'translateX(0)'},{opacity:0,transform:`translateX(${-16*direction}px)`}],timing),
  ];
  overlay._finishTransition=()=>{animations.forEach(a=>a.cancel());previous.remove();overlay._finishTransition=null;};
  Promise.all(animations.map(a=>a.finished)).then(()=>overlay._finishTransition?.()).catch(()=>{});
 }
 if(!reuse||changed)overlay.querySelector('#sheet-close').focus({preventScroll:true});
 else if(focusSelector){const focus=content.querySelector(focusSelector);if(focus&&focusedValue!==undefined)focus.value=focusedValue;focus?.focus({preventScroll:true});if(selection)focus?.setSelectionRange?.(...selection);}
}

export function pickerSheet(title,options,value,onPick,note=''){
 sheet(title,`${note?`<p class="muted" style="margin:0 4px">${esc(note)}</p>`:''}<div class="group flush" role="radiogroup">${options.map(o=>{const on=String(o.value)===String(value);return `<button class="nav-row option-row${on?' on':''}" role="radio" aria-checked="${on}" data-pick="${esc(o.value)}"><span class="row-copy"><span>${esc(o.label)}</span>${o.description?`<small>${esc(o.description)}</small>`:''}</span><span class="radio"></span></button>`;}).join('')}</div>`,
  (root,close)=>root.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>{root.querySelectorAll('[data-pick]').forEach(x=>{const on=x===b;x.classList.toggle('on',on);x.setAttribute('aria-checked',String(on));});setTimeout(()=>{close();onPick(b.dataset.pick);},140);}));
}

let toastTimer=0;
export function toast(text,tone='ok'){
 let el=document.getElementById('toast');
 if(!text){el?.classList.remove('show');return;}
 if(!el){el=document.createElement('div');el.id='toast';el.className='toast';el.setAttribute('role','status');document.body.append(el);}
 el.className=`toast ${tone}`;el.innerHTML=`${icon(tone==='err'?'alert':tone==='info'?'info':'check')}<span>${esc(text)}</span>`;
 requestAnimationFrame(()=>el.classList.add('show'));
 clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),tone==='err'?4200:1800);
}

export function friendlyTime(ms,timeZone='Asia/Shanghai',now=Date.now()){
 if(!ms)return '';
 const fmt=(v,o)=>new Intl.DateTimeFormat('zh-CN',{timeZone,...o}).format(new Date(v));
 const day=v=>fmt(v,{year:'numeric',month:'2-digit',day:'2-digit'});
 const time=fmt(ms,{hour:'2-digit',minute:'2-digit',hour12:false});
 if(day(ms)===day(now))return `今天 ${time}`;
 if(day(ms)===day(now-86400000))return `昨天 ${time}`;
 if(day(ms)===day(now+86400000))return `明天 ${time}`;
 const sameYear=fmt(ms,{year:'numeric'})===fmt(now,{year:'numeric'});
 return `${fmt(ms,sameYear?{month:'numeric',day:'numeric'}:{year:'numeric',month:'numeric',day:'numeric'})} ${time}`;
}

applyTheme(sdk?.state);sdk?.subscribe(applyTheme);

export function openLightbox(images, index = 0) {
  document.getElementById('lightbox')?._close?.();
  if (!images || !images.length) return;
  let i = Math.max(0, Math.min(index, images.length - 1));
  let scale = 1, tx = 0, ty = 0, lastTap = 0, tapX = 0, tapY = 0;
  const pointers = new Map();
  let pinchDist = 0, pinchScale = 1, pinchMid = null, panStart = null;

  const box = document.createElement('div');
  box.id = 'lightbox'; box.className = 'lightbox';
  box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
  const img = document.createElement('img');
  img.alt = images[i].name || '图片'; img.draggable = false;
  const hint = document.createElement('div'); hint.className = 'lb-hint';
  hint.textContent = images.length > 1 ? '双指缩放 · 双击放大 · 左右滑动切换' : '双指缩放 · 双击放大 · 点击空白处关闭';
  const count = document.createElement('div'); count.className = 'lb-count';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'icon-btn lb-close'; closeBtn.setAttribute('aria-label', '关闭'); closeBtn.innerHTML = icon('close');
  const bar = document.createElement('div'); bar.className = 'lb-bar';
  bar.innerHTML = `<button class="lb-tool" data-lb="out" aria-label="缩小">${icon('zoomOut')}</button><span class="lb-zoom">100%</span><button class="lb-tool" data-lb="in" aria-label="放大">${icon('zoomIn')}</button><span class="lb-sep"></span><button class="lb-tool lb-save" data-lb="save" aria-label="保存到相册">${icon('download')}<span>保存</span></button>`;
  const zoomLabel = bar.querySelector('.lb-zoom');
  const apply = (settle) => {
    img.classList.toggle('settle', !!settle);
    img.style.setProperty('--lbx', `${tx}px`);
    img.style.setProperty('--lby', `${ty}px`);
    img.style.setProperty('--lbs', scale);
    zoomLabel.textContent = `${Math.round(scale * 100)}%`;
    bar.querySelector('[data-lb=out]').disabled = scale <= 1;
    bar.querySelector('[data-lb=in]').disabled = scale >= 5;
  };
  const zoomBy = (f) => { scale = Math.min(5, Math.max(1, scale * f)); if (scale === 1) { tx = 0; ty = 0; } else { tx *= f; ty *= f; } apply(true); };
  bar.querySelector('[data-lb=out]').onclick = (e) => { e.stopPropagation(); zoomBy(1 / 1.5); };
  bar.querySelector('[data-lb=in]').onclick = (e) => { e.stopPropagation(); zoomBy(1.5); };
  bar.querySelector('[data-lb=save]').onclick = async (e) => {
    e.stopPropagation();
    const b = e.currentTarget; if (b.disabled) return; b.disabled = true; b.classList.add('busy');
    try {
      const saved = await sdk.request('media.saveImage', { url: images[i].url });
      toast(saved === false ? '已打开系统分享，选择保存位置' : '已保存到相册「课简」', saved === false ? 'info' : 'ok');
    } catch (err) { toast(err.message || '保存失败，请重试', 'err'); }
    finally { b.disabled = false; b.classList.remove('busy'); }
  };
  const clampView = () => { if (scale <= 1.02) { scale = 1; tx = 0; ty = 0; } };
  const setImage = () => { scale = 1; tx = 0; ty = 0; apply(true); img.src = images[i].url || ''; img.alt = images[i].name || '图片'; count.textContent = `${i + 1} / ${images.length}`; };
  let closed = false, releaseBack = () => {};
  const previousFocus = document.activeElement;
  const close = () => { if (closed) return; closed = true; document.removeEventListener('keydown', onKey, true); window.removeEventListener('cursimple-visibility', visibility); releaseBack(); img.removeAttribute('src'); box.remove(); previousFocus?.focus?.({ preventScroll: true }); };
  const visibility = e => { if (e.detail?.visible === false) close(); };
  box._close = close;
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); } };

  closeBtn.onclick = close;
  box.append(img, closeBtn, hint, bar);
  if (images.length > 1) {
    const mk = (cls, ic, label, go) => { const b = document.createElement('button'); b.className = `icon-btn lb-nav ${cls}`; b.setAttribute('aria-label', label); b.innerHTML = icon(ic); b.onclick = (e) => { e.stopPropagation(); go(); setImage(); }; return b; };
    box.append(mk('lb-prev', 'prev', '上一张', () => { i = (i - 1 + images.length) % images.length; }),
                mk('lb-next', 'next', '下一张', () => { i = (i + 1) % images.length; }), count);
  }
  img.onerror = () => { hint.textContent = '图片加载失败'; hint.classList.remove('off'); };

  img.addEventListener('pointerdown', (e) => {
    try { img.setPointerCapture(e.pointerId); } catch {   }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y); pinchScale = scale;
      pinchMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, tx, ty };
    } else if (pointers.size === 1) {
      panStart = { x: e.clientX, y: e.clientY, tx, ty };
    }
  });
  img.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && pinchDist) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      scale = Math.min(5, Math.max(1, pinchScale * d / pinchDist));
      tx = pinchMid.tx + ((a.x + b.x) / 2 - pinchMid.x);
      ty = pinchMid.ty + ((a.y + b.y) / 2 - pinchMid.y);
      apply(false);
    } else if (pointers.size === 1 && panStart && scale > 1) {
      tx = panStart.tx + e.clientX - panStart.x;
      ty = panStart.ty + e.clientY - panStart.y;
      apply(false);
    }
  });
  const lift = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchDist = 0;
    if (pointers.size === 0) {
      const swipe = panStart && scale === 1 && images.length > 1 ? e.clientX - panStart.x : 0;
      if (Math.abs(swipe) > 60 && Math.abs(swipe) > Math.abs(e.clientY - panStart.y)) {
        i = (i + (swipe < 0 ? 1 : -1) + images.length) % images.length; panStart = null; setImage(); return;
      }
      clampView(); apply(true); panStart = null;
      const now = Date.now();
      if (scale > 1 && now - lastTap < 300 && Math.hypot(e.clientX - tapX, e.clientY - tapY) < 24) {
        scale = 1; tx = 0; ty = 0; apply(true); lastTap = 0; return;
      }
      if (scale === 1 && now - lastTap < 300 && Math.hypot(e.clientX - tapX, e.clientY - tapY) < 24) {
        scale = 2.6;
        const r = img.getBoundingClientRect();
        tx = Math.min(Math.max((r.left + r.width / 2 - e.clientX) * 1.6, -r.width), r.width);
        ty = Math.min(Math.max((r.top + r.height / 2 - e.clientY) * 1.6, -r.height), r.height);
        apply(true);
      }
      lastTap = now; tapX = e.clientX; tapY = e.clientY;
    }
  };
  img.addEventListener('pointerup', lift);
  img.addEventListener('pointercancel', lift);
  box.addEventListener('click', (e) => { if (e.target === box) close(); });
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('cursimple-visibility', visibility);
  document.body.append(box);
  releaseBack = pushBackHandler(close); closeBtn.focus();
  setImage();
  setTimeout(() => hint.classList.add('off'), 2600);
}
