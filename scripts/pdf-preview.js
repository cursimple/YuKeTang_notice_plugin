import * as pdfjs from '/__preview/pdfjs/build/pdf.mjs';
pdfjs.GlobalWorkerOptions.workerSrc = '/__preview/pdfjs/build/pdf.worker.mjs';

/** Local browser host for the same media.open command used by the APK. */
export async function openPdfPreview(url, name = 'PDF 预览') {
  document.querySelector('.pdf-preview')?.close();
  const dialog = document.createElement('dialog');
  dialog.className = 'pdf-preview';
  dialog.setAttribute('aria-label', 'PDF 预览');
  dialog.addEventListener('keydown', event => { if (event.key === 'Escape') event.stopPropagation(); });
  dialog.innerHTML = `<header><div class="pdf-heading"><strong class="pdf-name"></strong><small>双指缩放和移动 · 双击还原或放大</small></div><a class="pdf-download" download>下载</a><button class="pdf-control" data-close aria-label="关闭 PDF 预览">×</button></header>
    <div class="pdf-paper"><p class="pdf-message" role="status">正在读取 PDF…</p><div class="pdf-layer" hidden><canvas aria-label="PDF 页面"></canvas></div></div>
    <footer><button class="pdf-control" data-prev aria-label="上一页">‹</button><span class="pdf-page" role="status" aria-live="polite">…</span><button class="pdf-control" data-next aria-label="下一页">›</button><span class="pdf-spacer"></span><button class="pdf-control" data-out aria-label="缩小 PDF">−</button><button class="pdf-zoom" data-reset aria-label="还原 PDF 大小">100%</button><button class="pdf-control" data-in aria-label="放大 PDF">+</button></footer>`;
  dialog.querySelector('.pdf-name').textContent = name;
  const link = dialog.querySelector('.pdf-download'); link.href = url; link.download = name;
  const canvas = dialog.querySelector('canvas'), paper = dialog.querySelector('.pdf-paper'), message = dialog.querySelector('.pdf-message'), layer = dialog.querySelector('.pdf-layer');
  let pageNumber = 1, zoom = 1, pan = {x:0,y:0}, fitted = {width:0,height:0}, pdf, drawing, revision = 0, closed = false, redrawTimer, lastTap;
  const pointers = new Map();
  const loading = pdfjs.getDocument({url, cMapUrl:'/__preview/pdfjs/cmaps/', cMapPacked:true, standardFontDataUrl:'/__preview/pdfjs/standard_fonts/', wasmUrl:'/__preview/pdfjs/wasm/'});
  const resize = new ResizeObserver(() => { if (pdf) draw(); });
  dialog.addEventListener('close', () => { closed = true; revision++; clearTimeout(redrawTimer); resize.disconnect(); pointers.clear(); drawing?.cancel(); loading.destroy(); dialog.remove(); }, {once:true});
  dialog.querySelector('[data-close]').onclick = () => dialog.close();
  const controls = () => {
    dialog.querySelector('[data-prev]').disabled = !pdf || pageNumber <= 1;
    dialog.querySelector('[data-next]').disabled = !pdf || pageNumber >= pdf.numPages;
    dialog.querySelector('[data-out]').disabled = !pdf || zoom <= 1;
    dialog.querySelector('[data-in]').disabled = !pdf || zoom >= 4;
    dialog.querySelector('[data-reset]').disabled = !pdf || zoom === 1;
    dialog.querySelector('.pdf-page').textContent = pdf ? `${pageNumber} / ${pdf.numPages}` : '…';
    dialog.querySelector('.pdf-zoom').textContent = `${Math.round(zoom * 100)}%`;
  };
  function position() {
    const x = Math.max(0,(fitted.width * zoom - paper.clientWidth) / 2), y = Math.max(0,(fitted.height * zoom - paper.clientHeight) / 2);
    pan = {x:Math.max(-x,Math.min(x,pan.x)),y:Math.max(-y,Math.min(y,pan.y))};
    canvas.style.transform = `translate(${pan.x}px,${pan.y}px) scale(${zoom})`;
    canvas.dataset.zoom = String(zoom); canvas.dataset.panX = String(pan.x); canvas.dataset.panY = String(pan.y);
    controls();
  }
  function transform(factor,point,delta={x:0,y:0}) {
    if (!pdf || layer.hidden) return;
    const rect = paper.getBoundingClientRect(), focus = {x:point.x-rect.left-paper.clientWidth/2,y:point.y-rect.top-paper.clientHeight/2};
    const next = Math.max(1,Math.min(4,zoom * factor)), ratio = next / zoom;
    pan = {x:focus.x+(pan.x-focus.x)*ratio+delta.x,y:focus.y+(pan.y-focus.y)*ratio+delta.y};
    zoom = next; position();
  }
  const center = () => {const rect=paper.getBoundingClientRect();return {x:rect.left+rect.width/2,y:rect.top+rect.height/2};};
  const scheduleDraw = () => {clearTimeout(redrawTimer);redrawTimer=setTimeout(draw,120);};
  async function draw() {
    const current = ++revision, requestedPage = pageNumber;
    const previous = drawing; previous?.cancel();
    try {
      await previous?.promise.catch(() => {});
      if (closed || current !== revision) return;
      if (canvas.dataset.page !== String(pageNumber)) {layer.hidden=true;message.hidden=false;message.textContent='正在渲染…';}
      controls();
      const page = await pdf.getPage(requestedPage);
      if (closed || current !== revision) return;
      const initial = page.getViewport({scale:1});
      const fit = Math.min(Math.max(1,paper.clientWidth-24)/initial.width,Math.max(1,paper.clientHeight-24)/initial.height);
      fitted = {width:initial.width*fit,height:initial.height*fit};
      layer.style.width = `${fitted.width}px`; layer.style.height = `${fitted.height}px`; position();
      const quality = Math.min((devicePixelRatio||1)*zoom,Math.sqrt(4_000_000/(fitted.width*fitted.height)));
      const viewport = page.getViewport({scale:fit*quality});
      const buffer = document.createElement('canvas'); buffer.width=Math.max(1,Math.floor(viewport.width));buffer.height=Math.max(1,Math.floor(viewport.height));
      drawing = page.render({canvasContext:buffer.getContext('2d'),viewport});
      await drawing.promise;
      if (closed || current !== revision) return;
      canvas.width=buffer.width;canvas.height=buffer.height;canvas.getContext('2d').drawImage(buffer,0,0);
      drawing=null;layer.hidden=false;canvas.dataset.page=String(requestedPage);message.hidden=true;position();
    } catch (error) {
      if (closed || current !== revision || error.name === 'RenderingCancelledException') return;
      message.textContent='PDF 无法预览，请检查文件或下载后打开。';message.hidden=false;
    }
  }
  const flip = delta => {clearTimeout(redrawTimer);pageNumber=Math.max(1,Math.min(pdf.numPages,pageNumber+delta));zoom=1;pan={x:0,y:0};pointers.clear();draw();};
  dialog.querySelector('[data-prev]').onclick=()=>flip(-1);
  dialog.querySelector('[data-next]').onclick=()=>flip(1);
  dialog.querySelector('[data-out]').onclick=()=>{transform(Math.max(1,zoom-.5)/zoom,center());scheduleDraw();};
  dialog.querySelector('[data-in]').onclick=()=>{transform(Math.min(4,zoom+.5)/zoom,center());scheduleDraw();};
  dialog.querySelector('[data-reset]').onclick=()=>{zoom=1;pan={x:0,y:0};position();scheduleDraw();};
  const midpoint = values => ({x:(values[0].x+values[1].x)/2,y:(values[0].y+values[1].y)/2});
  const distance = values => Math.hypot(values[0].x-values[1].x,values[0].y-values[1].y);
  paper.onpointerdown=event=>{
    if(layer.hidden || event.button>0 || pointers.size>=2)return;
    event.preventDefault();paper.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,started:Date.now(),moved:false});
    if(pointers.size===2){lastTap=null;pointers.forEach(p=>p.moved=true);}
  };
  paper.onpointermove=event=>{
    const point=pointers.get(event.pointerId);if(!point)return;
    const before=[...pointers.values()].map(p=>({...p}));
    const delta={x:event.clientX-point.x,y:event.clientY-point.y};point.x=event.clientX;point.y=event.clientY;
    if(Math.hypot(point.x-point.startX,point.y-point.startY)>8)point.moved=true;
    const after=[...pointers.values()];
    if(after.length===2){const start=midpoint(before),end=midpoint(after);transform(distance(after)/Math.max(1,distance(before)),start,{x:end.x-start.x,y:end.y-start.y});}
    else transform(1,{x:point.x,y:point.y},delta);
  };
  const release=event=>{
    const point=pointers.get(event.pointerId);if(!point)return;
    pointers.delete(event.pointerId);
    if(event.type==='pointerup' && !point.moved && Date.now()-point.started<300){
      if(lastTap && Date.now()-lastTap.time<300 && Math.hypot(point.x-lastTap.x,point.y-lastTap.y)<30){
        if(zoom>1){zoom=1;pan={x:0,y:0};position();}else transform(2,point);lastTap=null;
      }else lastTap={x:point.x,y:point.y,time:Date.now()};
    }
    if(!pointers.size)scheduleDraw();
  };
  paper.onpointerup=release;paper.onpointercancel=release;paper.onlostpointercapture=release;
  paper.addEventListener('wheel',event=>{
    if(!pdf||layer.hidden)return;
    if(event.ctrlKey){event.preventDefault();transform(Math.exp(-event.deltaY*.01),{x:event.clientX,y:event.clientY});scheduleDraw();}
    else if(zoom>1){event.preventDefault();transform(1,center(),{x:-event.deltaX,y:-event.deltaY});}
  },{passive:false});
  document.body.append(dialog);dialog.showModal();controls();
  try {pdf=await loading.promise;if(!closed){await draw();resize.observe(paper);}}
  catch {if(!closed)message.textContent='PDF 无法预览，请检查文件或下载后打开。';}
}
