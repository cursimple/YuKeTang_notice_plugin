import {RainLoginClient, CAPTCHA_APP_ID} from './auth.js';
import {sdk, esc, icon, pickerSheet} from './shared.js';
const $=id=>document.getElementById(id);
const siteSpec=sdk.state.manifest.extension.settings.find(x=>x.key==='site');
let site=sdk.state.data.settings.site || siteSpec.default;
const makeClient=()=>new RainLoginClient({site,fetch:window.fetch.bind(window),cookie:name=>sdk.request('web.cookie',{name})});
let client=makeClient(),mode='phone',generation=0,busy=false,cooldownUntil=0,qrExpiry=0,qrTotal=0,submitted=false,verified=false;
$('back').innerHTML=icon('back');
$('refresh').innerHTML=icon('refresh');
$('copy-error').innerHTML=icon('copy');
$('error').insertAdjacentHTML('afterbegin',icon('alert'));
$('hero-orb').innerHTML=icon('book');
$('privacy-icon').outerHTML=icon('shield');
/** 登录方式页签的滑块：首次静默定位，之后跟着切换滑过去 */
function placeThumb(animate){
 const tabs=document.querySelector('.tabs'),thumb=tabs?.querySelector('.seg-thumb'),cur=tabs?.querySelector('[aria-selected="true"]');
 if(!thumb||!cur)return;
 if(!animate)thumb.style.transition='none';
 thumb.style.width=`${cur.offsetWidth}px`;thumb.style.transform=`translateX(${cur.offsetLeft}px)`;
 if(!animate){void thumb.offsetWidth;thumb.style.transition='';}
}
requestAnimationFrame(()=>placeThumb(false));
window.addEventListener('resize',()=>placeThumb(false));
// 站点：一行显示当前站点，点开从底部弹出选择；不在页面里展开，页面高度不变
const siteLabel=()=>siteSpec.options.find(x=>x.value===site)?.label||site;
function renderSitePicker(){
 $('site-picker').innerHTML=`<button class="nav-row" id="site" type="button">${icon('globe')}<span class="row-copy"><small>学校站点</small><span>${esc(siteLabel())}</span></span><span class="value">切换</span><span class="chevron">${icon('next')}</span></button>`;
 $('site').onclick=()=>{document.activeElement?.blur();pickerSheet('学校站点',siteSpec.options.map(x=>({value:x.value,label:x.label})),site,value=>switchSite(value),'和学校使用的雨课堂保持一致；切换后需要重新获取验证码');};
}
async function switchSite(value){
 if(busy||verified||value===site)return;
 generation++;qrExpiry=0;client.cancel();
 await task(async()=>{
  await sdk.request('settings.update',{site:value});
  site=value;client=makeClient();cooldownUntil=0;submitted=false;$('code').value='';
  renderSitePicker();status('站点已切换，请重新获取验证码');
 });
}
renderSitePicker();
function status(text,loading=false){const el=$('status');el.hidden=!text;el.innerHTML=(loading?'<span class="spinner"></span>':icon('info'))+`<span>${esc(text)}</span>`;}
// 登录失败必须说清是哪一步、下一步做什么，并提供重试入口；之前只弹一句、也不给重试，用户看不到结果
function failure(error,next='请在下方重试'){const raw=error?.message||String(error||'');let hint='';
 if(/超时|timeout/i.test(raw))hint='可能是网络较慢或校园网限制，检查网络后重试';
 else if(/网络|fetch|Failed/i.test(raw))hint='检查网络连接，或换一个雨课堂站点';
 else if(/验证码/.test(raw))hint='检查验证码是否正确、是否已过期，可重新获取';
 else if(/安全验证/.test(raw))hint='短信发送前必须完成官方安全验证';
 else if(/站点/.test(raw))hint='确认站点和学校一致后重试';
 else if(/过期/.test(raw))hint='重新获取验证码或刷新二维码';
 $('error-text').textContent=[raw,hint?`（${hint}）`:''].filter(Boolean).join(' ');
 $('error').hidden=false;
 $('retry-session').hidden=!submitted;
 $('back-to-settings').hidden=false;$('back-to-settings').parentElement.hidden=false;
 status('');
}
function clearError(){$('error').hidden=true;$('retry-session').hidden=true;$('back-to-settings').hidden=true;$('back-to-settings').parentElement.hidden=true;}
function controls(){
 if(verified)return;
 const remaining=Math.max(0,Math.ceil((cooldownUntil-Date.now())/1000));
 $('send').disabled=busy||remaining>0;$('send').classList.toggle('cooling',remaining>0);$('send').textContent=remaining?`${remaining} 秒后重发`:'获取验证码';
 $('verify').disabled=busy;$('verify').innerHTML=busy?'<span class="spinner"></span> 正在处理':'登录并连接';
 $('mobile').disabled=busy;$('code').disabled=busy;
 const siteButton=$('site');if(siteButton)siteButton.disabled=busy;
 $('phone-tab').disabled=busy;$('qr-tab').disabled=busy;$('retry-session').disabled=busy;
}
async function task(fn){if(busy||verified)return;busy=true;clearError();controls();try{await fn();}catch(e){if(e.name!=='AbortError')failure(e);}finally{busy=false;controls();}}
function captcha(){return new Promise((resolve,reject)=>{
 let settled=false;const end=(e,result)=>{if(settled)return;settled=true;clearTimeout(timeout);e?reject(e):resolve(result);};
 const timeout=setTimeout(()=>end(new Error('安全验证等待超时，请重新获取验证码')),120000);
 function show(){try{const widget=new window.TencentCaptcha(CAPTCHA_APP_ID,r=>r.ret===0&&r.ticket&&r.randstr?end(null,{ticket:r.ticket,randstr:r.randstr}):end(new Error('安全验证已取消，未发送短信')),{userLanguage:'zh-cn'});widget.show();}catch(e){end(e);}}
 if(window.TencentCaptcha)return show();
 const script=document.createElement('script');script.src='https://turing.captcha.qcloud.com/TCaptcha.js';script.onload=show;script.onerror=()=>end(new Error('安全验证加载失败，请检查网络后重试'));document.head.append(script);
});}
async function completed(stamp=generation){
 status(mode==='qr'?'扫码已确认，正在校验并保存账号…':'验证码已通过，正在校验并保存账号…',true);
 let result;
 try{result=await sdk.request('login.check',{navigate:false});}
 catch(e){if(stamp===generation)status('');throw e;}
 if(stamp!==generation)return;
 if(result?.loginState!=='logged_in'){
  const why=result?.lastError||'雨课堂没有确认这次登录';
  status('');
  throw new Error(`登录未被确认：${why}`);
 }
 document.activeElement?.blur();
 verified=true;qrExpiry=0;client.cancel();clearError();status('');
 $('login-card').innerHTML=`<div class="success-state"><div class="orb">${icon('check')}</div><h2>连接成功</h2><p>${esc(result.account?.name||'你的账号')}，欢迎回来</p><button class="primary" id="open-feed">${icon('calendar')}查看我的课堂</button><button class="secondary" id="open-settings">调整通知与显示设置</button></div>`;
 if($('site'))$('site').disabled=true;$('privacy-text').textContent='账号已保存，课简正在后台同步课堂内容。';
 $('open-feed').onclick=()=>sdk.request('ui.feed').catch(failure);$('open-settings').onclick=()=>sdk.request('ui.settings').catch(failure);
}
$('back').onclick=()=>{generation++;client.cancel();sdk.request('ui.close').catch(failure);};
$('send').onclick=()=>task(async()=>{
 if(cooldownUntil>Date.now())return;
 const mobile=$('mobile').value.trim(),stamp=generation;submitted=false;
 if(!/^1\d{10}$/.test(mobile))throw new Error('请输入正确的 11 位手机号');
 status('请完成官方安全验证',true);const proof=await captcha();if(stamp!==generation)return;
 status('正在发送短信验证码…',true);await client.sendSms(mobile,proof);
 cooldownUntil=Date.now()+60000;status(`验证码已发送至 ${mobile.slice(0,3)} ${'*'.repeat(4)} ${mobile.slice(-4)}`);$('code').focus();
});
$('phone-panel').onsubmit=e=>{e.preventDefault();task(async()=>{
 if(client.mobileForCode!==$('mobile').value.trim())throw new Error('请先为当前手机号获取验证码');
 const stamp=generation;status('正在提交验证码…',true);await client.loginSms($('code').value.trim());submitted=true;
 if(stamp===generation)await completed(stamp);
});};
$('retry-session').onclick=()=>task(()=>completed());
$('back-to-settings').onclick=()=>sdk.request('ui.settings').catch(failure);
$('copy-error').onclick=async()=>{const text=$('error-text').textContent;try{await navigator.clipboard.writeText(text);$('copy-error').innerHTML=icon('check');}catch{$('copy-error').innerHTML=icon('alert');}setTimeout(()=>$('copy-error').innerHTML=icon('copy'),1500);};
function expired(){
 if(mode!=='qr'||verified)return;generation++;qrExpiry=0;qrTotal=0;client.cancel();
 $('qr-area').innerHTML=`<div class="qr-expired">${icon('refresh')}<strong>二维码已失效</strong><button class="primary" id="renew">点击刷新</button></div>`;
 $('renew').onclick=refreshQr;$('qr-countdown').textContent='已过期';
 const timer=$('qr-timer');if(timer){timer.style.setProperty('--p','0');timer.hidden=true;}
 status('请刷新二维码后重新扫码');
}
function tick(){
 controls();
 const timer=$('qr-timer');
 if(qrExpiry&&mode==='qr'&&!verified){
  const remain=Math.max(0,qrExpiry-Date.now());
  const seconds=Math.ceil(remain/1000);
  $('qr-countdown').textContent=seconds?`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')} 后失效`:'已过期';
  if(timer){timer.hidden=false;timer.style.setProperty('--p',qrTotal?String(Math.max(0,Math.min(1,remain/qrTotal))):'1');}
  if(!seconds)expired();
 }else if(timer)timer.hidden=true;
}
/** 把二维码画出来，并记下到期时间 */
async function showQr(content,expiresAt,stamp){
 if(stamp!==generation||mode!=='qr')return false;
 const image=await sdk.request('qr.encode',{text:content});
 if(stamp!==generation||mode!=='qr')return false;
 qrExpiry=expiresAt;qrTotal=Math.max(1,expiresAt-Date.now());
 $('qr-area').innerHTML=`<img class="qr" alt="微信登录二维码" src="${esc(image)}">`;
 if($('refresh'))$('refresh').disabled=false;tick();status('等待微信扫码确认');
 return true;
}
/**
 * 扫码登录优先走 /wsapp/ 的学堂在线协议：二维码和「已扫码确认」是同一个连接推过来的，
 * 不用轮询、也不会有 token 过期导致的「扫了没反应」。连不上才退回 HTTPS 轮询。
 */
