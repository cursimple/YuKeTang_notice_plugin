export const sdk = window.CurSimpleComponent;
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths = {
 back:'m14 6-6 6 6 6', next:'m9 6 6 6-6 6', close:'m6 6 12 12M6 18 18 6',
 calendar:'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z',
 list:'M9 6h12M9 12h12M9 18h12M3 6h1M3 12h1M3 18h1',
 settings:'M4 7h16M4 17h16M8 4v6m8 4v6', bell:'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
 sync:'M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 14 6M4 12a8 8 0 0 0 14 6',
 user:'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 8 0 0 1 16 0v2',
 check:'m5 12 4 4L19 6', lock:'M6 10h12v11H6ZM8 10V6a4 4 0 0 1 8 0v4',
 link:'m9 15 6-6M7 16l-1 1a4 4 0 0 1-5-5l5-5a4 4 0 0 1 6 0m0 10a4 4 0 0 0 6 0l5-5a4 4 0 0 0-5-5l-1 1',
 book:'M4 3h13a3 3 0 0 1 3 3v15H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3m-3 15a3 3 0 0 1 3-3h14',
 refresh:'M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5',
 alert:'M12 3 2.5 20h19L12 3Zm0 7v4.5m0 3h.01',
 file:'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 0v6h6',
 download:'M12 3v11m0 0 4-4m-4 4-4-4M4 18v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1',
 copy:'M9 9h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z' +
   '|M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
 info:'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 7h.01m0 3v4',
 edit:'M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Zm9.5-13.5 4 4',
 clock:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v5l3 2',
 megaphone:'M3 10v4a1 1 0 0 0 1 1h2l5 4V5L6 9H4a1 1 0 0 0-1 1Zm12-2a5 5 0 0 1 0 8m3-11a9 9 0 0 1 0 14',
 globe:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z',
 phone:'M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm3 16h2',
 shield:'M12 3 5 6v5c0 4.5 3 8.4 7 10 4-1.6 7-5.5 7-10V6l-7-3Zm-3 9 2 2 4-4',
 scan:'M4 8V5a1 1 0 0 1 1-1h3m8 0h3a1 1 0 0 1 1 1v3m0 8v3a1 1 0 0 1-1 1h-3m-8 0H5a1 1 0 0 1-1-1v-3M8 12h8',
 inbox:'M3 13h5l2 3h4l2-3h5M5 5h14l2 8v6H3v-6l2-8Z',
 trash:'M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3',
 logout:'M15 4h4v16h-4M10 8l-4 4 4 4m-4-4h11',
 swap:'M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4m4 4H7',
 zoomIn:'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm9 16-4-4M11 8v6M8 11h6',
 zoomOut:'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm9 16-4-4M8 11h6',
 eye:'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
 folder:'M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z',
};
export const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${(paths[name] || paths.book).split('|').map(d=>`<path d="${d}"/>`).join('')}</svg>`;
export const iconButton = (id,name,label) => `<button class="icon" id="${id}" aria-label="${label}">${icon(name)}</button>`;
export function applyTheme(state) {
 const scale=Number(state?.context?.fontScale);
 if(Number.isFinite(scale)&&scale>0)document.documentElement.style.setProperty("--font-scale",String(scale));
 const t=state?.context?.theme;if(!t)return;
 const map={background:'bg',surface:'card',surfaceVariant:'group',surfaceContainerLow:'surface-low',onSurface:'text',onSurfaceVariant:'muted',outlineVariant:'line',primary:'accent',onPrimary:'on-accent',primaryContainer:'accent-soft',onPrimaryContainer:'on-soft',error:'danger',errorContainer:'danger-soft'};
 for(const [key,value] of Object.entries(map))if(/^#[\da-f]{6,8}$/i.test(t[key]||''))document.documentElement.style.setProperty('--'+value,t[key]);
 if(/^#[\da-f]{6}$/i.test(t.primary||''))document.documentElement.style.setProperty('--accent-line',t.primary+'8c');
 document.documentElement.style.colorScheme=t.dark?'dark':'light';
 // 状态色（待完成红 / 公告橙）不在宿主主题里，按宿主的深浅色切换，不能只看 WebView 的 prefers-color-scheme
 document.documentElement.dataset.theme=t.dark?'dark':'light';
}
/** 自绘下拉：WebView 的原生 <select> 弹层在部分机型上不出现或点不动，组件自己画一层。 */
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

/** 状态横幅：tone ∈ ok/err/info，文本转义后输出 */
export const bannerHtml = (text, tone='info') =>
  `<div class="banner ${{ok:1,err:1,info:1}[tone]?tone:'info'}">${esc(text)}</div>`;

/** 分段切换：首位挂滑块 thumb，bindSegmented 负责量位 */
export const segmented = (id, items, value) => `<div class="segs" role="tablist" id="${id}"><span class="seg-thumb" aria-hidden="true"></span>${items.map(i=>
  `<button type="button" data-seg="${esc(i.id)}" role="tab" aria-selected="${i.id===value}" class="${i.id===value?'on':''}">${i.icon?icon(i.icon):''}${esc(i.label)}</button>`).join('')}</div>`;

const segLast = new Map();

export function bindSegmented(root, id, onPick) {
  const segs = root.querySelector(`#${id}`);
  if (!segs) return;
  const thumb = segs.querySelector('.seg-thumb');
  if (!thumb) return;
  thumb.style.visibility = 'hidden';
  const prev = segLast.get(id); // 上一次渲染时拇指的位置（FLIP 起点）
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
      // 首次渲染：静默定位，避免每次重绘都从左端滑过来
      const c = cur();
      if (c) { thumb.style.width = `${c.offsetWidth}px`; thumb.style.transform = `translateX(${c.offsetLeft}px)`; thumb.style.visibility = 'visible'; }
    }
    void thumb.offsetWidth;
    thumb.style.transition = '';
    if (prev) place();
    else { const c = cur(); if (c) segLast.set(id, { w: thumb.style.width, x: thumb.style.transform }); }
  });
}

