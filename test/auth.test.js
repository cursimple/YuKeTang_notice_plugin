import test from 'node:test';
import assert from 'node:assert/strict';
import {RainLoginClient,requireSuccess} from '../plugin-packages/yuketang-notice/ui/auth.js';
const response=value=>({ok:true,status:200,json:async()=>value});
const make=(fetch,now=()=>1000)=>new RainLoginClient({site:'changjiang.yuketang.cn',fetch,cookie:async()=> 'test-cookie',now});
test('Web 协议按 success 判定成功，不误拒绝附带状态码的响应',()=>{requireSuccess({success:true,status_code:200},true,'失败');assert.throws(()=>requireSuccess({success:false,msg:'验证码错误'},true,'失败'),/验证码错误/);});
test('短信发码和验证使用同一手机号和网页协议',async()=>{const calls=[];const c=make(async(url,init)=>{calls.push({url,init});return response({success:true,status_code:200});});await c.sendSms('13800138000',{ticket:'proof',randstr:'random'});await c.loginSms('123456');assert.equal(calls.length,3);const r=calls.at(-1);assert.ok(r.url.endsWith('/pc/login/verify_pwd_login/'));assert.deepEqual(JSON.parse(r.init.body),{type:'PC',name:'13800138000',pwd:'123456'});assert.equal(r.init.credentials,'include');assert.equal(r.init.headers['X-CSRFToken'],'test-cookie');});
test('未获取验证码时阻止提交，不产生网络请求',async()=>{const c=make(()=>{throw Error('不应请求');});await assert.rejects(c.loginSms('123456'),/先获取/);});
test('空安全验证票据不能发短信',async()=>{const c=make(()=>{throw Error('不应请求');});await assert.rejects(c.sendSms('13800138000',{ticket:'',randstr:''}),/安全验证/);});
test('服务器的验证码错误返回给页面',async()=>{const c=make(async()=>response({success:false,msg:'验证码不正确或已过期'}));c.mobileForCode='13800138000';await assert.rejects(c.loginSms('000000'),/验证码不正确或已过期/);assert.equal(c.mobileForCode,'13800138000');});
test('普通网络请求超时提供可重试信息',async()=>{const c=make((url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')))));await assert.rejects(c.request('/test',null,{timeoutMs:5}),/请求超时/);assert.equal(c.calls.size,0);});
test('切换页面取消旧请求，不伪装成登录失败',async()=>{const c=make((url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')))));const pending=c.request('/test');await new Promise(r=>setTimeout(r,0));c.cancel();await assert.rejects(pending,{name:'AbortError'});});
test('二维码有效期按服务端值计算',async()=>{const c=make(async()=>response({code:0,data:{qrContent:'https://mp.weixin.qq.com/example',token:'test',expire_seconds:60}}));const q=await c.createQr();assert.equal(q.expiresAt,61000);});
test('服务端没给 expire_seconds 时按 60 秒，而不是 180 秒',async()=>{
 // Use the conservative QR lifetime when expiry metadata is absent.
 const c=make(async()=>response({code:0,data:{qrContent:'https://changjiang.yuketang.cn/api/v3/user/login/app-web-qr?u=x',token:'jwt'}}));
 const q=await c.createQr();assert.equal(q.expiresAt,61000);
});
test('二维码确认后建立网页会话',async()=>{
 const calls=[];
 const c=make(async(url,init)=>{calls.push({url,init});
  return response(url.endsWith('/pc/web_login')?{success:true}:{code:0,data:{UserID:123,Auth:'fake'}});});
 await c.confirmQr({token:'token',expiresAt:999999});
 const last=calls.at(-1);
 assert.ok(last.url.endsWith('/pc/web_login'));
 assert.deepEqual(JSON.parse(last.init.body),{UserID:123,Auth:'fake'});
});
test('token 失效时换一张码继续等，而不是报「HTTP 400」',async()=>{
 // Expired confirmation tokens trigger QR recovery rather than generic HTTP failure.
 let issued=0,confirmed=false;
 const c=make(async(url)=>{
  if(url.includes('app-web-pre-info')){issued++;return response({code:0,data:{qrContent:'https://changjiang.yuketang.cn/api/v3/user/login/app-web-qr?u='+issued,token:'t'+issued}});}
  if(url.includes('app-web-login')){
   if(!confirmed){confirmed=true;const e=new Error('雨课堂登录请求失败（HTTP 400）');throw e;}
   return response({code:0,data:{UserID:1,Auth:'a'}});
  }
  return response({success:true});
 });
 const rotations=[];
 const q=await c.createQr();
 await c.confirmQr(q,{onRotate:next=>rotations.push(next)});
 assert.equal(rotations.length,1,'token 失效后必须换新码');
 assert.equal(issued,2);
});
test('连续取不到扫码确认时报可重试的错误，而不是静默挂着',async()=>{
 const c=make(async(url)=>{
  if(url.includes('app-web-pre-info'))return response({code:0,data:{qrContent:'https://changjiang.yuketang.cn/api/v3/user/login/app-web-qr?u=x',token:'t'}});
  return response({code:0,data:null});
 });
 await assert.rejects(c.confirmQr({token:'t',expiresAt:999999}),/未收到扫码确认/);
});
test('二维码地址越界被拒绝',async()=>{const c=make(async()=>response({code:0,data:{qrContent:'https://example.invalid/qr',token:'fake'}}));await assert.rejects(c.createQr(),/二维码地址无效/);});


test('WS 请求体是学堂在线协议的 requestlogin',()=>{
 assert.deepEqual(JSON.parse(RainLoginClient.qrRequest()),{op:'requestlogin',role:'web',version:1.4,type:'qrcode',from:'web'});
});

test('解析 WS 推来的二维码消息，取 60 秒有效期',()=>{
 const m=RainLoginClient.parseQrMessage(JSON.stringify({op:'requestlogin',ticket:'https://mp.weixin.qq.com/cgi-bin/showqrcode?ticket=x',qrcode:'http://weixin.qq.com/q/02WumxUdCc92',expire_seconds:60}));
 // Encode scan text, never the QR image URL.
 assert.deepEqual(m,{type:'qr',content:'http://weixin.qq.com/q/02WumxUdCc92',seconds:60});
});
test('WS 只给了 ticket 时不该拿它当扫码文本',()=>{
 const m=RainLoginClient.parseQrMessage(JSON.stringify({op:'requestlogin',ticket:'https://mp.weixin.qq.com/cgi-bin/showqrcode?ticket=x',expire_seconds:60}));
 assert.ok(m.content.includes('mp.weixin.qq.com'),'没有 qrcode 字段时才退回 ticket');
});
test('解析 WS 推来的扫码成功消息',()=>{
 const m=RainLoginClient.parseQrMessage(JSON.stringify({op:'loginsuccess',UserID:7,Auth:'auth-token'}));
 assert.deepEqual(m,{type:'success',userId:7,auth:'auth-token'});
});
test('WS 上无关 / 坏掉的消息不误判',()=>{
 assert.equal(RainLoginClient.parseQrMessage('not json'),null);
 assert.equal(RainLoginClient.parseQrMessage(JSON.stringify({op:'ping'})),null);
 assert.equal(RainLoginClient.parseQrMessage(JSON.stringify({op:'loginsuccess'})),null,'缺凭据不算成功');
});
test('WS 地址按当前站点拼，路径是 /wsapp/',()=>{
 const c=make(async()=>response({}));
 assert.equal(c.qrSocketUrl(),'wss://changjiang.yuketang.cn/wsapp/');
});

test('建立会话失败（没有 sessionid）要报错，不能假装登上了',async()=>{
 const c=new RainLoginClient({site:'changjiang.yuketang.cn',fetch:async()=>response({success:true}),cookie:async()=>'',now:()=>1000});
 await assert.rejects(c.establishSession(1,'a'),/未能建立网页登录会话/);
});

test('HTTP 400 的错误信息带出服务端 msg，方便定位',async()=>{
 const c=make(async()=>({ok:false,status:400,text:async()=>JSON.stringify({code:50400,msg:'BAD_REQUEST'})}));
 await assert.rejects(c.request('/x'),/HTTP 400/);
 const c2=make(async()=>({ok:false,status:500,text:async()=>JSON.stringify({msg:'服务器开小差了'})}));
 await assert.rejects(c2.request('/x'),/服务器开小差了/);
});