function qrOverSocket(stamp){
 return new Promise((resolve,reject)=>{
  const ws=new WebSocket(client.qrSocketUrl());
  let done=false;
  const finish=(error,value)=>{if(done)return;done=true;try{ws.close();}catch{}error?reject(error):resolve(value);};
  ws.onopen=()=>ws.send(RainLoginClient.qrRequest());
  ws.onmessage=async event=>{
   if(stamp!==generation||mode!=='qr')return finish(new DOMException('cancelled','AbortError'));
   const message=RainLoginClient.parseQrMessage(String(event.data));
   if(!message)return;
   if(message.type==='qr'){
    await showQr(message.content,Date.now()+message.seconds*1000,stamp);
    return;
   }
   if(message.type==='success'){
    status('扫码已确认，正在建立登录会话…',true);
    try{await client.establishSession(message.userId,message.auth);finish(null,true);}
    catch(e){finish(e);}
   }
  };
  ws.onerror=()=>finish(new Error('__ws_unavailable__'));
  ws.onclose=()=>{if(!done&&qrExpiry&&Date.now()<qrExpiry)finish(new Error('__ws_closed__'));};
  setTimeout(()=>finish(new Error('扫码等待超时，请刷新二维码重试')),5*60*1000);
 });
}
async function refreshQr(){
 if(verified||busy)return;const stamp=++generation;client.cancel();qrExpiry=0;clearError();$('qr-countdown').textContent='';$('refresh').disabled=true;
 $('qr-area').innerHTML='<span class="spinner"></span>';status('正在获取二维码…',true);
 try{
  try{
   await qrOverSocket(stamp);
   if(stamp!==generation||mode!=='qr')return;
   qrExpiry=0;submitted=true;await task(()=>completed(stamp));
   return;
  }catch(e){
   if(e.name==='AbortError')return;
   // WS 只在「连不上」时退回轮询；已经拿到码之后的失败要如实报出来
   if(!/^__ws_/.test(e.message||''))throw e;
  }
  const challenge=await client.createQr();if(stamp!==generation||mode!=='qr')return;
  await showQr(challenge.content,challenge.expiresAt,stamp);
  // 过期的码会自动换一张，界面上要跟着换
  await client.confirmQr(challenge,{onRotate:next=>{showQr(next.content,next.expiresAt,stamp);}});
  if(stamp!==generation||mode!=='qr')return;
  qrExpiry=0;submitted=true;await task(()=>completed(stamp));
 }catch(e){if(stamp===generation&&mode==='qr'&&e.name!=='AbortError'){qrExpiry=0;$('qr-area').innerHTML=`<div class="qr-expired">${icon('alert')}<strong>二维码获取失败</strong><button class="primary" id="renew">重新获取</button></div>`;$('renew').onclick=refreshQr;$('qr-countdown').textContent='';failure(e);}}
 finally{if(stamp===generation&&$('refresh'))$('refresh').disabled=false;}
}
function changeMode(next){if(busy||verified||mode===next)return;generation++;client.cancel();qrExpiry=0;mode=next;clearError();
 const show=$(next==='qr'?'qr-panel':'phone-panel');
 $('phone-panel').hidden=next!=='phone';$('qr-panel').hidden=next!=='qr';
 show.classList.remove('panel-in-r','panel-in-l');void show.offsetWidth;show.classList.add(next==='qr'?'panel-in-r':'panel-in-l');
 $('phone-tab').setAttribute('aria-selected',String(next==='phone'));$('qr-tab').setAttribute('aria-selected',String(next==='qr'));placeThumb(true);
 if(next==='qr')refreshQr();else status('');}
