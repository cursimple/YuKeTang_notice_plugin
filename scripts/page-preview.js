// Local route harness; component HTML and state remain inside their own documents.
const deck=document.querySelector('#preview-pages'),frames=new Map();
let current='feed',busy=false;
const order=['feed'];
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
function frameFor(page){
 if(frames.has(page))return frames.get(page);
 const frame=document.createElement('iframe');frame.title={feed:'雨课堂',settings:'雨课堂设置',login:'雨课堂登录'}[page];frame.src=page+'.html';frame.className='preview-page';frame.inert=true;
 const ready=new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>reject(new Error('页面加载超时')),10000);
  frame.onload=()=>{clearTimeout(timeout);requestAnimationFrame(()=>requestAnimationFrame(resolve));};
  frame.onerror=()=>{clearTimeout(timeout);reject(new Error('页面加载失败'));};
 });
 deck.append(frame);const result={frame,ready};frames.set(page,result);return result;
}
async function navigate(page,back=false){
 if(!['feed','settings','login'].includes(page)||busy||page===current)return;
 busy=true;deck.setAttribute('aria-busy','true');
 const source=frames.get(current).frame,{frame,ready}=frameFor(page);
 try{
  await ready;
  const context=source.contentWindow.CurSimpleComponent.state.context;
  Object.assign(frame.contentWindow.CurSimpleComponent.state.context,{theme:context.theme,fontScale:context.fontScale});
  frame.contentWindow.restorePreviewPreferences?.();frame.contentWindow.push?.();
  source.inert=true;frame.style.visibility='visible';frame.style.zIndex='1';
  const options={duration:reduced()?0:240,easing:'cubic-bezier(.4,0,.2,1)'},direction=back?-1:1;
  const animations=[frame.animate([{opacity:0,transform:`translateX(${direction*8}%)`},{opacity:1,transform:'translateX(0)'}],options),source.animate([{opacity:1,transform:'translateX(0)'},{opacity:.65,transform:`translateX(${-direction*8}%)`}],options)];
  await Promise.all(animations.map(x=>x.finished));
  source.style.visibility='hidden';frame.style.zIndex='0';frame.inert=false;
  current=page;if(back)order.splice(order.indexOf(page)+1);else order.push(page);
  animations.forEach(x=>x.cancel());
 }catch(error){document.querySelector('#preview-error').textContent=error.message;source.inert=false;}
 finally{busy=false;deck.removeAttribute('aria-busy');}
}
window.addEventListener('message',event=>{
 if(event.origin!==location.origin||event.source!==frames.get(current)?.frame.contentWindow||event.data?.type!=='component-preview-route')return;
 const target=event.data.page==='back'?(order.at(-2)||'feed'):event.data.page;
 navigate(target,order.includes(target));
});
const first=frameFor('feed');first.ready.then(()=>{first.frame.style.visibility='visible';first.frame.inert=false;});
