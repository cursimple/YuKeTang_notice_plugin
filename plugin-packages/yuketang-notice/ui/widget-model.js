import { isPendingItem, isIgnoredItem } from './feed-model.js';

export function widgetTasks(state, now) {
  if (state.loginState === 'never' || state.loginState === 'logged_out') return [];
  const at = item => item.startAt > now ? item.startAt : item.dueAt ?? item.startAt;
  const pending = (state.items || []).filter(item => isPendingItem(item, state.manifest) && !isIgnoredItem(item, state, now, state.manifest));
  const future = pending.filter(item => at(item) != null && at(item) >= now).sort((a,b) => at(a)-at(b));
  const undated = pending.filter(item => at(item) == null);
  const overdue = pending.filter(item => at(item) != null && at(item) < now).sort((a,b) => at(b)-at(a));
  return [...future,...undated,...overdue];
}