$('phone-tab').onclick=()=>changeMode('phone');$('qr-tab').onclick=()=>changeMode('qr');$('refresh').onclick=refreshQr;
/**
 * 登录页整页锁定不可拖动：点输入框时按键盘实际占掉的高度把整页往上抬，
 * 让输入框和「登录并连接」都露出来；收起键盘再落回去。
 */
const page=$('app');
let liftTimer=0;
function lift(){
 const el=document.activeElement;
 if(!el||el.tagName!=='INPUT'||verified){page.style.transform='';return;}
 // 过渡动画进行中时 getBoundingClientRect 带着动画里的位移，按此刻实际的平移量换算回原始位置
 const m=getComputedStyle(page).transform,current=m&&m!=='none'?-new DOMMatrix(m).m42:0;
 const vv=window.visualViewport,visible=vv?vv.height+vv.offsetTop:window.innerHeight;
 const target=!$('phone-panel').hidden&&$('verify')?$('verify'):el;
 const bottom=target.getBoundingClientRect().bottom+current,top=el.getBoundingClientRect().top+current;
 const need=Math.max(0,Math.min(bottom+16-visible,top-12));
 page.style.transform=need?`translateY(${-Math.round(need)}px)`:'';
}
const relift=()=>{clearTimeout(liftTimer);liftTimer=setTimeout(lift,60);};
document.addEventListener('focusin',relift);document.addEventListener('focusout',()=>setTimeout(lift,120));
window.visualViewport?.addEventListener('resize',relift);window.addEventListener('resize',relift);
// 只有弹层里的列表能滚，页面本身不跟手指走
document.addEventListener('touchmove',e=>{if(!e.target.closest?.('.sheet-body,.lightbox'))e.preventDefault();},{passive:false});
const timer=setInterval(tick,250);window.addEventListener('pagehide',()=>{generation++;client.cancel();clearInterval(timer);});
