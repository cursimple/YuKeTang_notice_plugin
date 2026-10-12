export function versionTapGate({activationTaps=5,resetAfterMillis=3000}={}) {
  let count=0,last=null;
  return {
    tap(now=Date.now()) {
      if(last===null || now<last || now-last>resetAfterMillis)count=0;
      last=now;
      if(++count<activationTaps)return false;
      count=0;last=null;return true;
    },
    reset(){count=0;last=null;},
  };
}

export function createTools({sdk,snapshot,icon,esc,toast,features,mark,subtitle,aboutFeatures=[]}) {
  const app=document.getElementById('app'),session=String(Date.now())+Math.random();
  const storageKey=`cursimple.tools.${snapshot().manifest.id}`;
  let enabled=snapshot().context?.diagnostics?.enabled ?? readLocal(),saving=false;
  let root=null,route=null,focus=null,position=0,cleanup=null;
  const gate=versionTapGate(snapshot().context?.diagnostics);
  const memories=new Map();
  function readLocal(){try{return localStorage.getItem(storageKey)==='true';}catch{return false;}}
  function setLocal(value){try{localStorage.setItem(storageKey,String(value));}catch{}}
  const circle=(id,name,label)=>`<button class="icon tool-circle" id="${id}" aria-label="${esc(label)}">${icon(name)}</button>`;
  const row=(id,title,description,name='next',danger=false)=>`<button class="tool-row${danger?' tool-danger':''}" data-tool="${id}"><span class="tool-tile">${icon(name)}</span><span class="tool-copy"><strong>${esc(title)}</strong><small>${esc(description)}</small></span>${icon('next')}</button>`;
  const card=body=>`<section class="tool-card">${body}</section>`;
  const pairs=items=>`<dl class="tool-pairs">${items.map(([key,value])=>`<div><dt>${esc(key)}</dt><dd>${esc(value??'—')}</dd></div>`).join('')}</dl>`;
  function reportBack(value){if(snapshot().context?.diagnostics)sdk.request('ui.navigation',{canGoBack:value}).catch(()=>{});}
  async function setEnabled(value) {
    if(saving)return false;saving=true;
    try {
      if(snapshot().context?.diagnostics)await sdk.request('debug.advancedTools',{enabled:value});
      enabled=value;setLocal(value);gate.reset();return true;
    } catch(e){toast(e.message||'设置未保存');return false;}
    finally{saving=false;}
  }
  function navigate(next,replace=false) {
    const depth=history.state?.componentTools?.session===session?history.state.componentTools.depth:0;
    const state={...history.state,componentTools:{session,route:next,depth:replace?depth:depth+1}};
    history[replace?'replaceState':'pushState'](state,'');
    show(next);
  }
  function leave(){
    cleanup?.();cleanup=null;root?.remove();root=null;route=null;
    app.hidden=false;app.inert=false;app.removeAttribute('aria-hidden');document.body.classList.remove('tools-open');
    reportBack(false);window.scrollTo(0,position);
    if(focus?.isConnected)focus.focus({preventScroll:true});else document.getElementById('about')?.focus({preventScroll:true});
  }
  function back(){if(root)history.back();}
  window.addEventListener('popstate',event=>{
    const value=event.state?.componentTools;
    if(value?.session===session)show(value.route);else if(root)leave();
  });
  window.addEventListener('cursimple-back',back);
  document.addEventListener('keydown',event=>{
    if(root && event.key==='Escape' && !document.querySelector('#sheet')){event.preventDefault();back();}
  });
  function about() {
    const m=snapshot().manifest;
    const section=(name,heading,body)=>`<section class="about-card"><h2>${icon(name)}${esc(heading)}</h2>${body}</section>`;
    const link=(id,title,detail,name)=>`<button class="about-link" data-tool="${id}">${icon(name)}<span class="tool-copy"><strong>${esc(title)}</strong><small>${esc(detail)}</small></span>${icon('next')}</button>`;
    return `<section class="about-hero"><div class="about-identity"><span class="about-mark">${icon(mark)}</span><div class="about-name"><h2>${esc(m.name)}</h2><small>课简 · 扩展组件</small></div></div><p>${esc(subtitle)}</p><div class="about-versions"><button id="about-version" class="about-chip about-version" aria-label="版本 v${esc(m.version)}"><span class="about-chip-label about-version-value">v${esc(m.version)}</span></button><span class="about-chip about-badge"><span class="about-chip-label">开源组件</span></span>${enabled?'<span class="about-chip about-badge"><span class="about-chip-label">诊断已开启</span></span>':''}</div></section>`+
      (aboutFeatures.length?section('book','组件功能',aboutFeatures.map(x=>`<div class="about-feature">${icon(x.icon)}<div class="about-feature-copy"><strong>${esc(x.title)}</strong><small>${esc(x.description)}</small></div></div>`).join('')):'')+
      (m.homepage?section('link','开源与支持',link('repo','源码仓库',m.homepage.replace(/^https?:\/\//,''),'external')):'')+
      section('info','组件信息',`<dl class="about-info"><div><dt>发布者</dt><dd>${esc(m.publisher||'—')}</dd></div><div><dt>版本</dt><dd>v${esc(m.version)}</dd></div><div><dt>版本代码</dt><dd>${esc(m.versionCode)}</dd></div></dl>`)+
      (enabled?section('bug','诊断工具',link('home','打开诊断工具','按功能检查当前组件的运行情况','bug')):'');
  }
  function show(next) {
    cleanup?.();cleanup=null;
    if(!enabled && next!=='about')next='about';
    if(!root){
      focus=document.activeElement;position=window.scrollY;
      root=document.createElement('section');root.id='component-tools';root.className='tool-screen';root.setAttribute('aria-label','组件页面');
      document.body.append(root);app.hidden=true;app.inert=true;app.setAttribute('aria-hidden','true');document.body.classList.add('tools-open');reportBack(true);
    }
    route=next;root.dataset.route=next;gate.reset();
    const feature=features.find(x=>x.id===next),title={about:'关于组件',home:'诊断工具',logs:'运行日志',disable:'关闭诊断工具'}[next]||feature?.title||'诊断工具';
    root.innerHTML=`<div class="tool-page"><header class="tool-top">${circle('tool-back','back','返回')}<h1 tabindex="-1">${esc(title)}</h1></header><div id="tool-content"></div></div>`;
    root.querySelector('#tool-back').onclick=back;
    root.scrollTop=0;root.querySelector('h1').focus({preventScroll:true});
    const content=root.querySelector('#tool-content');
    const context={root:content,sdk,snapshot,icon,esc,card,pairs,circle,navigate,toast,memory:memories.get(next)||{}};
    memories.set(next,context.memory);
    if(next==='about'){
      content.innerHTML=about();
      content.querySelector('#about-version').onclick=async()=>{
        if(enabled||saving)return;
        if(gate.tap() && await setEnabled(true)){toast('已开启组件诊断');navigate('home');}
      };
      content.querySelector('[data-tool="repo"]')?.addEventListener('click',()=>sdk.request('ui.openExternal',{url:snapshot().manifest.homepage}).catch(e=>toast(e.message)));
    } else if(next==='home'){
      content.innerHTML=`<p class="tool-intro">${esc(snapshot().manifest.name)} · v${esc(snapshot().manifest.version)}</p><div class="tool-menu">${features.map(x=>row(x.id,x.title,x.description,x.icon)).join('')}${row('logs','运行日志','按级别筛选最近的组件日志','list')}${row('disable','关闭诊断工具','仅关闭当前组件的隐藏入口','lock',true)}</div>`;
    } else if(next==='logs')cleanup=logPage(context);
    else if(next==='disable'){
      content.innerHTML=card('<h2>关闭当前组件的诊断入口？</h2><p class="tool-intro">返回普通关于页面。组件的绑定、同步和通知设置会保留。</p><div class="tool-actions"><button class="secondary" id="keep-tools">取消</button><button class="primary tool-danger-fill" id="disable-tools">关闭诊断工具</button></div>');
      content.querySelector('#keep-tools').onclick=back;
      content.querySelector('#disable-tools').onclick=async event=>{
        event.currentTarget.disabled=true;
        if(await setEnabled(false)){
          memories.clear();toast('已关闭当前组件诊断');
          const depth=history.state?.componentTools?.depth||1;
          if(depth>1)history.go(1-depth);else navigate('about',true);
        } else if(content.isConnected)content.querySelector('#disable-tools').disabled=false;
      };
    } else if(feature)cleanup=feature.render(context);
    content.querySelectorAll('[data-tool]:not([data-tool="repo"])').forEach(b=>b.onclick=()=>navigate(b.dataset.tool));
  }
  return {openAbout(){if(!root)navigate('about');},get active(){return !!root;}};
}

export function bindAction(root,id,run,{working='处理中…',success='已完成',state={}}={}) {
  const button=root.querySelector('#'+id),output=root.querySelector('[data-result]'),label=button.innerHTML;
  state.views??=new Set();
  const update=()=>{
    if(!root.isConnected){state.views.delete(update);return;}
    button.disabled=!!state.busy||button.dataset.unavailable==='true';
    button.setAttribute('aria-busy',String(!!state.busy));
    if(!button.classList.contains('icon'))button.innerHTML=state.busy?working:label;
    if(output && state.message){output.hidden=false;output.className='tool-result'+(state.error?' tool-error':'');output.textContent=state.message;}
  };
  state.views.add(update);update();
  button.onclick=async()=>{
    if(button.disabled||state.busy)return;
    state.busy=true;state.error=false;state.message=working;state.views.forEach(f=>f());
    try{state.message=await run()||success;}
    catch(e){state.error=true;state.message=e.message||'操作未完成，请重试';}
    finally{state.busy=false;state.views.forEach(f=>f());}
  };
}

function logPage({root,sdk,snapshot,esc,icon,card,circle,memory}) {
  memory.rows??=[];memory.level??='all';
  root.innerHTML=`<div class="tool-toolbar"><p class="tool-intro">最近 80 条 · 仅当前组件</p>${circle('logs-refresh','refresh','刷新日志')}</div><div class="tool-filters" role="group" aria-label="日志级别">${[['all','全部'],['error','错误'],['warn','警告']].map(([id,label])=>`<button class="secondary" data-level="${id}" aria-pressed="${memory.level===id}">${label}</button>`).join('')}</div><p data-result class="tool-result" role="status" hidden></p><div id="log-rows"></div><button class="secondary" id="logs-clear">${icon('trash')}清空当前视图</button>`;
  const draw=()=>{
    const rows=memory.rows.filter(x=>memory.level==='all'||(memory.level==='error'?/^(e|error)$/i:/^(w|warn|warning)$/i).test(x.level));
    root.querySelector('#log-rows').innerHTML=rows.length?rows.slice().reverse().map(x=>card(`<div class="tool-log-heading"><strong>${esc(x.event||'日志')}</strong><span>${esc(x.level)}</span></div><small class="tool-intro">${esc(Number.isFinite(Number(x.time))?new Date(Number(x.time)).toLocaleString('zh-CN',{timeZone:snapshot().context?.timeZone||'Asia/Shanghai',hour12:false}):'')} · ${esc(x.source||'组件')}</small><pre class="tool-log">${esc(x.message||'无附加信息')}</pre>`)).join(''):'<p class="tool-empty">暂无符合条件的日志</p>';
  };
  root.querySelectorAll('[data-level]').forEach(b=>b.onclick=()=>{memory.level=b.dataset.level;root.querySelectorAll('[data-level]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));draw();});
  root.querySelector('#logs-clear').onclick=()=>{memory.rows=[];draw();root.querySelector('[data-result]').textContent='已清空当前视图，刷新可重新读取日志';root.querySelector('[data-result]').hidden=false;};
  bindAction(root,'logs-refresh',async()=>{const rows=await sdk.request('debug.logs');if(!Array.isArray(rows))throw new Error('日志返回格式无效，请更新课简');memory.rows=rows;draw();return `已读取 ${rows.length} 条日志`;},{working:'正在读取日志…'});
  draw();root.querySelector('#logs-refresh').click();
}
