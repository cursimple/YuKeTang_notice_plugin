import test from 'node:test';
import assert from 'node:assert/strict';
import {widgetTasks} from '../plugin-packages/yuketang-notice/ui/widget-model.js';

const manifest = {extension:{feedTypes:[{id:'homework',kind:'task'},{id:'announcement',kind:'notice'}]}};
const item = (id,extra={}) => ({id,type:'homework',title:id,...extra});
test('signed out widgets hide cached tasks and expired sessions keep them',()=>{
 const data={manifest,items:[item('cached')]};
 for (const loginState of ['never','logged_out']) assert.deepEqual(widgetTasks({...data,loginState},100),[]);
 assert.deepEqual(widgetTasks({...data,loginState:'expired'},100).map(x=>x.id),['cached']);
});
test('owned widget filters completion, history, notices and manual ignores',()=>{
 const data={manifest,items:[item('visible'),item('complete',{done:true}),item('history',{historical:true}),item('notice',{type:'announcement'}),item('hidden')],ignoredItemIds:['hidden']};
 assert.deepEqual(widgetTasks(data,100).map(x=>x.id),['visible']);
});
test('owned widget honors overdue ignoring and explicit restoration',()=>{
 const data={manifest,items:[item('hidden',{dueAt:50}),item('restored',{dueAt:50})],host:{ignoreOverdue:true},restoredItemIds:['restored']};
 assert.deepEqual(widgetTasks(data,100).map(x=>x.id),['restored']);
});
test('upcoming tasks take priority over archived deadlines',()=>{
 const data={manifest,items:[item('old',{dueAt:10}),item('later',{dueAt:300}),item('soon',{dueAt:200}),item('undated')]};
 assert.deepEqual(widgetTasks(data,100).map(x=>x.id),['soon','later','undated','old']);
});
