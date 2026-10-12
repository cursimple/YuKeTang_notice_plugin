import {createTools,bindAction} from './tools-shell.js';
import {sdk,esc,icon,toast} from './shared.js';

export function rainTools(snapshot) {
  const timestamp=value=>value?new Date(value).toLocaleString('zh-CN',{timeZone:snapshot().context?.timeZone||'Asia/Shanghai',hour12:false}):'尚无记录';
  const statusHtml=({pairs})=>{
    const data=snapshot().data;
    return pairs([
      ['登录状态',data.loginState==='logged_in'?'已登录':data.loginState==='expired'?'已过期':'未登录'],
      ['最近尝试',timestamp(data.lastAttemptAt)],['最近成功',timestamp(data.lastSyncAt)],
      ['缓存内容',`${data.items?.length||0} 项`],['最近错误',data.lastError||'无'],
    ]);
  };
  return createTools({sdk,snapshot,icon,esc,toast,mark:'book',subtitle:'整理课堂消息，及时跟进每一项安排。',aboutFeatures:[
    {icon:'calendar',title:'课堂日历',description:'按日期查看作业、考试和课程公告'},
    {icon:'bell',title:'提醒与事务',description:'新内容与截止提醒，可同步到课表事务'},
    {icon:'list',title:'桌面待办',description:'通过专属小组件查看课堂待办'},
  ],features:[
    {id:'sync',title:'同步检查',description:'查看登录、同步时间和内容数量',icon:'sync',render(ctx){
      const {root,card}=ctx;
      root.innerHTML=card('<h2>当前状态</h2><div id="sync-status">'+statusHtml(ctx)+'</div>')+'<p class="tool-intro">使用与首页相同的同步流程，完成后更新内容和状态。</p><button class="primary" id="sync-run">'+icon('sync')+'立即同步</button><p data-result class="tool-result" role="status" hidden></p>';
      const stop=sdk.subscribe(()=>{if(root.isConnected)root.querySelector('#sync-status').innerHTML=statusHtml(ctx);});
      bindAction(root,'sync-run',async()=>{
        if(snapshot().data.loginState!=='logged_in')throw new Error('请先返回组件首页登录账号');
        try{const value=await sdk.request('sync');return value?.count!=null?`同步完成，共 ${value.count} 条内容`:'同步完成';}
        finally{root.querySelector('#sync-status').innerHTML=statusHtml(ctx);}
      },{working:'正在同步课堂内容…'});
      return stop;
    }},
    {id:'widget',title:'小组件检查',description:'查看小组件声明并请求刷新桌面',icon:'calendar',render({root,card,pairs}){
      const m=snapshot().manifest,widgets=m.extension?.widgets||[];
      root.innerHTML=card('<h2>组件提供的小组件</h2>'+pairs(widgets.map(x=>[x.title||x.name||x.id,x.id])))+'<p class="tool-intro">重新请求绘制已添加到桌面的实例。刷新请求完成后，请在桌面核对实际显示。</p><button class="primary" id="widget-refresh">'+icon('refresh')+'刷新桌面小组件</button><p data-result class="tool-result" role="status" hidden></p>';
      bindAction(root,'widget-refresh',async()=>{await sdk.request('debug.refreshWidget');return '已请求刷新，请在桌面检查小组件';},{working:'正在请求刷新…'});
    }},
  ]});
}
