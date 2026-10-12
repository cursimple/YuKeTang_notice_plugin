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
test('HTTP 400 的错误信息带出服务端 msg，方便定位',async()=>{
 const c=make(async()=>({ok:false,status:400,text:async()=>JSON.stringify({code:50400,msg:'BAD_REQUEST'})}));
 await assert.rejects(c.request('/x'),/HTTP 400/);
 const c2=make(async()=>({ok:false,status:500,text:async()=>JSON.stringify({msg:'服务器开小差了'})}));
 await assert.rejects(c2.request('/x'),/服务器开小差了/);
});
