import {anchorOf,visibleFeedItems,itemDayKey,filterFeedItems,pendingCount,stateOfItem,statusCounts,hasTaskItems,isPendingItem,isNoticeItem,isIgnoredItem,ignoredFeedItems} from './feed-model.js';
import {sdk,esc,icon,iconButton,sheet,segmented,bindSegmented,bannerHtml,openLightbox,toast,friendlyTime} from './shared.js';
const app=document.getElementById('app');
let snapshot=sdk.state,data=snapshot.data,month=null,selected='',type='',status='',view=data.host?.feed?.defaultView==='list'?'list':'month',syncing=false,error='';
let pageTimer=0,bootTimer=0,paneAnim='',pendingDelta=0;
const bootAt=performance.now();
const WEEK=['日','一','二','三','四','五','六'];
const manifest=()=>snapshot.manifest,tz=()=>snapshot.context?.timeZone||'Asia/Shanghai';
const now=()=>snapshot.context?.nowMillis||Date.now();
const today=()=>itemDayKey(now(),tz());
const types=()=>manifest().extension.feedTypes||[];
const anchor=x=>anchorOf(x,data.host?.feed?.dateSource,manifest());
const dayOf=x=>itemDayKey(anchor(x),tz());
const typeSpec=x=>types().find(t=>t.id===x.type);
const label=x=>x.category||typeSpec(x)?.label||'内容';
const allItems=()=>visibleFeedItems(data,now(),manifest());
const ignoredItems=()=>ignoredFeedItems(data,now(),manifest());
const items=()=>filterFeedItems(allItems(),{type,status},manifest());
const key=(y,m,d)=>`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
const parts=k=>k.split('-').map(Number);
const weekdayOf=k=>{const [y,m,d]=parts(k);return WEEK[new Date(y,m-1,d).getDay()];};
const dateLabel=k=>{const [,m,d]=parts(k);return `${m}月${d}日`;};
const relDay=k=>{const t=today();if(k===t)return '今天';const [y,m,d]=parts(t),base=new Date(y,m-1,d);const [a,b,c]=parts(k);const diff=Math.round((new Date(a,b-1,c)-base)/86400000);return diff===1?'明天':diff===-1?'昨天':'';};
const when=ms=>friendlyTime(ms,tz(),now());
const fileSize=b=>b>=1048576?`${(b/1048576).toFixed(1)} MB`:`${Math.max(1,Math.round(b/1024))} KB`;
const stateOf=x=>stateOfItem(x,manifest());
const overdue=x=>stateOf(x)==='pending'&&x.dueAt&&x.dueAt<now();
/** Unread and read notices have explicit status labels. */
function stateTag(x){const s=stateOf(x);if(overdue(x))return ['pending','已逾期'];return {pending:['pending','待完成'],done:['done','已完成'],notice:['notice','未读'],old:['old','往期'],read:['read','已读']}[s];}
function typeIcon(x){const map={homework:'edit',exam:'clock',announcement:'megaphone',notice:'info'};if(map[x.type])return map[x.type];return typeSpec(x)?.kind==='notice'?'bell':'file';}
const tile=x=>`<span class="type-tile ${stateOf(x)}">${icon(typeIcon(x))}</span>`;
function remain(ms){const d=ms-now(),a=Math.abs(d),h=a/3600000;const t=h<1?`${Math.max(1,Math.round(a/60000))} 分钟`:h<48?`${Math.round(h)} 小时`:`${Math.round(h/24)} 天`;return d>=0?`还剩 ${t}`:`已过 ${t}`;}
function ensureDate(){if(!month){const [y,m]=parts(today());month=new Date(y,m-1,1);selected=today();}}
async function request(command,payload){try{return await sdk.request(command,payload);}catch(e){error=e.message||'操作未完成';render();toast(error,'err');}}

function header(signed){
 const title=esc(manifest().extension.title||'雨课堂');
 let sub;
 if(!signed)sub=`<span>${data.loginState==='expired'?'登录已过期':'未连接账号'}</span>`;
 else{const synced=data.lastSyncAt?`${when(data.lastSyncAt)} 同步`:'尚未同步';sub=`<i class="live${syncing?' busy':''}"></i><span>${esc(data.account?.name||'已连接')} · ${syncing?'正在同步…':synced}</span>`;}
 return `<header class="top feed-header"><div class="title-block"><h1>${title}</h1><div class="subline">${sub}</div></div>${signed?iconButton('sync','sync','同步课堂'):''}${iconButton('settings','settings','组件设置')}${iconButton('info','about','关于组件')}</header>`;
}
function bindHeader(){
 const b=document.getElementById('settings');if(b)b.onclick=()=>request('ui.settings');
 const s=document.getElementById('sync');
 if(s){s.className='icon-btn'+(syncing?' syncing':'');s.disabled=syncing;s.onclick=async()=>{syncing=true;error='';render();const r=await request('sync');syncing=false;render();if(r!==undefined&&!error)toast(r?.count!=null?`同步完成 · ${r.count} 条内容`:'同步完成');};}
 const about=document.getElementById('about');if(about)about.onclick=openAbout;
}

function aboutBody(){
 const m=manifest(),repo=m.homepage||'';
 return `<div class="group about-panel"><div class="row"><span class="type-tile">${icon('info')}</span><span class="row-copy"><strong>${esc(m.name||'组件')}</strong><small>${esc(m.publisher||'')} · ${esc(m.extension?.title||'')}</small></span></div><button class="nav-row" id="about-version"><span class="row-copy"><span>版本</span><small>v${esc(m.version||'-')}</small></span>${icon('next')}</button>${repo?`<button class="nav-row" id="about-repo"><span class="row-copy"><span>开源仓库</span><small>${esc(repo)}</small></span>${icon('external')}</button>`:''}</div>`;
}

function openAbout(){
 sheet('关于组件',aboutBody(),root=>{
  root.querySelector('#about-repo')?.addEventListener('click',()=>sdk.request('ui.openExternal',{url:manifest().homepage}));
  let taps=0,last=0;
  root.querySelector('#about-version')?.addEventListener('click',()=>{
   const nowMs=Date.now();if(nowMs-last>3000)taps=0;last=nowMs;
   if(++taps>=7){taps=0;openHiddenTools();}
  });
 });
}

function openHiddenTools(){
 sheet('诊断工具',`<div class="group"><div class="row"><span class="row-copy"><strong>雨课堂组件诊断</strong><small>检查小组件渲染、同步状态和宿主日志</small></span></div><button class="nav-row" id="diag-refresh"><span class="row-copy"><span>刷新小组件</span><small>重新绘制桌面实例</small></span>${icon('sync')}</button><button class="nav-row" id="diag-sync"><span class="row-copy"><span>立即同步</span><small>调用雨课堂组件同步流程</small></span>${icon('refresh')}</button><button class="nav-row" id="diag-logs"><span class="row-copy"><span>查看调试日志</span><small>显示最近的组件运行日志</small></span>${icon('bug')}</button><button class="nav-row danger" id="diag-disable"><span class="row-copy"><span>关闭隐藏工具</span><small>关闭隐藏入口</small></span>${icon('lock')}</button></div><pre id="diag-log-output" hidden></pre>`,root=>{
  root.querySelector('#diag-refresh').onclick=()=>sdk.request('debug.refreshWidget').then(()=>toast('已请求刷新小组件'));
  root.querySelector('#diag-sync').onclick=()=>request('sync').then(()=>toast('同步完成'));
  root.querySelector('#diag-logs').onclick=async()=>{
   const out=root.querySelector('#diag-log-output');out.hidden=false;out.textContent='读取中…';
   try{const rows=await sdk.request('debug.logs');out.textContent=(rows||[]).map(x=>`${new Date(x.time).toLocaleTimeString()} [${x.level}] ${x.event} ${x.message||''}`).join('\\n')||'暂无组件日志';}catch(e){out.textContent=e.message;}
  };
  root.querySelector('#diag-disable').onclick=()=>sdk.request('debug.advancedTools',{enabled:false}).then(()=>{toast('已关闭隐藏工具');document.querySelector('#sheet-close')?.click();});
 });
}
const legend=()=>`<div class="legend" aria-label="颜色图例"><span><i class="dot pending"></i>待完成</span><span><i class="dot done"></i>已完成</span><span><i class="dot notice"></i>未读公告</span><span><i class="dot read"></i>已读 / 往期</span></div>`;
const skeletonList=()=>`<div class="skeleton skeleton-line" style="width:96px"></div><div class="skeleton skeleton-block" style="min-height:196px"></div>`;
const emptyState=(text,ic='inbox')=>`<div class="empty"><div class="orb">${icon(ic)}</div><p>${esc(text)}</p></div>`;

function loggedOut(){
 const expired=data.loginState==='expired';
 app.className='page';
 app.innerHTML=header(false)+`<div class="stagger" style="display:contents">`+
  `<section class="welcome${expired?' expired':''}" style="--i:0"><div class="orb">${icon(expired?'alert':'book')}</div><h2>${expired?'登录已过期':'连接你的雨课堂'}</h2><p>${expired?'重新登录后，作业、考试和公告会继续同步和提醒。':'登录后，老师发布的作业、考试和公告由课简整理和提醒。'}</p><button class="primary" id="login">${icon(expired?'refresh':'link')}${expired?'重新登录':'登录雨课堂'}</button></section>`+
  `<p class="section-label" style="--i:1">登录后可以</p>`+
  `<div class="group perks" style="--i:2"><div class="row">${icon('bell')}<div class="row-copy"><span>新内容提醒</span><small>老师发布作业、考试或公告时通知你</small></div></div><div class="row">${icon('clock')}<div class="row-copy"><span>截止前提醒</span><small>按你设定的时间，在截止前提醒一次</small></div></div><div class="row">${icon('calendar')}<div class="row-copy"><span>月历与课表</span><small>按日期整理成月历，也能写进课表事务</small></div></div></div>`+
  (error?bannerHtml(error,'err'):'')+
  `<p class="footnote center" style="--i:3">支持手机号验证码与微信扫码 · 课简不保存你的密码</p></div>`;
 document.getElementById('login').onclick=()=>request('ui.login');bindHeader();
}

function render(){
 if(data.loginState!=='logged_in')return loggedOut();
 ensureDate();
 const keepScroll=view==='list'?app.querySelector('.list-scroll')?.scrollTop:null;
 app.className='page feed-page'+(view==='list'?' list-mode':'');
 const available=allItems(),scoped=available.filter(x=>!type||x.type===type);
 const choices=types().filter(t=>available.some(x=>x.type===t.id));
 const showStatus=hasTaskItems(scoped,manifest()),counts=statusCounts(scoped,manifest());
 if(!showStatus)status='';
 const chip=(attr,value,on,text,n)=>`<button class="chip${on?' on':''}" data-${attr}="${esc(value)}" aria-pressed="${on}">${text}${n!=null?` <span class="n">${n}</span>`:''}</button>`;
 const filters=(choices.length>1||showStatus)?`<div class="filters" role="toolbar" aria-label="筛选">`+
  (choices.length>1?chip('type','',!type,'全部')+choices.map(t=>chip('type',t.id,type===t.id,esc(t.label))).join(''):'')+
  (showStatus?(choices.length>1?'<span class="sep"></span>':'')+chip('status','pending',status==='pending','未完成',counts.pending)+chip('status','done',status==='done','已完成',counts.done):'')+
  `</div>`:'';
 app.innerHTML=header(true)+pendingCard()+
  `<button class="nav-row ignored-entry" id="ignored">${icon('inbox')}<span class="row-copy">已忽略</span><span class="muted">${ignoredItems().length} 项</span>${icon('next')}</button>`+
  segmented('view-seg',[{id:'month',label:'月历',icon:'calendar'},{id:'list',label:'列表',icon:'list'}],view)+
  filters+(data.lastError?bannerHtml(data.lastError,'err'):'')+
  `<div class="pane" id="pane">${view==='month'?monthPane():listPane(available)}</div>`;
 bindHeader();
 bindSegmented(app,'view-seg',v=>{if(v===view)return;paneAnim=v==='list'?'pane-in-r':'pane-in-l';view=v;render();});
 app.querySelectorAll('[data-type]').forEach(b=>b.onclick=()=>{type=b.dataset.type;render();});
 app.querySelectorAll('[data-status]').forEach(b=>b.onclick=()=>{status=status===b.dataset.status?'':b.dataset.status;render();});
 app.querySelectorAll('[data-pending]').forEach(b=>b.onclick=openPending);
 document.getElementById('ignored').onclick=openIgnored;
 bindMonth();bindItems(app);
 if(keepScroll!=null&&!paneAnim){const l=app.querySelector('.list-scroll');if(l)l.scrollTop=keepScroll;}
 if(paneAnim){const p=document.getElementById('pane');const cls=paneAnim;paneAnim='';if(p){p.classList.add(cls);p.addEventListener('animationend',()=>p.classList.remove(cls),{once:true});}}
}

function byDay(){const by={};items().forEach(x=>{const k=dayOf(x);(by[k]??=[]).push(x);});Object.values(by).forEach(l=>l.sort((a,b)=>anchor(a)-anchor(b)));return by;}
function monthPane(){
 const by=byDay(),y=month.getFullYear(),m=month.getMonth(),first=(new Date(y,m,1).getDay()+6)%7,total=new Date(y,m+1,0).getDate();
 let cells='<span></span>'.repeat(first);
 for(let d=1;d<=total;d++){
  const k=key(y,m,d),entries=by[k]||[],wd=(first+d-1)%7;
  const dots=entries.slice(0,3).map(x=>`<i class="dot ${stateOf(x)}"></i>`).join('');
  cells+=`<button class="day${wd>4?' weekend':''}${k===today()?' today':''}${k===selected?' selected':''}${entries.length?' has':''}" data-day="${k}" aria-label="${m+1}月${d}日，${entries.length}项内容" aria-pressed="${k===selected}"><span class="num">${d}</span><span class="dots">${dots}</span></button>`;
 }
 const [ty,tm]=parts(today()),atToday=ty===y&&tm===m+1&&selected===today();
 return `<section class="calendar" aria-label="整月日历"><div class="cal-head"><h2>${y}年${m+1}月</h2><button class="today-chip" id="today"${atToday?' hidden':''}>回到今天</button>${iconButton('prev','back','上个月')}${iconButton('next','next','下个月')}</div>`+
  `<div class="weekdays">${['一','二','三','四','五','六','日'].map((x,i)=>`<span class="weekday${i>4?' weekend':''}">${x}</span>`).join('')}</div><div class="days-view" id="days-view"><div class="days">${cells}</div></div>${legend()}</section>`+
  dayInline(by[selected]||[],selected,false);
}
function bindMonth(){
 app.querySelectorAll('[data-day]').forEach(b=>b.onclick=()=>selectDay(b.dataset.day));
 document.getElementById('prev')?.addEventListener('click',()=>flip(-1));
 document.getElementById('next')?.addEventListener('click',()=>flip(1));
 document.getElementById('today')?.addEventListener('click',()=>{clearTimeout(pageTimer);pageTimer=0;pendingDelta=0;const [y,m]=parts(today()),cur=month;month=new Date(y,m-1,1);const delta=(month.getFullYear()-cur.getFullYear())*12+month.getMonth()-cur.getMonth();if(delta){month=cur;flip(delta,today());}else selectDay(today());});
 document.getElementById('selected')?.addEventListener('click',()=>openDay(selected));
}
/** Update selection and date content locally so transitions do not restart the whole page. */
function selectDay(k){
 if(k===selected)return;selected=k;
 app.querySelectorAll('[data-day]').forEach(b=>{const on=b.dataset.day===k;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on));});
 const t=document.getElementById('today');if(t){const [y,m]=parts(today());t.hidden=k===today()&&month.getFullYear()===y&&month.getMonth()===m-1;}
 const old=document.getElementById('day-inline');
 if(old){old.outerHTML=dayInline(byDay()[k]||[],k,true);const fresh=document.getElementById('day-inline');bindItems(fresh);fresh.querySelector('#selected')?.addEventListener('click',()=>openDay(selected));}
}
function flip(delta,target){
 if(pageTimer){clearTimeout(pageTimer);pageTimer=0;const d=pendingDelta;pendingDelta=0;stepMonth(d);}
 const pane=app.querySelector('#days-view');
 if(!pane){stepMonth(delta,target);return;}
 pane.classList.remove('slide-out-l','slide-out-r','slide-in-l','slide-in-r');
 pane.classList.add(delta>0?'slide-out-l':'slide-out-r');
 pendingDelta=delta;
 pageTimer=setTimeout(()=>{
  pageTimer=0;pendingDelta=0;stepMonth(delta,target);
  const fresh=app.querySelector('#days-view');
  if(fresh){fresh.classList.add(delta>0?'slide-in-r':'slide-in-l');void fresh.offsetWidth;fresh.classList.remove('slide-in-r','slide-in-l');}
 },140);
}
function stepMonth(delta,target){
 const y=month.getFullYear(),m=month.getMonth();month=new Date(y,m+delta,1);
 const [ty,tm]=parts(today());
 selected=target||(month.getFullYear()===ty&&month.getMonth()===tm-1?today():key(month.getFullYear(),month.getMonth(),1));
 render();
}
function dayInline(entries,k,swap){
 const rel=relDay(k);
 const head=`<div class="day-inline-head"><strong>${dateLabel(k)} 周${weekdayOf(k)}${rel?` · ${rel}`:''}</strong><span>${entries.length?`${entries.length} 项`:''}</span></div>`;
 const body=entries.length?`<div class="group day-body">${entries.slice(0,4).map(x=>itemRow(x)).join('')}${entries.length>4?`<button class="day-more" id="selected">查看这天全部 ${entries.length} 项${icon('next')}</button>`:''}</div>`
  :`<div class="day-empty day-body">${icon('inbox')}这一天没有安排</div>`;
 return `<section class="day-inline${swap?' swap':''}" id="day-inline">${head}${body}</section>`;
}

function listPane(available){
 const by=byDay(),keys=Object.keys(by).sort().reverse();
 const fresh=available.length===0&&!data.lastSyncAt;
 const warming=fresh&&performance.now()-bootAt<600&&!data.lastError;
 if(warming&&!bootTimer)bootTimer=setTimeout(()=>{bootTimer=0;render();},650);
 let html;
 if(!keys.length)html=(syncing||warming)?skeletonList():emptyState(data.lastSyncAt?(type||status?'没有符合筛选条件的内容':'还没有课堂内容'):'还没有同步内容，点右上角同步试试',data.lastSyncAt?'inbox':'sync');
 else{const t=today();let i=0;html=keys.map(k=>{const rel=relDay(k);return `<section class="list-day" style="--i:${Math.min(i++,8)}"><div class="list-heading${k<t?' past':''}">${dateLabel(k)} 周${weekdayOf(k)}${rel?` · ${rel}`:''}<small>${by[k].length} 项</small></div><div class="group">${by[k].map(x=>itemRow(x)).join('')}</div></section>`;}).join('');}
 return `<div class="list-scroll${paneAnim?'':' stagger'}">${html}</div>`;
}

function itemRow(x){
 const s=stateOf(x),[cls,text]=stateTag(x);
 const due=x.dueAt?`${s==='pending'&&x.dueAt-now()<86400000&&x.dueAt>now()?`<b>${esc(when(x.dueAt))} 截止</b>`:`截止 ${esc(when(x.dueAt))}`}`:(x.startAt?`开始 ${esc(when(x.startAt))}`:'');
 const meta=[esc(label(x)),esc(x.course||''),due].filter(Boolean).join(' · ');
 return `<button class="item-row${s==='done'||s==='read'?' is-done':''}${x.historical?' is-old':''}" data-item="${esc(x.id)}">${tile(x)}<span class="row-copy"><h3>${esc(x.title||label(x))}</h3><span class="meta">${meta}</span></span>${text?`<span class="pill ${cls}">${text}</span>`:''}</button>`;
}
function bindItems(root){root?.querySelectorAll('[data-item]').forEach(b=>b.onclick=()=>{const item=data.items.find(x=>x.id===b.dataset.item);if(item)openItem(item);});}
function pendingList(){return allItems().filter(x=>isPendingItem(x,manifest())).sort((a,b)=>(a.dueAt||anchor(a))-(b.dueAt||anchor(b)));}
function pendingCard(){
 const list=pendingList(),n=pendingCount(allItems(),manifest());
 if(!n)return `<button class="pending-card clear" data-pending><span class="tile">${icon('check')}</span><span class="row-copy"><span>作业和考试都完成了</span><small>有新内容发布时会提醒你</small></span><span class="chevron">${icon('next')}</span></button>`;
 const next=list.find(x=>x.dueAt&&x.dueAt>now());
 const late=list.filter(overdue).length;
 const sub=next?`最近：${esc(next.title||label(next))} · <span class="next-due">${esc(when(next.dueAt))}</span>`:late?`${late} 项已过截止时间`:'点开查看没做完的作业和考试';
 return `<button class="pending-card" data-pending><span class="tile">${n>99?'99+':n}</span><span class="row-copy"><span>${n} 项待完成</span><small style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${sub}</small></span><span class="chevron">${icon('next')}</span></button>`;
}

const fileExt=n=>{const m=/\.([a-z0-9]{1,6})$/i.exec(n||'');return m?m[1].toUpperCase():'';};
async function busyButton(b,run){if(b.disabled)return;const html=b.innerHTML;b.disabled=true;b.innerHTML=`<span class="spinner"></span>${b.textContent.trim()}`;try{await run();}finally{b.disabled=false;if(b.isConnected&&b.querySelector('.spinner'))b.innerHTML=html;}}
function markDownloaded(btn,entry){btn.className='tonal small done';btn.innerHTML=`${icon('file')}打开`;btn.dataset.saved=entry.id;btn.setAttribute('aria-label','打开已下载的文件');}
async function bindAttachments(root,files){
 root.querySelectorAll('[data-preview]').forEach(b=>b.onclick=()=>busyButton(b,async()=>{try{await sdk.request('media.open',{url:files[b.dataset.preview].url});}catch(err){toast(err.message||'预览失败，请重试','err');}}));
 root.querySelectorAll('[data-download]').forEach(b=>b.onclick=()=>{
  if(b.dataset.saved)return busyButton(b,async()=>{try{await sdk.request('media.openSaved',{id:b.dataset.saved});}catch(err){toast(err.message||'打开失败','err');delete b.dataset.saved;b.className='tonal small';b.innerHTML=`${icon('download')}下载`;}});
  busyButton(b,async()=>{try{const entry=await sdk.request('media.download',{url:files[b.dataset.download].url});toast('已下载');markDownloaded(b,entry);}catch(err){toast(err.message||'下载失败，请重试','err');}});
 });
 try{const saved=await sdk.request('media.downloads');(saved||[]).forEach(entry=>{const n=files.findIndex(f=>f.url===entry.url);const btn=n>=0&&root.querySelector(`[data-download="${n}"]`);if(btn)markDownloaded(btn,entry);});}catch{}
}

function openDay(k){
 const entries=byDay()[k]||[];
 sheet(`${dateLabel(k)} 周${weekdayOf(k)}`,entries.length?`<div class="group stagger">${entries.map((x,i)=>itemRow(x).replace('<button ',`<button style="--i:${i}" `)).join('')}</div>`:emptyState('这一天没有安排'),root=>bindItems(root));
}
function openPending(){
 const list=pendingList();
 sheet(`待完成 · ${list.length} 项`,list.length?`<p class="section-label">按截止时间排序</p><div class="group stagger">${list.map((x,i)=>itemRow(x).replace('<button ',`<button style="--i:${i}" `)).join('')}</div>`:emptyState('没有待完成的作业和考试','check'),root=>bindItems(root));
}
function fact(ic,name,value,note='',urgent=false){return `<div class="row">${icon(ic)}<span class="row-copy"><small>${name}</small><span>${esc(value)}</span></span>${note?`<span class="fact-note${urgent?' urgent':''}">${esc(note)}</span>`:''}</div>`;}
function openIgnored(){
 const list=ignoredItems();
 sheet(`已忽略 · ${list.length} 项`, `<p class="muted">这些内容不会出现在待完成小组件或提醒中。点开详情可恢复。</p>`+
  (list.length?`<div class="group">${list.map(itemRow).join('')}</div>`:emptyState('没有已忽略的内容','inbox')), root=>bindItems(root));
}

function openItem(x){
 const s=stateOf(x),[cls,text]=stateTag(x),body=x.content||x.summary||'';
 const facts=[];
 if(x.dueAt)facts.push(fact('clock','截止时间',when(x.dueAt),s==='pending'?remain(x.dueAt):'',s==='pending'&&x.dueAt-now()<86400000));
 if(x.startAt)facts.push(fact('calendar','开始时间',when(x.startAt),!x.dueAt&&x.startAt>now()?remain(x.startAt):''));
 if(x.publishAt)facts.push(fact('megaphone','发布时间',when(x.publishAt)));
 if(x.author)facts.push(fact('user','发布人',x.author));
 const images=x.images||[],files=x.attachments||[];
 sheet(label(x),
  `<div class="detail-head">${tile(x)}<div class="row-copy"><h2 class="detail-title">${esc(x.title||label(x))}</h2>${x.course?`<div class="muted">${esc(x.course)}</div>`:''}</div></div>`+
  ((text||x.historical)?`<div class="detail-tags">${text?`<span class="pill ${cls}">${text}</span>`:''}${x.historical&&s!=='old'?'<span class="pill old">往期</span>':''}</div>`:'')+
  (facts.length?`<div class="group facts">${facts.join('')}</div>`:'')+
  (body?`<div class="body">${esc(body)}</div>`:'')+
  (images.length?`<p class="section-label">图片 · ${images.length}</p><div class="media-grid">${images.map(i=>`<img class="media" src="${esc(i.url)}" alt="${esc(i.name||'公告图片')}" loading="lazy">`).join('')}</div>`:'')+
  (files.length?`<p class="section-label">附件 · ${files.length}</p><div class="group">${files.map((a,n)=>`<div class="att" data-att="${n}"><div class="att-head"><span class="type-tile">${icon('file')}</span><span class="row-copy"><span class="att-name">${esc(a.name||'附件')}</span><small class="att-meta">${[fileExt(a.name),a.size?fileSize(a.size):''].filter(Boolean).join(' · ')||'附件'}</small></span></div><div class="att-actions"><button class="secondary small" data-preview="${n}">${icon('eye')}预览</button><button class="tonal small" data-download="${n}">${icon('download')}下载</button></div></div>`).join('')}</div>`:'')+
  (!body&&!images.length&&!files.length?`<p class="footnote center">这条内容没有正文</p>`:''),
  root=>{
   const close=root.querySelector('#sheet-close');
   const controls=document.createElement('div');controls.className='detail-actions';
   const ignored=isIgnoredItem(x,data,now(),manifest());
   const ignore=document.createElement('button');ignore.className='secondary small';ignore.textContent=ignored?'恢复':'忽略';
   ignore.onclick=async()=>{
    if(ignore.disabled)return;ignore.disabled=true;
    try {const saved=await sdk.request('item.ignore',{itemId:x.id,ignored:!ignored});data=saved;snapshot={...snapshot,data:saved};render();openItem(saved.items.find(i=>i.id===x.id)||x);toast(ignored?'已恢复':'已忽略，可在已忽略列表恢复');}
    catch(e){ignore.disabled=false;toast(e.message,'err');}
   };
   controls.append(ignore);close.before(controls);
   if(ignored){const hint=document.createElement('p');hint.className='banner info';hint.textContent='已忽略，不会出现在待完成小组件和提醒中。';root.querySelector('.sheet-body').prepend(hint);}
   bindAttachments(root,files);
   root.querySelectorAll('img.media').forEach((im,idx)=>im.addEventListener('click',()=>openLightbox(images,idx)));
   root.querySelectorAll('img.media').forEach(i=>i.onerror=()=>{const b=document.createElement('button');b.className='secondary wide';b.innerHTML=`${icon('refresh')}图片加载失败，点击重试`;i.replaceWith(b);b.onclick=()=>{b.replaceWith(i);i.src=i.getAttribute('src');};});
  });
}

let widgetAboutOpened=false;
sdk.subscribe(value=>{const was=data.loginState;snapshot=value;data=value.data;if(was!==data.loginState&&data.loginState!=='logged_in')document.getElementById('sheet')?.remove();render();if(value.context?.widgetAbout&&!widgetAboutOpened){widgetAboutOpened=true;setTimeout(openAbout,0);}});
