export function kindOf(type, manifest) {
  const spec = (manifest?.extension?.feedTypes || []).find(t => t.id === type);
  if (spec?.kind === 'notice' || spec?.kind === 'task') return spec.kind;
  // Fallback semantics for legacy manifests without declarations.
  return ['announcement', 'notice'].includes(type) ? 'notice' : 'task';
}

export function anchorOf(item, source = 'automatic', manifest) {
  const kind = kindOf(item.type, manifest);
  const automatic = kind === 'notice' ? (item.publishAt ?? item.startAt ?? item.dueAt)
    : (item.type === 'exam' ? (item.startAt ?? item.dueAt) : (item.dueAt ?? item.startAt));
  const selected = source === 'publish' ? item.publishAt : source === 'start' ? item.startAt : source === 'due' ? item.dueAt : automatic;
  return selected ?? automatic ?? item.publishAt ?? item.firstSeenAt ?? 0;
}

export function isIgnoredItem(item, data, now = Date.now(), manifest) {
  return (data.ignoredItemIds || []).includes(item.id) || (data.host?.ignoreOverdue === true &&
    !(data.restoredItemIds || []).includes(item.id) && !item.done && !isNoticeItem(item, manifest) &&
    item.dueAt != null && item.dueAt <= now);
}

export function ignoredFeedItems(data, now = Date.now(), manifest) {
  return (data.items || []).filter(item => isIgnoredItem(item, data, now, manifest));
}

export function visibleFeedItems(data, now = Date.now(), manifest) {
  const settings = data.host?.feed || {};
  return (data.items || []).filter(item => {
    if (isIgnoredItem(item, data, now, manifest)) return false;
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

export const isNoticeItem = (item, manifest) => kindOf(item.type, manifest) === 'notice';

export const isPendingItem = (item, manifest) =>
  !item.done && !item.historical && !isNoticeItem(item, manifest);

export function pendingCount(items, manifest) {
  return (items || []).filter(item => isPendingItem(item, manifest)).length;
}

export function stateOfItem(item, manifest) {
  if (item.historical) return 'old';
  const notice = isNoticeItem(item, manifest);
  if (item.done) return notice ? 'read' : 'done';
  return notice ? 'notice' : 'pending';
}

export const STATE_LABELS = {old: '往期', done: '已完成', read: '已读', notice: '公告', pending: '待完成'};

export function stateLabelOf(item, manifest) {
  return STATE_LABELS[stateOfItem(item, manifest)];
}

/** Pending/done filters apply to tasks only; read notices do not count as completed tasks. */
export function filterFeedItems(items, {type = '', status = ''} = {}, manifest) {
  return (items || []).filter(item => {
    if (type && item.type !== type) return false;
    if (!status) return true;
    if (isNoticeItem(item, manifest)) return false;
    return status === 'pending' ? isPendingItem(item, manifest) : item.done;
  });
}

/** Count tasks only in completion statistics. */
export function statusCounts(items, manifest) {
  const tasks = (items || []).filter(item => !isNoticeItem(item, manifest));
  return {
    all: tasks.length,
    pending: tasks.filter(item => isPendingItem(item, manifest)).length,
    done: tasks.filter(item => item.done && !item.historical).length,
  };
}

/** Hide completion filtering when no task content exists. */
export const hasTaskItems = (items, manifest) =>
  (items || []).some(item => !isNoticeItem(item, manifest));

