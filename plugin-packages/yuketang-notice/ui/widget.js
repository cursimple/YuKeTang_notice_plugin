import { widgetTasks } from './widget-model.js';

const sdk = window.CurSimpleWidget;
const state = sdk.state;
const context = state.context;
const now = context.nowMillis;
const language = context.language.startsWith('en') ? 'en' : /TW|Hant|HK/.test(context.language) ? 'zh-TW' : 'zh-CN';
const texts = {
  'zh-CN': {title:'雨课堂待办',empty:'雨课堂暂无待办',count:n=>`${n} 项`,due:'截止',start:'开始',late:'已逾期',types:{homework:'作业',exam:'考试'}},
  'zh-TW': {title:'雨課堂待辦',empty:'雨課堂暫無待辦',count:n=>`${n} 項`,due:'截止',start:'開始',late:'已逾期',types:{homework:'作業',exam:'考試'}},
  en: {title:'YuKeTang tasks',empty:'No YuKeTang tasks',count:n=>`${n} left`,due:'Due',start:'Starts',late:'Overdue',types:{homework:'Assignment',exam:'Exam'}}
}[language];
const tasks = widgetTasks(state, now);
const moment = item => item.startAt > now ? item.startAt : item.dueAt ?? item.startAt;
// Reserve compact for genuinely tiny cells; a 4x2 widget should not collapse into compact.
const compact = context.width < 180 || context.height < 120;
if (compact) document.body.classList.add('compact');
document.documentElement.style.setProperty('--font-scale', context.fontScale);
document.getElementById('title').textContent = texts.title;
document.getElementById('count').textContent = texts.count(tasks.length);
const list = document.getElementById('tasks');
const empty = document.getElementById('empty');
empty.textContent = texts.empty;
empty.style.display = tasks.length ? 'none' : 'flex';
for (const item of tasks.slice(0,8)) {
  const row = document.createElement('article');row.className='task';row.dataset.action='feed';
  const meta = document.createElement('div');meta.className='meta';
  const type = state.manifest.extension.feedTypes.find(type=>type.id===item.type);
  meta.textContent = [texts.types[item.type] || type?.label,item.course].filter(Boolean).join(' · ');
  const title = document.createElement('div');title.className='title';title.textContent=item.title;
  const timing = document.createElement('div');timing.className='when';
  const at = moment(item);
  if (at != null) {
    const date = new Intl.DateTimeFormat(language,{timeZone:context.timeZone,month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(at));
    timing.textContent = `${date} ${item.startAt > now ? texts.start : texts.due}`;
    if (item.dueAt < now) {timing.classList.add('late');timing.textContent += ` · ${texts.late}`;}
  }
  row.append(meta,title,timing);list.append(row);
}
// Keep complete cards only; labels and filtering belong to this component.
setTimeout(()=>{
  const bottom = document.getElementById('widget').getBoundingClientRect().bottom - (compact ? 8 : 10);
  for (const row of [...list.children]) if (row.getBoundingClientRect().bottom > bottom) row.remove();
  const areas = [...document.querySelectorAll('[data-action]')].filter(node=>node.getBoundingClientRect().height>0).map(node=>{
    const box=node.getBoundingClientRect();return {x:box.x,y:box.y,width:box.width,height:box.height,action:node.dataset.action};
  });
  sdk.ready(areas);
}, 0);