/** 把 bind 收集器合并执行，页面重绘后一次绑完 */
export function bindAll(root, parts) { parts.forEach(p => p?.bind?.(root)); }

export function message(text, error=false) {const el=document.getElementById('feedback');if(el){el.textContent=text;el.hidden=!text;el.className=error?'feedback error':'feedback';}}
let activeClose;
/**
 * 底部弹层。已有弹层打开时原地换内容（不重放入场动画、保留滚动位置），
 * 设置面板里每改一项都会重绘，之前每次都整层关掉再弹起来，一闪一闪的。
 */
export function sheet(title, body, bind) {
 let overlay=document.getElementById('sheet');
 const reuse=overlay&&!overlay.classList.contains('closing');
 const keep=reuse&&overlay.dataset.title===title?overlay.querySelector('.sheet-body')?.scrollTop:0;
 if(!reuse){activeClose?.();overlay?.remove();overlay=document.createElement('div');overlay.id='sheet';overlay.className='scrim';}
 overlay.dataset.title=title;
 overlay.innerHTML=`<section class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="sheet-grip"><div class="sheet-handle"></div><header><h2>${esc(title)}</h2>${iconButton('sheet-close','close','关闭')}</header></div><div class="sheet-body">${body}</div></section>`;
 if(reuse){overlay.querySelector('.sheet').style.animation='none';overlay.style.animation='none';}
 const panel=overlay.querySelector('.sheet'),content=overlay.querySelector('.sheet-body');
 if(keep)content.scrollTop=keep;
 const focus=reuse?null:document.activeElement;
 let closed=false;
 const close=()=>{
  if(closed)return;closed=true;document.removeEventListener('keydown',key);
  if(activeClose===close)activeClose=null;
  overlay.classList.add('closing');
  const done=()=>{overlay.remove();focus?.focus?.();};
  matchMedia('(prefers-reduced-motion: reduce)').matches?done():setTimeout(done,200);
 };
 activeClose=close;
 const key=e=>{if(e.key==='Escape'){e.preventDefault();close();}};
 if(!reuse)document.body.append(overlay);
 overlay.querySelector('#sheet-close').onclick=close;overlay.onclick=e=>{if(e.target===overlay)close();};
 document.removeEventListener('keydown',overlay._key||(()=>{}));overlay._key=key;document.addEventListener('keydown',key);
 // 顶部把手区可以下拉关闭：跟手位移，过 1/4 高度或快速下甩就收起
 const grip=overlay.querySelector('.sheet-grip');let startY=0,lastY=0,lastT=0,velocity=0,dragging=false;
 grip.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;dragging=true;startY=lastY=e.clientY;lastT=e.timeStamp;velocity=0;panel.style.transition='none';try{grip.setPointerCapture(e.pointerId);}catch{}});
 grip.addEventListener('pointermove',e=>{if(!dragging)return;const dy=Math.max(0,e.clientY-startY);velocity=(e.clientY-lastY)/Math.max(1,e.timeStamp-lastT);lastY=e.clientY;lastT=e.timeStamp;panel.style.transform=`translateY(${dy}px)`;});
 const end=e=>{if(!dragging)return;dragging=false;const dy=Math.max(0,e.clientY-startY);panel.style.transition='';
  if(dy>panel.offsetHeight/4||velocity>0.6){panel.style.transform=`translateY(${panel.offsetHeight}px)`;close();}else panel.style.transform='';};
 grip.addEventListener('pointerup',end);grip.addEventListener('pointercancel',end);
 if(!reuse)overlay.querySelector('#sheet-close').focus({preventScroll:true});
 bind?.(overlay,close);
}

