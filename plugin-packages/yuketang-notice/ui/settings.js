import {sdk,esc,icon,iconButton,sheet,selectField,bindAll,toast,friendlyTime,pickerSheet} from './shared.js';
const app=document.getElementById('app'),clone=v=>JSON.parse(JSON.stringify(v));
let state=sdk.state,busy='',panel='',first=true,refreshTimer=0,downloads=null;
const fileSize=b=>b>=1048576?`${(b/1048576).toFixed(1)} MB`:`${Math.max(1,Math.round(b/1024))} KB`;
async function loadDownloads(){try{downloads=await sdk.request('media.downloads')||[];}catch{downloads=[];}render();if(panel==='downloads'&&document.getElementById('sheet'))openPanel('downloads');}
/** Wait for switch animation before replacing its node. */
function refresh(delay=280){clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{render();if(panel&&document.getElementById('sheet'))openPanel(panel);},delay);}
const dateLabels=[['automatic','自动选择'],['publish','发布日期'],['start','开始日期'],['due','截止日期']];
const typeIcons={homework:'edit',exam:'clock',announcement:'megaphone',notice:'info'};
const toggle=(key,value,label)=>`<input aria-label="${esc(label||key)}" type="checkbox" role="switch" data-host="${key}" ${value?'checked':''}>`;
/**
 * Labels make switch rows clickable; text inputs use div to avoid accidental keyboard focus.
 */
const row=(title,description,field,ic='',tag='label')=>`<${tag} class="row${tag==='label'?' pressable':''}">${ic?icon(ic):''}<span class="row-copy"><span>${title}</span>${description?`<small>${description}</small>`:''}</span>${field}</${tag}>`;
const inputRow=(title,description,field,ic='')=>row(title,description,field,ic,'div');
const types=()=>state.manifest.extension.feedTypes||[];
const typeChoices=(key,included)=>types().map(t=>`<label class="row pressable"><span class="type-tile" style="color:${esc(t.color)}">${icon(typeIcons[t.id]||(t.kind==='notice'?'bell':'file'))}</span><span class="row-copy"><span>${esc(t.label)}</span></span><input aria-label="${esc(t.label)}" role="switch" type="checkbox" data-type-kind="${key}" data-type="${esc(t.id)}" ${included==null||included.includes(t.id)?'checked':''}></label>`).join('');
const nav=(key,title,desc,name,extra='')=>`<button class="nav-row" data-panel="${key}"${extra}>${icon(name)}<span class="row-copy"><span>${title}</span><small>${esc(desc)}</small></span><span class="chevron">${icon('next')}</span></button>`;
const tz=()=>state.context?.timeZone||'Asia/Shanghai';
const siteSpec=()=>state.manifest.extension.settings.find(x=>x.key==='site');
function siteName(){const s=siteSpec();return s.options.find(x=>x.value===(state.data.settings.site||s.default))?.label||'';}

/** Only synchronization blocks the page; settings update locally without a full busy redraw. */
async function action(command,payload={},{quiet=true}={}){
 if(busy==='sync'&&command==='sync')return;
 if(command==='sync'){busy='sync';render();}
 try{
  const result=await sdk.request(command,payload);
  if(result?.host)state={...state,data:result};
  if(command==='sync')toast(result?.count!=null?`同步完成 · ${result.count} 条内容`:'同步完成');
  else if(!quiet)toast('已保存');
 }catch(e){toast(e.message||'操作未完成，请重试','err');}
 finally{if(command==='sync'){busy='';refresh(0);}else refresh();}
}
function setPath(object,path,value){const parts=path.split('.');let target=object;parts.slice(0,-1).forEach(k=>{target[k]||={};target=target[k];});target[parts[parts.length-1]]=value;}

