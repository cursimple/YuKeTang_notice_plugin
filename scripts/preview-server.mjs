// Local-only UI fixtures. Never included in the installable component.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../plugin-packages/yuketang-notice');
const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
const coursewareFixture=process.env.YKT_COURSEWARE_FIXTURE ? await fs.readFile(process.env.YKT_COURSEWARE_FIXTURE) : null;
const pdfSize=(await fs.stat(path.join(root,'../../scripts/fixtures/course-notice.pdf'))).size;
const image='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#ddf1e4"/><text x="40" y="110" fill="#226746" font-size="24">课程通知 · 示例配图</text></svg>');
const host={notifyNew:true,dueReminderHours:24,syncIntervalMinutes:60,showInSidebar:true,addToSchedule:false,feed:{defaultView:'month',dateSource:'automatic',includeCompleted:true,includeReadNotices:true,historyDays:0,includedTypes:null},schedule:{includedTypes:null,includeCompleted:false,includeReadNotices:true,historyDays:0,defaultStartTime:'09:00',durationMinutes:30,showTypeInTitle:true,useTypeColors:true,typeRules:{}}};
const items=[{id:'notice-1',type:'announcement',kind:'notice',title:'下周课程安排调整通知',course:'计算机网络 · 张老师',publishAt:Date.parse('2026-10-03T10:00:00+08:00'),content:'下周一的课程调整至信息楼 302 教室。\n请大家提前安排好时间，准时到课。',images:[{url:image,name:'课程安排示例'}],attachments:[{url:'/__preview/course-notice.pdf',name:'课程安排.pdf',size:pdfSize}]},{id:'task-1',type:'homework',kind:'task',title:'第三章 · 网络层课后练习',course:'计算机网络',dueAt:Date.parse('2026-10-03T23:00:00+08:00'),done:false},{id:'exam-1',type:'exam',kind:'task',title:'阶段测验',course:'高等数学',startAt:Date.parse('2026-10-12T09:00:00+08:00'),dueAt:Date.parse('2026-10-12T10:00:00+08:00')},{id:'task-2',type:'homework',kind:'task',title:'第二章 · 物理层练习',course:'计算机网络',dueAt:Date.parse('2026-10-15T23:00:00+08:00'),done:true},{id:'notice-2',type:'announcement',kind:'notice',title:'实验课分组名单',course:'计算机网络',publishAt:Date.parse('2026-09-29T09:00:00+08:00'),content:'分组名单见附件。',done:true},{id:'old-1',type:'announcement',kind:'notice',title:'上学期课程总结',course:'大学物理',historical:true,publishAt:Date.parse('2026-09-01T10:00:00+08:00')}];
items.push(
 {id:"courseware:101:3001",type:"homework",kind:"task",category:"课件",title:"新学期学生手册 · 学习共享课指南",course:"AI 创意工坊",publishAt:Date.parse("2026-10-03T11:45:00+08:00"),dueAt:null,done:false,summary:"课件 · 已阅读 3/28 页 · 待阅读 · 未设截止时间"},
 {id:"courseware:101:3002",type:"homework",kind:"task",category:"课件",title:"第一章预习课件",course:"计算机网络",publishAt:Date.parse("2026-10-02T11:45:00+08:00"),dueAt:null,done:true,summary:"课件 · 已阅读 12/12 页 · 已读完 · 未设截止时间"},
);
function script(params){const data={host,loginState:params.get('state')||'logged_in',account:{id:'fixture',name:'林同学',school:'课简演示数据',avatar:params.get('avatar')==='portrait'?'/__preview/avatar.svg':params.get('avatar')==='broken'?'/__preview/missing-avatar.svg':''},settings:{site:'changjiang.yuketang.cn'},items:params.get('sample')==='courseware'?items.filter(x=>x.category==='课件'):items,lastSyncAt:Date.parse('2026-10-03T09:00:00+08:00')};return `<script>
let fixture=${JSON.stringify({manifest,data,context:{timeZone:'Asia/Shanghai',nowMillis:Date.parse('2026-10-03T12:00:00+08:00')}})};
fixture.context.language=${JSON.stringify(params.get('lang')||'zh-CN')};
fixture.context.fontScale=${Number(params.get('scale'))||1};
fixture.context.width=innerWidth;fixture.context.height=innerHeight;
fixture.context.theme=${JSON.stringify(params.get('theme')==='dark'?{dark:true,primary:'#A9D4B0',onPrimary:'#163A22',primaryContainer:'#2A5035',onPrimaryContainer:'#C5F0CA',surface:'#101B13',surfaceContainerLow:'#19271D',surfaceContainer:'#202E24',surfaceContainerHigh:'#29382C',surfaceContainerHighest:'#304135',onSurface:'#DEE9DD',onSurfaceVariant:'#BECABD',outline:'#889787',outlineVariant:'#405143',error:'#FFB4AB'}:params.get('theme')==='blue'?{dark:false,primary:'#2C5EAA',onPrimary:'#FFFFFF',primaryContainer:'#D7E3FF',onPrimaryContainer:'#102F60',surface:'#F6F8FF',surfaceContainerLow:'#EDF2FC',surfaceContainer:'#E5ECF8',surfaceContainerHigh:'#DCE5F4',surfaceContainerHighest:'#D3DFEF',onSurface:'#162033',onSurfaceVariant:'#485465',outline:'#768294',outlineVariant:'#C5CEDC',error:'#BA1A1A'}:{dark:false,primary:'#356B41',onPrimary:'#FFFFFF',primaryContainer:'#B8F0BB',onPrimaryContainer:'#12371A',surface:'#F5FBF2',surfaceContainerLow:'#EFF5EC',surfaceContainer:'#E9EFE6',surfaceContainerHigh:'#E3E9E0',surfaceContainerHighest:'#DDE3DA',onSurface:'#181D18',onSurfaceVariant:'#424940',outline:'#73796E',outlineVariant:'#C2C8BD',error:'#BA1A1A'})};
fixture.context.theme.background=fixture.context.theme.surface;fixture.context.theme.surfaceVariant=fixture.context.theme.surfaceContainer;
window.CurSimpleWidget={get state(){return {...fixture.data,manifest:fixture.manifest,context:{...fixture.context,width:innerWidth,height:innerHeight}};},ready(areas){window.widgetAreas=areas;}};
fixture.context.diagnostics={enabled:sessionStorage.getItem('rain-tools')==='true',activationTaps:5,resetAfterMillis:3000,testContentSupported:true};
const receivedAt=Date.now(),clockAnchor=fixture.context.nowMillis;
function restorePreviewPreferences(){
try{const saved=JSON.parse(sessionStorage.getItem('ykt-preview-host')||'null');if(saved)fixture.data.host={...fixture.data.host,...saved,feed:{...fixture.data.host.feed,...saved.feed},schedule:{...fixture.data.host.schedule,...saved.schedule}};}catch{}
try{fixture.data.ignoredItemIds=JSON.parse(sessionStorage.getItem('ykt-preview-ignored')||'[]');fixture.data.restoredItemIds=JSON.parse(sessionStorage.getItem('ykt-preview-restored')||'[]');}catch{}
}
restorePreviewPreferences();
const listeners=new Set();window.calls=[];window.requestPayloads=[];window.push=()=>{fixture.context.nowMillis=clockAnchor+Date.now()-receivedAt;listeners.forEach(f=>f(fixture));};
window.addEventListener('pageshow',e=>{if(e.persisted){restorePreviewPreferences();push();}});
window.CurSimpleComponent={get state(){return fixture;},subscribe(fn){listeners.add(fn);fn(fixture);return()=>listeners.delete(fn)},async request(command,payload={}){window.calls.push(command);window.requestPayloads.push({command,payload});if(command==='settings.update'){Object.assign(fixture.data.settings,payload);push();return fixture.data;}if(command==='host.update'){fixture.data.host=payload;sessionStorage.setItem('ykt-preview-host',JSON.stringify(payload));push();return fixture.data;}if(command==='web.cookie')return 'fixture-cookie';if(command==='login.check'){if(window.previewLoginHold)await new Promise(resolve=>window.previewReleaseLogin=resolve);if(payload.expectedAccountId)fixture.data.account.id=payload.expectedAccountId;if(new URLSearchParams(location.search).get('result')==='session-error')throw new Error('账号校验超时，请重新检查登录结果');fixture.data.loginState='logged_in';push();return fixture.data;}if(command==='logout'){fixture.data.loginState='logged_out';fixture.data.items=[];push();return fixture.data;}if(command.startsWith('ui.')&&['ui.login','ui.settings','ui.close','ui.feed'].includes(command)){const page={'ui.login':'login','ui.settings':'settings','ui.close':'back','ui.feed':'feed'}[command];if(parent!==window){parent.postMessage({type:'component-preview-route',page},location.origin);return true;}if(command==='ui.feed'&&window.previewNavigationFailures){window.previewNavigationFailures--;throw new Error('课堂页面暂时打不开');}if(command==='ui.feed'&&window.previewNavigationReady===false)return false;const target=(page==='back'?'feed':page)+'.html?state='+fixture.data.loginState;if(payload.replace)location.replace(target);else location.href=target;return true;}if(command==='sync'){if(window.previewFail)throw new Error('演示：同步失败，请重试');fixture.data.lastAttemptAt=Date.now();fixture.data.lastSyncAt=Date.now();push();return {count:fixture.data.items.length};}
if(command==='ui.navigation')return true;
if(command==='ui.orientation'){if(window.previewOrientationFail)throw new Error('演示：方向切换失败');window.previewOrientationMode=payload.mode;return true;}
if(command==='debug.advancedTools'){fixture.context.diagnostics.enabled=payload.enabled;sessionStorage.setItem('rain-tools',String(payload.enabled));push();return payload.enabled;}
if(command==='debug.refreshWidget'){if(window.previewFail)throw new Error('演示：刷新失败');return true;}
if(command==='debug.logs'){if(window.previewFail)throw new Error('演示：日志读取失败');return [{time:Date.now(),level:'I',event:'preview.sync',source:'演示',message:'模拟同步完成，8 条内容'},{time:Date.now()-1000,level:'W',event:'preview.retry',source:'演示',message:'模拟超时后重试'},{time:Date.now()-2000,level:'E',event:'preview.error',source:'演示',message:'模拟错误，供筛选测试'}];}
if(command==='item.ignore'){
 const id=payload.itemId,ignored=new Set(fixture.data.ignoredItemIds||[]),restored=new Set(fixture.data.restoredItemIds||[]);
 if(payload.ignored){ignored.add(id);restored.delete(id);}else{ignored.delete(id);restored.add(id);}
 fixture.data.ignoredItemIds=[...ignored];fixture.data.restoredItemIds=[...restored];sessionStorage.setItem('ykt-preview-ignored',JSON.stringify([...ignored]));sessionStorage.setItem('ykt-preview-restored',JSON.stringify([...restored]));push();return fixture.data;
}
if(command==='media.open'||command==='media.openSaved'){
 const url=command==='media.open'?payload.url:window.__dl.find(x=>x.id===payload.id)?.url;
 if(url!=='/__preview/course-notice.pdf')throw new Error('演示附件不存在');
 const {openPdfPreview}=await import('/__preview/pdf-preview.js');await openPdfPreview(url,'课程安排.pdf');return true;
}
if(command==='media.download'){const link=document.createElement('a');link.href=payload.url;link.download='课程安排.pdf';link.click();const e={id:'dl-'+(window.__dl.length+1),name:'课程安排.pdf',url:payload.url,mime:'application/pdf',size:${pdfSize},savedAt:Date.now()};window.__dl=window.__dl.filter(x=>x.url!==e.url).concat(e);return e;}
if(command==='media.downloads')return window.__dl;
if(command==='media.delete'){const n=window.__dl.length;window.__dl=window.__dl.filter(x=>x.id!==payload.id);return window.__dl.length<n;}
if(command==='media.saveImage')return true;
return true;}};
window.__dl=new URLSearchParams(location.search).get('dl')==='1'?[{id:'dl-0',name:'课程安排.pdf',url:'/__preview/course-notice.pdf',mime:'application/pdf',size:${pdfSize},savedAt:Date.parse('2026-10-03T10:30:00+08:00')}]:[];
window.TencentCaptcha=class{constructor(id,cb){this.cb=cb;}show(){this.cb({ret:0,ticket:'fixture',randstr:'fixture'});}};
const browserFetch=window.fetch.bind(window);
window.fetch=async(url,init={})=>{if(new URL(url,location.href).pathname.startsWith('/__preview/'))return browserFetch(url,init);const p=new URL(url,location.href).pathname;window.previewRequests??=[];window.previewRequests.push({path:p,method:init.method||'GET'});if(p==='/pc/web_login'&&window.previewAuthHold)await new Promise((resolve,reject)=>{window.previewReleaseAuth=resolve;init.signal.addEventListener('abort',()=>reject(new DOMException('cancelled','AbortError')),{once:true});});let value={success:true,status_code:200};if(p.endsWith('verify_pwd_login/')){const code=JSON.parse(init.body).pwd;if(code==='000000')value={success:false,msg:'验证码不正确或已过期'};}
if(p.includes('/cards/detlist/')){
 if(window.previewCoursewareWait)await new Promise((resolve,reject)=>{window.previewReleaseCourseware=resolve;init.signal?.addEventListener('abort',()=>reject(new DOMException('cancelled','AbortError')),{once:true});});
 if(new URLSearchParams(location.search).get('fixture')==='real')return browserFetch('/__preview/courseware-detail.json',{signal:init.signal});
 value=window.previewCoursewareFail?{errcode:12,errmsg:'课件读取失败，请重试'}:{errcode:0,errmsg:'Success',data:{Title:'学习共享课指南',Width:960,Height:540,Slides:[1,2,3].map(n=>({PageIndex:n,Cover:window.previewImageFail&&n===1?'/__preview/missing-slide.svg':'/__preview/courseware-page-'+n+'.svg'}))}};
}
return {ok:true,status:200,url:location.href,json:async()=>value,text:async()=>JSON.stringify(value)};};
window.__errors=[];window.addEventListener('error',e=>__errors.push(e.message));window.addEventListener('unhandledrejection',e=>__errors.push(String(e.reason)));
</script>`;}
http.createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,'http://127.0.0.1');
  if(u.pathname==='/__preview/courseware-detail.json'&&coursewareFixture){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(coursewareFixture);return;}
  if(/^\/__preview\/courseware-page-[123]\.svg$/.test(u.pathname)){
   const page=Number(u.pathname.match(/-(\d)\.svg$/)[1]);
   const headings=['新学期学习共享课指南','选择课程并开始预习','学习任务与进度'];
   const lines=[['01 了解课程安排与学习要求','02 选择对应的学习共享课','03 按时完成预习和课后练习'],['进入对应课程，查看老师发布的材料','按页阅读课件；需要时放大查看细节','课件和作业统一归入待完成清单'],['有截止时间的任务，会显示完整日期','未设置截止的课件，保持无截止状态','已完成进度由雨课堂官方接口同步']][page-1];
   res.writeHead(200,{'Content-Type':'image/svg+xml','Cache-Control':'no-store'});
   res.end('<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><rect width="960" height="540" fill="#f5fbf2"/><rect width="960" height="12" fill="#356b41"/><text x="56" y="82" font-size="22" fill="#356b41">课简 · 课件预览演示</text><text x="56" y="155" font-size="38" font-weight="600" fill="#181d18">'+headings[page-1]+'</text>'+lines.map((line,i)=>'<rect x="56" y="'+(200+i*78)+'" width="848" height="60" rx="16" fill="#e3eee3"/><text x="80" y="'+(240+i*78)+'" font-size="26" fill="#304935">'+line+'</text>').join('')+'<text x="856" y="505" font-size="22" fill="#566b5f">'+page+' / 3</text></svg>');return;
  }
  if(u.pathname==='/__preview/avatar.svg'){
   res.writeHead(200,{'Content-Type':'image/svg+xml','Cache-Control':'no-store'});
   res.end('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="#cbe7dc"/><circle cx="48" cy="36" r="16" fill="#27684f"/><path d="M16 96v-8a32 32 0 0 1 64 0v8" fill="#27684f"/><circle cx="77" cy="19" r="7" fill="#e59b46"/></svg>');return;
  }
  if(u.pathname==='/'){
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
   res.end('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>雨课堂组件预览</title><style>html,body,#preview-pages{margin:0;width:100%;height:100%;overflow:hidden;background:#f4f8f4}.preview-page{position:absolute;inset:0;border:0;width:100%;height:100%;visibility:hidden}#preview-pages[aria-busy=true]{pointer-events:none}#preview-error{position:fixed;bottom:8px;left:16px;color:#b3261e}</style></head><body><main id="preview-pages"></main><p id="preview-error" role="alert"></p><script type="module" src="/__preview/page-preview.js"></script></body></html>');return;
  }
  let file,type;
  if(u.pathname==='/main.js'){file=path.join(root,'main.js');type='application/javascript';}
  else if(u.pathname==='/__preview/course-notice.pdf'){file=path.join(root,'../../scripts/fixtures/course-notice.pdf');type='application/pdf';}
  else if(['/__preview/pdf-preview.js','/__preview/pdf-preview.css','/__preview/page-preview.js'].includes(u.pathname)){file=path.join(root,'../../scripts',path.basename(u.pathname));type=u.pathname.endsWith('.js')?'application/javascript':'text/css';}
  else if(u.pathname.startsWith('/__preview/pdfjs/')){
   const dir=path.resolve(root,'../../node_modules/pdfjs-dist');file=path.resolve(dir,decodeURIComponent(u.pathname.slice('/__preview/pdfjs/'.length)));if(!file.startsWith(dir+path.sep))throw Error();
   type=file.endsWith('.mjs')?'application/javascript':file.endsWith('.wasm')?'application/wasm':'application/octet-stream';
  }else{
   const name=path.basename(u.pathname==='/'?'feed.html':u.pathname);if(!/^[\w.-]+$/.test(name))throw Error();
   file=path.join(root,'ui',name);type=name.endsWith('.html')?'text/html':name.endsWith('.js')?'application/javascript':'text/css';
  }
  let body=await fs.readFile(file);
  if(type==='text/html'){const native=u.searchParams.get('native')==='1'?'<script>'+await fs.readFile(path.join(root,'../../scripts/native-session-preview.js'),'utf8')+'</script>':'';body=body.toString().replace('<head>','<head><link rel="stylesheet" href="/__preview/pdf-preview.css">'+script(u.searchParams)+native);}
  res.writeHead(200,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store'});res.end(body);
 }catch{res.writeHead(404);res.end();}
}).listen(Number(process.env.YKT_PREVIEW_PORT)||8766,'127.0.0.1',()=>console.log(`Component fixture preview: http://127.0.0.1:${Number(process.env.YKT_PREVIEW_PORT)||8766}`));