/** 单选弹层：从底部弹出选项列表，选中即关；比页面里展开下拉更稳，也不会把页面撑高 */
export function pickerSheet(title,options,value,onPick,note=''){
 sheet(title,`${note?`<p class="muted" style="margin:0 4px">${esc(note)}</p>`:''}<div class="group flush" role="radiogroup">${options.map(o=>{const on=String(o.value)===String(value);return `<button class="nav-row option-row${on?' on':''}" role="radio" aria-checked="${on}" data-pick="${esc(o.value)}"><span class="row-copy"><span>${esc(o.label)}</span>${o.description?`<small>${esc(o.description)}</small>`:''}</span><span class="radio"></span></button>`;}).join('')}</div>`,
  (root,close)=>root.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>{root.querySelectorAll('[data-pick]').forEach(x=>{const on=x===b;x.classList.toggle('on',on);x.setAttribute('aria-checked',String(on));});setTimeout(()=>{close();onPick(b.dataset.pick);},140);}));
}

/** 轻提示：底部浮一条，不挤动页面布局；tone ∈ ok/err/info */
let toastTimer=0;
export function toast(text,tone='ok'){
 let el=document.getElementById('toast');
 if(!text){el?.classList.remove('show');return;}
 if(!el){el=document.createElement('div');el.id='toast';el.className='toast';el.setAttribute('role','status');document.body.append(el);}
 el.className=`toast ${tone}`;el.innerHTML=`${icon(tone==='err'?'alert':tone==='info'?'info':'check')}<span>${esc(text)}</span>`;
 requestAnimationFrame(()=>el.classList.add('show'));
 clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),tone==='err'?4200:1800);
}

/** 「今天 09:00」「昨天 21:30」「10月1日 08:00」这种口语化时间 */
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

/** 图片放大查看：双指缩放、双击放大、放大多指拖拽平移、点空白或关闭按钮退出 */
export function openLightbox(images, index = 0) {
  document.getElementById('lightbox')?.remove();
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
  // 底部工具条：缩小 / 比例 / 放大 / 保存到相册
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
  const close = () => { document.removeEventListener('keydown', onKey); box.remove(); };
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };

  closeBtn.onclick = close;
  box.append(img, closeBtn, hint, bar);
  if (images.length > 1) {
    const mk = (cls, ic, label, go) => { const b = document.createElement('button'); b.className = `icon-btn lb-nav ${cls}`; b.setAttribute('aria-label', label); b.innerHTML = icon(ic); b.onclick = (e) => { e.stopPropagation(); go(); setImage(); }; return b; };
    box.append(mk('lb-prev', 'back', '上一张', () => { i = (i - 1 + images.length) % images.length; }),
                mk('lb-next', 'next', '下一张', () => { i = (i + 1) % images.length; }), count);
  }
  img.onerror = () => { hint.textContent = '图片加载失败'; hint.classList.remove('off'); };

  img.addEventListener('pointerdown', (e) => {
    try { img.setPointerCapture(e.pointerId); } catch { /* 合成事件等情况没有活动指针，跳过捕获即可 */ }
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
      // 原始大小时左右滑动切换图片
      const swipe = panStart && scale === 1 && images.length > 1 ? e.clientX - panStart.x : 0;
      if (Math.abs(swipe) > 60 && Math.abs(swipe) > Math.abs(e.clientY - panStart.y)) {
        i = (i + (swipe < 0 ? 1 : -1) + images.length) % images.length; panStart = null; setImage(); return;
      }
      clampView(); apply(true); panStart = null;
      // 双击切换缩放
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
  document.addEventListener('keydown', onKey);
  document.body.append(box);
  setImage();
  setTimeout(() => hint.classList.add('off'), 2600);
}
