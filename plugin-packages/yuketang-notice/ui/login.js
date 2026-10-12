import {RainLoginClient, CAPTCHA_APP_ID} from './auth.js';
import {sessionFetch} from './session-network.js';
import {savedLoginNavigation} from './login-navigation.js';
import {sdk, esc, icon, pickerSheet} from './shared.js';
const $=id=>document.getElementById(id);
const siteSpec=sdk.state.manifest.extension.settings.find(x=>x.key==='site');
let site=sdk.state.data.settings.site || siteSpec.default;
const makeClient=()=>new RainLoginClient({site,fetch:sessionFetch(sdk,window.fetch.bind(window)),cookie:name=>sdk.request('web.cookie',{name})});
let client=makeClient(),generation=0,busy=false,cooldownUntil=0,submitted=false,verified=false,completion=null;
let routeVisible=true;
const navigation=savedLoginNavigation({request:(command,payload)=>sdk.request(command,payload),
 canNavigate:()=>routeVisible&&!document.hidden,onError:error=>{
  failure(new Error(`账号已保存，但课堂页面未打开：${error.message||'请点击「查看我的课堂」重试'}`));
  $('retry-session').hidden=true;
 }});
$('back').innerHTML=icon('back');
$('copy-error').innerHTML=icon('copy');
$('error').insertAdjacentHTML('afterbegin',icon('alert'));
$('hero-orb').innerHTML=icon('book');
$('privacy-icon').outerHTML=icon('shield');
const siteLabel=()=>siteSpec.options.find(x=>x.value===site)?.label||site;
function renderSitePicker(){
 $('site-picker').innerHTML=`<button class="nav-row" id="site" type="button">${icon('globe')}<span class="row-copy"><small>学校站点</small><span>${esc(siteLabel())}</span></span><span class="value">切换</span><span class="chevron">${icon('next')}</span></button>`;
 $('site').onclick=()=>{document.activeElement?.blur();pickerSheet('学校站点',siteSpec.options.map(x=>({value:x.value,label:x.label})),site,value=>switchSite(value),'和学校使用的雨课堂保持一致；切换后需要重新获取验证码');};
}
async function switchSite(value){
 if(busy||verified||value===site)return;
 generation++;client.cancel();
 await task(async()=>{
  await sdk.request('settings.update',{site:value});
  site=value;client=makeClient();cooldownUntil=0;submitted=false;$('code').value='';
  renderSitePicker();status('站点已切换，请重新获取验证码');
 });
}
renderSitePicker();
function status(text,loading=false){const el=$('status');el.hidden=!text;el.innerHTML=(loading?'<span class="spinner"></span>':icon('info'))+`<span>${esc(text)}</span>`;}
// Report the failed login stage with recovery guidance and a retry action.
function failure(error){const raw=error?.message||String(error||'');let hint='';
 if(/超时|timeout/i.test(raw))hint='可能是网络较慢或校园网限制，检查网络后重试';
 else if(/网络|fetch|Failed/i.test(raw))hint='检查网络连接，或换一个雨课堂站点';
 else if(/验证码/.test(raw))hint='检查验证码是否正确、是否已过期，可重新获取';
 else if(/安全验证/.test(raw))hint='短信发送前必须完成官方安全验证';
 else if(/站点/.test(raw))hint='确认站点和学校一致后重试';
 else if(/过期/.test(raw))hint='重新获取短信验证码';
 $('error-text').textContent=[raw,hint?`（${hint}）`:''].filter(Boolean).join(' ');
 $('error').hidden=false;
 $('retry-session').hidden=!submitted;
 $('back-to-settings').hidden=false;$('back-to-settings').parentElement.hidden=false;
 status('');
}
function clearError(){$('error').hidden=true;$('retry-session').hidden=true;$('back-to-settings').hidden=true;$('back-to-settings').parentElement.hidden=true;}
function controls(){
 if(verified)return;
 const locked=busy;
 const remaining=Math.max(0,Math.ceil((cooldownUntil-Date.now())/1000));
 $('send').disabled=locked||remaining>0;$('send').classList.toggle('cooling',remaining>0);$('send').textContent=remaining?`${remaining} 秒后重发`:'获取验证码';
 $('verify').disabled=locked;$('verify').innerHTML=busy?'<span class="spinner"></span> 正在处理':'登录并连接';
 $('mobile').disabled=locked;$('code').disabled=locked;
 const siteButton=$('site');if(siteButton)siteButton.disabled=locked;
 $('retry-session').disabled=locked;
}
async function task(fn){if(busy||verified)return;const stamp=generation;busy=true;clearError();controls();try{await fn();}catch(e){if(stamp===generation&&e.name!=='AbortError')failure(e);}finally{if(stamp===generation){busy=false;controls();}}}
function captcha(){return new Promise((resolve,reject)=>{
 let settled=false;const end=(e,result)=>{if(settled)return;settled=true;clearTimeout(timeout);e?reject(e):resolve(result);};
 const timeout=setTimeout(()=>end(new Error('安全验证等待超时，请重新获取验证码')),120000);
 function show(){try{const widget=new window.TencentCaptcha(CAPTCHA_APP_ID,r=>r.ret===0&&r.ticket&&r.randstr?end(null,{ticket:r.ticket,randstr:r.randstr}):end(new Error('安全验证已取消，未发送短信')),{userLanguage:'zh-cn'});widget.show();}catch(e){end(e);}}
 if(window.TencentCaptcha)return show();
 const script=document.createElement('script');script.src='https://turing.captcha.qcloud.com/TCaptcha.js';script.onload=show;script.onerror=()=>end(new Error('安全验证加载失败，请检查网络后重试'));document.head.append(script);
});}
async function completed(stamp=generation){
 if(verified||stamp!==generation)return;
 if(completion)return completion;
 const pending=completeAccount(stamp);completion=pending;
 try{return await pending;}finally{if(completion===pending)completion=null;}
}
async function completeAccount(stamp){
 status('验证码已通过，正在校验并保存账号…',true);
 let result;
 try{result=await sdk.request('login.check',{navigate:false});}
 catch(e){if(stamp===generation)status('');throw e;}
 if(stamp!==generation)return;
 if(result?.loginState!=='logged_in'){
  const why=result?.lastError||'雨课堂没有确认这次登录';
  status('');
  throw new Error(`登录未被确认：${why}`);
 }
 showSavedAccount(result);
 requestAnimationFrame(()=>navigation.saved());
}
function showSavedAccount(result){
 document.activeElement?.blur();
 verified=true;client.cancel();clearError();status('');
 $('login-card').innerHTML=`<div class="success-state"><div class="orb">${icon('check')}</div><h2>连接成功</h2><p>${esc(result.account?.name||'你的账号')}，欢迎回来</p><button class="primary" id="open-feed">${icon('calendar')}查看我的课堂</button><button class="secondary" id="open-settings">调整通知与显示设置</button></div>`;
 if($('site'))$('site').disabled=true;$('privacy-text').textContent='账号已保存，正在进入我的课堂。';
 $('open-feed').onclick=()=>navigation.retry();$('open-settings').onclick=()=>sdk.request('ui.settings').catch(failure);
}
$('back').onclick=()=>{generation++;client.cancel();busy=false;sdk.request('ui.close').catch(failure);};
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
/**
 * Adjust the fixed login page to the actual keyboard height, keeping fields and submission
 * visible.
 */
const page=$('app');
let liftTimer=0;
function lift(){
 const el=document.activeElement;
 if(!el||el.tagName!=='INPUT'||verified){page.style.transform='';return;}
 // Subtract the current animated translation when recovering base element bounds.
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
// Large text and recovery actions can scroll inside the fixed login viewport.
document.addEventListener('touchmove',e=>{if(!e.target.closest?.('.sheet-body,.lightbox,.login-page'))e.preventDefault();},{passive:false});
const timer=setInterval(controls,1000);
function stopLogin(){generation++;client.cancel();busy=false;controls();}
window.addEventListener('pagehide',()=>{routeVisible=false;stopLogin();navigation.close();clearInterval(timer);});
window.addEventListener('cursimple-visibility',event=>{
 routeVisible=event.detail?.visible!==false;
 if(!routeVisible)stopLogin();else if(verified)navigation.resume();
});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&verified)navigation.resume();});
// A saved host session remains valid when this document is reopened after returning to the app.
sdk.subscribe(state=>{
 if(!verified&&!busy&&!completion&&state.data?.loginState==='logged_in'){
  showSavedAccount(state.data);requestAnimationFrame(()=>navigation.saved());
 }
});
