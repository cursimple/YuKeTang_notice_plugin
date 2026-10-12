import test from 'node:test';
import assert from 'node:assert/strict';
import {savedLoginNavigation} from '../plugin-packages/yuketang-notice/ui/login-navigation.js';

test('saved login automatically enters feed and removes the login history entry',async()=>{
 const calls=[];const navigation=savedLoginNavigation({request:async(...args)=>{calls.push(args);return true;}});
 await navigation.saved();await navigation.resume();await navigation.saved();
 assert.deepEqual(calls,[['ui.feed',{replace:true}]]);assert.equal(navigation.completed,true);
});
test('confirmation while in WeChat waits for foreground, then enters without scanning again',async()=>{
 let visible=false;const calls=[];
 const navigation=savedLoginNavigation({canNavigate:()=>visible,request:async command=>{calls.push(command);return true;}});
 await navigation.saved();assert.equal(calls.length,0);
 visible=true;await navigation.resume();assert.deepEqual(calls,['ui.feed']);
});
test('an incoming login document retries navigation until the host transition finishes',async()=>{
 let tick,calls=0;const navigation=savedLoginNavigation({request:async()=>++calls>1,setTimer:fn=>{tick=fn;return 1;},clearTimer:()=>{}});
 await navigation.saved();assert.equal(navigation.completed,false);
 await tick();assert.equal(calls,2);assert.equal(navigation.completed,true);
});
test('navigation failures preserve the saved account and only retry opening the feed',async()=>{
 let calls=0;const errors=[];
 const navigation=savedLoginNavigation({request:async()=>{if(++calls===1)throw Error('页面未打开');return true;},onError:e=>errors.push(e.message)});
 await navigation.saved();assert.deepEqual(errors,['页面未打开']);assert.equal(navigation.completed,false);
 await navigation.retry();assert.equal(navigation.completed,true);assert.equal(calls,2);
});
test('leaving the document discards queued navigation retries',async()=>{
 let tick,calls=0;const navigation=savedLoginNavigation({request:async()=>{calls++;return false;},setTimer:fn=>{tick=fn;return 1;},clearTimer:()=>{}});
 await navigation.saved();navigation.close();await tick();assert.equal(calls,1);
});
