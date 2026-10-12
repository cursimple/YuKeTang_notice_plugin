import test from 'node:test';
import assert from 'node:assert/strict';
import {sessionFetch} from '../plugin-packages/yuketang-notice/ui/session-network.js';
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
test('原生会话响应支持 JSON、空正文与 HTTP 204',async()=>{
 const calls=[], sdk={capabilities:{sessionFetch:true},request:async(c,p)=>{calls.push([c,p]);return {status:p.url.endsWith('empty')?204:200,body:'{"ok":true}',contentType:'application/json'};}};
 const fetch=sessionFetch(sdk);assert.deepEqual(await (await fetch('https://login.example/json')).json(),{ok:true});
 assert.equal((await fetch('https://login.example/empty')).status,204);
 assert.equal(calls[0][0],'network.session.fetch');assert.notEqual(calls[0][1].requestId,calls[1][1].requestId);
});
test('取消原生 HTTP 请求会传到宿主，迟到响应不恢复旧登录',async()=>{
 let release;const calls=[];
 const sdk={capabilities:{sessionFetch:true},request:(c,p)=>{calls.push([c,p]);return c==='network.session.fetch'?new Promise(r=>release=r):Promise.resolve(true);}};
 const controller=new AbortController();const request=sessionFetch(sdk)('https://login.example/session',{signal:controller.signal});
 controller.abort();await assert.rejects(request,{name:'AbortError'});release({status:200,body:'late'});await flush();
 assert.equal(calls[1][0],'network.session.cancel');assert.equal(calls[0][1].requestId,calls[1][1].requestId);
});