function fields(){
 return state.manifest.extension.settings.filter(x=>x.key!=='site').map(s=>{
  const value=state.data.settings[s.key]??s.default;
  if(s.type==='switch')return row(esc(s.label),esc(s.description),`<input aria-label="${esc(s.label)}" type="checkbox" role="switch" data-setting="${esc(s.key)}" ${value?'checked':''}>`);
  if(s.type==='select')return selectField({id:`set-${esc(s.key)}`,label:esc(s.label),description:esc(s.description),value,options:s.options.map(x=>({value:x.value,label:x.label}))}).html;
  return inputRow(esc(s.label),esc(s.description),`<input aria-label="${esc(s.label)}" type="${s.type==='number'?'number':'text'}" data-setting="${esc(s.key)}" value="${esc(value)}">`);
 }).join('');
}
function selectFields(){return state.manifest.extension.settings.filter(x=>x.key!=='site'&&x.type==='select').map(s=>selectField({
 id:`set-${esc(s.key)}`,label:esc(s.label),description:esc(s.description),
 value:state.data.settings[s.key]??s.default,options:s.options.map(x=>({value:x.value,label:x.label})),
 onPick:v=>action('settings.update',{[s.key]:v}),
}));}

function render(){
 const d=state.data,h=d.host,signed=d.loginState==='logged_in',expired=d.loginState==='expired';
 const name=d.account?.name||'';
 const avatarUrl=d.account?.avatar||'';
 const avatar=avatarUrl?`<img src="${esc(avatarUrl)}" alt="" loading="lazy" onerror="this.replaceWith(document.createTextNode('${esc(signed&&name?[...name][0]:'')}'))">`
  :(signed&&name?esc([...name][0]):icon(signed?'user':'lock'));
 const statusLine=!signed?`${icon('info')}<span>登录后，课简会按这里的设置同步和提醒</span>`
  :d.lastError?`${icon('alert')}<span>${esc(d.lastError)}</span>`
  :busy==='sync'?`<span class="spinner"></span><span>正在同步课堂内容…</span>`
  :`${icon('check')}<span>${d.lastSyncAt?`上次同步：${esc(friendlyTime(d.lastSyncAt,tz(),state.context?.nowMillis||Date.now()))}`:'已连接，可以立即同步'}</span>`;
 const keepY=window.scrollY;
 app.innerHTML=`<header class="bar"><button class="tonal-btn" id="back" aria-label="返回">${icon('back')}</button><h1>雨课堂设置</h1></header>
 <div class="${first?'stagger':''}" style="display:contents">
 <section class="account-card${signed?'':' off'}" style="--i:0"><span class="avatar">${avatar}</span><span class="row-copy"><strong>${esc(signed?name||'已连接雨课堂':expired?'登录已过期':'还未登录')}</strong><small>${esc(signed?[d.account?.school,siteName()].filter(Boolean).join(' · '):siteName()+' · 登录后开始同步')}</small></span>${signed?'':`<button class="primary small" id="login">${expired?'重新登录':'登录'}</button>`}</section>
 <div class="sync-card" style="--i:1"><button class="primary" id="feed">${icon(signed?'calendar':'link')}${signed?'打开我的课堂':'登录并连接'}</button>${signed?`<button class="tonal-btn${busy==='sync'?' spin':''}" id="sync" aria-label="立即同步"${busy==='sync'?' disabled':''}>${icon('sync')}</button>`:''}</div>
 <div class="sync-status${signed&&d.lastError?' err':''}" style="--i:2">${statusLine}</div>
 <p class="section-label" style="--i:3">提醒与显示</p>
 <div class="group" style="--i:4">
 ${nav('reminder','通知与同步',`${h.notifyNew?'新内容提醒已开':'新内容提醒已关'} · ${h.dueReminderHours?`截止前 ${h.dueReminderHours} 小时提醒`:'不提醒截止'}`,'bell')}
 ${nav('feed','侧边栏页面',h.showInSidebar?`已开启 · 默认${h.feed.defaultView==='list'?'列表':'月历'}`:'已关闭','calendar')}
 ${nav('schedule','写进课表事务',h.addToSchedule?'已开启 · 按日期规则加入课表':'已关闭','list')}
 </div>
 <p class="section-label" style="--i:5">同步</p>
 <div class="group" style="--i:6">${nav('content','同步内容','作业、考试、公告与往期范围','book')}${nav('downloads','已下载的附件',downloads==null?'正在读取…':downloads.length?`${downloads.length} 个文件 · ${fileSize(downloads.reduce((t,x)=>t+(x.size||0),0))}`:'还没有下载过附件','folder')}</div>
 <p class="section-label" style="--i:7">账号与组件</p>
 <div class="group" style="--i:8">
 <button class="nav-row" id="site-row">${icon('globe')}<span class="row-copy"><span>雨课堂站点</span><small>${esc(siteName())} · 换站点后需要重新登录</small></span><span class="chevron">${icon('next')}</span></button>
 <button class="nav-row" id="relogin">${icon(signed?'swap':'user')}<span class="row-copy"><span>${signed?'切换账号 / 重新登录':'登录雨课堂'}</span><small>${signed?'换账号或登录过期时使用':'登录后才能同步课堂内容'}</small></span><span class="chevron">${icon('next')}</span></button>
 ${signed?`<button class="nav-row danger" id="logout">${icon('logout')}<span class="row-copy"><span>退出登录</span><small>清除已同步的内容，保留设置和已下载的附件</small></span></button>`:''}
 <button class="nav-row danger" id="remove">${icon('trash')}<span class="row-copy"><span>移除组件</span><small>连同登录、缓存、下载、提醒和课表事务一起删除</small></span></button>
 </div>
 <p class="footnote center" style="--i:9">${esc(state.manifest.name)} · v${esc(state.manifest.version)}</p>
 </div>`;
 if(keepY)window.scrollTo(0,keepY);
 document.getElementById('back').onclick=()=>sdk.request('ui.close');
 document.getElementById('login')?.addEventListener('click',()=>action('ui.login'));
 document.getElementById('relogin').onclick=()=>action('ui.login');
 document.getElementById('site-row').onclick=()=>{const sp=siteSpec();pickerSheet('雨课堂站点',sp.options.map(x=>({value:x.value,label:x.label})),d.settings.site||sp.default,v=>{if(v!==(d.settings.site||sp.default))action('settings.update',{site:v},{quiet:false});},'选择学校使用的雨课堂；切换后需要重新登录');};
 document.getElementById('logout')?.addEventListener('click',()=>confirmSheet('退出登录？','会清除这个账号已同步的内容和关联的课表事务；组件设置和已下载的附件都会保留。','退出登录',()=>action('logout')));
 document.getElementById('remove').onclick=()=>action('component.remove');
 document.getElementById('feed').onclick=()=>action(signed?'ui.feed':'ui.login');
 document.getElementById('sync')?.addEventListener('click',()=>action('sync'));
 app.querySelectorAll('[data-panel]').forEach(b=>b.onclick=()=>openPanel(b.dataset.panel));
 first=false;
}
function openPanel(key){
 panel=key;const d=state.data,h=d.host;
 let title='',body='',binds=[];
 if(key==='reminder'){
  title='通知与同步';
  const due=selectField({id:'p-due',label:'截止前提醒',description:'按内容原始截止时间提前提醒一次',value:h.dueReminderHours,options:[[0,'不提醒'],[1,'提前 1 小时'],[3,'提前 3 小时'],[6,'提前 6 小时'],[12,'提前 12 小时'],[24,'提前 1 天'],[48,'提前 2 天']].map(([v,l])=>({value:v,label:l})),onPick:v=>action('host.update',{...state.data.host,dueReminderHours:Number(v)})});
  const interval=selectField({id:'p-interval',label:'后台同步间隔',description:'手机系统可能推迟后台同步',value:h.syncIntervalMinutes??'',options:[[null,'组件默认（1 小时）'],[30,'30 分钟'],[60,'1 小时'],[120,'2 小时'],[240,'4 小时'],[480,'8 小时']].map(([v,l])=>({value:v??'',label:l})),onPick:v=>action('host.update',{...state.data.host,syncIntervalMinutes:v===''?null:Number(v)})});
  body=`<div class="group">${row('新内容通知','老师发布作业、考试或公告时提醒',toggle('notifyNew',h.notifyNew,'新内容通知'),'bell')}${row('自动忽略逾期任务','默认关闭；开启后从小组件和提醒中收起逾期任务，可在已忽略列表恢复',toggle('ignoreOverdue',h.ignoreOverdue===true,'自动忽略逾期任务'),'inbox')}</div><p class="section-label">提醒时间</p><div class="group">${due.html}</div><p class="section-label">同步</p><div class="group">${interval.html}</div>`;
  binds.push(due,interval);
 }
 else if(key==='content'){title='同步内容';body=`<div class="group">${fields()}</div>`;binds.push(...selectFields());}
 else if(key==='feed'||key==='schedule'){
  const feed=key==='feed',config=h[key],on=feed?h.showInSidebar:h.addToSchedule;title=feed?'侧边栏页面':'写进课表事务';
  body=`<div class="group">${row(feed?'在侧边栏显示':'写进课表事务',feed?'从课简侧边栏直接打开月历和列表':'自动添加和更新，不会重复创建',toggle(feed?'showInSidebar':'addToSchedule',on,title),feed?'calendar':'list')}</div>`;
  if(on){
   body+='<p class="section-label">显示哪些内容</p>'+`<div class="group">${typeChoices(key,config.includedTypes)}</div>`;
   if(feed){
    const view=selectField({id:'p-view',label:'默认视图',description:'页面里随时可以切换',value:config.defaultView,options:[{value:'month',label:'月历'},{value:'list',label:'列表'}],onPick:v=>{const next=clone(state.data.host);next.feed.defaultView=v;action('host.update',next);}});
    const src=selectField({id:'p-source',label:'按哪个日期显示',description:'只改变显示在哪一天，不影响提醒',value:config.dateSource,options:dateLabels.map(([v,l])=>({value:v,label:l})),onPick:v=>{const next=clone(state.data.host);next.feed.dateSource=v;action('host.update',next);}});
    body+=`<p class="section-label">页面</p><div class="group">${view.html}${src.html}</div>`;binds.push(view,src);
   }
   body+=`<p class="section-label">保留范围</p><div class="group">${row('保留已完成的任务','',toggle(`${key}.includeCompleted`,config.includeCompleted,'保留已完成的任务'),'check')}${row('保留已读公告','',toggle(`${key}.includeReadNotices`,config.includeReadNotices,'保留已读公告'),'megaphone')}${inputRow('历史天数','只显示最近这么多天；0 表示全部',`<input aria-label="历史天数" type="number" inputmode="numeric" min="0" max="36500" data-host="${key}.historyDays" value="${config.historyDays}">`,'clock')}</div>`;
   if(!feed){
    body+=`<p class="section-label">时间与外观</p><div class="group">${inputRow('默认开始时间','内容没有时段时使用',`<input aria-label="默认开始时间" type="time" data-host="schedule.defaultStartTime" value="${esc(config.defaultStartTime)}">`,'clock')}${inputRow('事务时长','分钟；不会额外创建闹钟',`<input aria-label="事务时长" type="number" inputmode="numeric" min="1" max="1440" data-host="schedule.durationMinutes" value="${config.durationMinutes}">`,'calendar')}${row('标题前加类型','例如「作业 · 第三章练习」',toggle('schedule.showTypeInTitle',config.showTypeInTitle,'标题前加类型'),'edit')}${row('使用类型颜色','作业、考试、公告用不同颜色',toggle('schedule.useTypeColors',config.useTypeColors,'使用类型颜色'),'info')}</div>`;
    body+='<p class="section-label">按类型细调</p>'+`<div class="group">${types().map(t=>nav('rule:'+t.id,esc(t.label),ruleSummary(t.id),typeIcons[t.id]||'calendar')).join('')}</div>`;
   }
  }
 }
 else if(key.startsWith('rule:')){
  const id=key.slice(5),t=types().find(t=>t.id===id),r=h.schedule.typeRules[id]||{dateSource:'automatic',dayOffset:0,timeMode:'source'};
  title=t.label+' · 日期与时间';
  const src=selectField({id:'p-rule-src',label:'按哪个日期显示',value:r.dateSource,options:dateLabels.map(([v,l])=>({value:v,label:l})),onPick:v=>ruleChange(id,'dateSource',v)});
  const tm=selectField({id:'p-rule-time',label:'显示时段',value:r.timeMode,options:[{value:'source',label:'内容原始时段'},{value:'fixed',label:'统一用默认开始时间'}],onPick:v=>ruleChange(id,'timeMode',v)});
  body=`<button class="nav-row" data-panel="schedule" style="min-height:44px">${icon('back')}<span class="row-copy"><small>返回课表事务</small></span></button><p class="section-label">日期</p><div class="group">${src.html}${inputRow('提前 / 推后','负数提前，正数推后（天）',`<input aria-label="日期偏移" type="number" inputmode="numeric" min="-365" max="365" data-rule="${esc(id)}" data-rule-key="dayOffset" value="${r.dayOffset}">`,'calendar')}</div><p class="section-label">时间</p><div class="group">${tm.html}</div>`;
  binds.push(src,tm);
 }
 else if(key==='downloads'){
  title='已下载的附件';
  const list=downloads||[];
  body=list.length?`<p class="muted" style="margin:0 4px">只保存在课简里，移除组件时会一起删除</p><div class="group">${list.map(x=>`<div class="row dl-row"><span class="type-tile">${icon('file')}</span><button class="row-copy dl-open" data-open="${esc(x.id)}"><span>${esc(x.name)}</span><small>${fileSize(x.size||0)} · ${esc(friendlyTime(x.savedAt,tz(),Date.now()))}下载</small></button><button class="icon-btn" data-del="${esc(x.id)}" aria-label="删除">${icon('trash')}</button></div>`).join('')}</div>`
   :`<div class="empty"><div class="orb">${icon('folder')}</div><p>还没有下载过附件<br>在公告详情里点「下载」后会出现在这里</p></div>`;
 }
 sheet(title,body,(root,close)=>{
  const done=()=>{panel='';close();};
  root.querySelector('#sheet-close').onclick=done;
  root.onclick=e=>{if(e.target===root)done();};
  bindAll(root,binds);
  root.querySelectorAll('[data-panel]').forEach(b=>b.onclick=()=>openPanel(b.dataset.panel));
  root.querySelectorAll('[data-setting]').forEach(i=>i.onchange=()=>action('settings.update',{[i.dataset.setting]:i.type==='checkbox'?i.checked:i.type==='number'?Number(i.value):i.value}));
  root.querySelectorAll('[data-host]').forEach(i=>i.onchange=()=>{const next=clone(state.data.host),value=i.type==='checkbox'?i.checked:i.type==='number'?Number(i.value):i.value;setPath(next,i.dataset.host,value);action('host.update',next);});
  root.querySelectorAll('[data-type-kind]').forEach(i=>i.onchange=()=>{const next=clone(state.data.host);next[key].includedTypes=[...root.querySelectorAll('[data-type-kind]:checked')].map(x=>x.dataset.type);action('host.update',next);});
  root.querySelectorAll('[data-rule]').forEach(i=>i.onchange=()=>ruleChange(i.dataset.rule,i.dataset.ruleKey,i.type==='number'?Number(i.value):i.value));
  root.querySelectorAll('[data-open]').forEach(b=>b.onclick=async()=>{try{await sdk.request('media.openSaved',{id:b.dataset.open});}catch(e){toast(e.message||'打开失败','err');loadDownloads();}});
  root.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{const row=b.closest('.dl-row');row?.classList.add('leaving');try{await sdk.request('media.delete',{id:b.dataset.del});toast('已删除');}catch(e){toast(e.message||'删除失败','err');}setTimeout(loadDownloads,180);});
 });
}
function confirmSheet(title,text,confirmLabel,run){
 panel='';
 sheet(title,`<p class="muted" style="font-size:14px;line-height:1.7;margin:0 4px">${esc(text)}</p><div class="confirm-actions"><button class="secondary" id="confirm-cancel">取消</button><button class="primary danger" id="confirm-ok">${esc(confirmLabel)}</button></div>`,(r,c)=>{
  r.querySelector('#confirm-cancel').onclick=c;
  r.querySelector('#confirm-ok').onclick=()=>{c();run();};
 });
}
function ruleSummary(id){const r=state.data.host.schedule.typeRules?.[id];if(!r)return '自动选择日期 · 原始时段';const src=Object.fromEntries(dateLabels)[r.dateSource]||'自动选择';const off=r.dayOffset?` · ${r.dayOffset>0?'推后':'提前'} ${Math.abs(r.dayOffset)} 天`:'';return `${src}${off} · ${r.timeMode==='fixed'?'默认时间':'原始时段'}`;}
function ruleChange(id,key,value){const next=clone(state.data.host);next.schedule.typeRules[id]||={dateSource:'automatic',dayOffset:0,timeMode:'source'};next.schedule.typeRules[id][key]=value;action('host.update',next);}
sdk.subscribe(value=>{state=value;if(first){render();loadDownloads();}else refresh();});
