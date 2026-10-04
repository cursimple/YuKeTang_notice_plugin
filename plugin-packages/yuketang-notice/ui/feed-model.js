/** 清单里声明的类型语义；组件自己知道，不用按类型名猜 */
export function kindOf(type, manifest) {
  const spec = (manifest?.extension?.feedTypes || []).find(t => t.id === type);
  if (spec?.kind === 'notice' || spec?.kind === 'task') return spec.kind;
  // 老清单没声明时的兜底，只影响旧包
  return ['announcement', 'notice'].includes(type) ? 'notice' : 'task';
}

export function anchorOf(item, source = 'automatic', manifest) {
  const kind = kindOf(item.type, manifest);
  const automatic = kind === 'notice' ? (item.publishAt ?? item.startAt ?? item.dueAt)
    : (item.type === 'exam' ? (item.startAt ?? item.dueAt) : (item.dueAt ?? item.startAt));
  const selected = source === 'publish' ? item.publishAt : source === 'start' ? item.startAt : source === 'due' ? item.dueAt : automatic;
  return selected ?? automatic ?? item.publishAt ?? item.firstSeenAt ?? 0;
}

export function visibleFeedItems(data, now = Date.now(), manifest) {
  const settings = data.host?.feed || {};
  return (data.items || []).filter(item => {
    if (settings.includedTypes != null && !settings.includedTypes.includes(item.type)) return false;
    const notice = kindOf(item.type, manifest) === 'notice';
    if (item.done && notice && settings.includeReadNotices === false) return false;
    if (item.done && !notice && settings.includeCompleted === false) return false;
    return !(settings.historyDays > 0 && anchorOf(item, settings.dateSource, manifest) < now - settings.historyDays * 86400000);
  });
}

export function itemDayKey(milliseconds, timeZone = 'Asia/Shanghai') {
  if (!milliseconds) return '';
  try {
    const parts = new Intl.DateTimeFormat('en-US', {timeZone, year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(new Date(milliseconds));
    const value = type => parts.find(part => part.type === type)?.value;
    return `${value('year')}-${value('month')}-${value('day')}`;
  } catch {
    const date = new Date(milliseconds);
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  }
}

/** 公告读完即止，不参与「完成 / 未完成」；任务才分完成状态 */
export const isNoticeItem = (item, manifest) => kindOf(item.type, manifest) === 'notice';

/** 待完成：任务类、有未完成的、且不是往期内容 */
export const isPendingItem = (item, manifest) =>
  !item.done && !item.historical && !isNoticeItem(item, manifest);

/** 待完成条数：驱动顶部那一条计数入口 */
export function pendingCount(items, manifest) {
  return (items || []).filter(item => isPendingItem(item, manifest)).length;
}

/** 一条内容在界面上的状态，决定圆点 / 色条 / 标签的颜色 */
export function stateOfItem(item, manifest) {
  if (item.historical) return 'old';
  const notice = isNoticeItem(item, manifest);
  if (item.done) return notice ? 'read' : 'done';
  return notice ? 'notice' : 'pending';
}

export const STATE_LABELS = {old: '往期', done: '已完成', read: '已读', notice: '公告', pending: '待完成'};

/** 状态对应的文字标签 */
export function stateLabelOf(item, manifest) {
  return STATE_LABELS[stateOfItem(item, manifest)];
}

/**
 * 按类型与完成状态筛选。
 * [status] 为空表示全部；`pending` 只留未完成任务；`done` 只留已完成任务——
 * 已读公告不算「已完成」，否则筛出来的和用户理解的不一样。
 */
export function filterFeedItems(items, {type = '', status = ''} = {}, manifest) {
  return (items || []).filter(item => {
    if (type && item.type !== type) return false;
    if (!status) return true;
    if (isNoticeItem(item, manifest)) return false;
    return status === 'pending' ? isPendingItem(item, manifest) : item.done;
  });
}

/** 完成状态筛选的分母：只数任务类内容，公告不参与 */
export function statusCounts(items, manifest) {
  const tasks = (items || []).filter(item => !isNoticeItem(item, manifest));
  return {
    all: tasks.length,
    pending: tasks.filter(item => isPendingItem(item, manifest)).length,
    done: tasks.filter(item => item.done && !item.historical).length,
  };
}

/** 有没有任务类内容；只有公告时不必显示完成状态筛选 */
export const hasTaskItems = (items, manifest) =>
  (items || []).some(item => !isNoticeItem(item, manifest));

