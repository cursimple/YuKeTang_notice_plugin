// 日历 / 筛选逻辑的单测：这些规则决定用户看到哪些内容和什么颜色，
// 之前只写在页面里，改一次就得靠手点，容易回归。
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  filterFeedItems, pendingCount, stateOfItem, stateLabelOf,
  statusCounts, hasTaskItems, kindOf, anchorOf, visibleFeedItems, itemDayKey,
} from "../plugin-packages/yuketang-notice/ui/feed-model.js";

const MANIFEST = {
  extension: {
    feedTypes: [
      { id: "homework", label: "作业", kind: "task" },
      { id: "exam", label: "考试", kind: "task" },
      { id: "announcement", label: "公告", kind: "notice" },
    ],
  },
};

const item = (over = {}) => ({
  id: "x", type: "homework", title: "作业", done: false, historical: false, ...over,
});

// ---- 语义判定 ----

test("kindOf：认清单声明的语义，不靠类型名猜", () => {
  assert.equal(kindOf("homework", MANIFEST), "task");
  assert.equal(kindOf("announcement", MANIFEST), "notice");
  // 清单里没有的、也没声明语义，才退回老名字兜底
  assert.equal(kindOf("notice", MANIFEST), "notice");
  assert.equal(kindOf("whatever", MANIFEST), "task");
});

test("kindOf：清单声明优先于类型名", () => {
  const manifest = { extension: { feedTypes: [{ id: "announcement", kind: "task" }] } };
  assert.equal(kindOf("announcement", manifest), "task", "声明成任务就该是任务");
});

// ---- 待完成 ----

test("pendingCount：只数没做完的任务，公告和往期都不算", () => {
  const items = [
    item({ id: "a" }),
    item({ id: "b", done: true }),
    item({ id: "c", type: "exam" }),
    item({ id: "d", type: "announcement" }),
    item({ id: "e", historical: true }),
  ];
  assert.equal(pendingCount(items, MANIFEST), 2);
});

test("pendingCount：已读公告不算待完成", () => {
  const items = [item({ id: "n", type: "announcement", done: true })];
  assert.equal(pendingCount(items, MANIFEST), 0);
});

// ---- 状态与颜色 ----

test("stateOfItem：四种状态各自对应一个颜色", () => {
  assert.equal(stateOfItem(item({ id: "1" }), MANIFEST), "pending");
  assert.equal(stateOfItem(item({ id: "2", done: true }), MANIFEST), "done");
  assert.equal(stateOfItem(item({ id: "3", type: "announcement" }), MANIFEST), "notice");
  assert.equal(stateOfItem(item({ id: "4", type: "announcement", done: true }), MANIFEST), "read");
});

test("stateOfItem：往期内容一律灰色，压过其它状态", () => {
  assert.equal(stateOfItem(item({ id: "1", historical: true }), MANIFEST), "old");
  assert.equal(stateOfItem(item({ id: "2", historical: true, done: true }), MANIFEST), "old");
});

test("stateLabelOf：状态有对应中文标签", () => {
  assert.equal(stateLabelOf(item({ id: "1" }), MANIFEST), "待完成");
  assert.equal(stateLabelOf(item({ id: "2", done: true }), MANIFEST), "已完成");
  assert.equal(stateLabelOf(item({ id: "3", type: "announcement" }), MANIFEST), "公告");
  assert.equal(stateLabelOf(item({ id: "4", type: "announcement", done: true }), MANIFEST), "已读");
});

// ---- 筛选 ----

test("filterFeedItems：按类型筛选", () => {
  const items = [item({ id: "a" }), item({ id: "b", type: "exam" }), item({ id: "c", type: "announcement" })];
  assert.deepEqual(filterFeedItems(items, { type: "exam" }, MANIFEST).map(x => x.id), ["b"]);
  assert.deepEqual(filterFeedItems(items, {}, MANIFEST).map(x => x.id), ["a", "b", "c"]);
});

test("filterFeedItems：未完成只看任务，已读公告不出现在已完成里", () => {
  const items = [
    item({ id: "todo" }),
    item({ id: "finished", done: true }),
    item({ id: "read-notice", type: "announcement", done: true }),
  ];
  assert.deepEqual(filterFeedItems(items, { status: "pending" }, MANIFEST).map(x => x.id), ["todo"]);
  assert.deepEqual(filterFeedItems(items, { status: "done" }, MANIFEST).map(x => x.id), ["finished"]);
});

test("filterFeedItems：类型和状态同时生效", () => {
  const items = [item({ id: "hw" }), item({ id: "exam", type: "exam" }), item({ id: "exam-done", type: "exam", done: true })];
  assert.deepEqual(filterFeedItems(items, { type: "exam", status: "pending" }, MANIFEST).map(x => x.id), ["exam"]);
});

test("statusCounts：分母只数任务，公告不参与", () => {
  const items = [
    item({ id: "a" }),
    item({ id: "b", done: true }),
    item({ id: "n1", type: "announcement" }),
    item({ id: "n2", type: "announcement", done: true }),
  ];
  assert.deepEqual(statusCounts(items, MANIFEST), { all: 2, pending: 1, done: 1 });
});

test("statusCounts：往期已完成不计入已完成", () => {
  const items = [item({ id: "old", done: true, historical: true }), item({ id: "now", done: true })];
  assert.equal(statusCounts(items, MANIFEST).done, 1);
});

test("hasTaskItems：只有公告时不显示完成状态筛选", () => {
  assert.equal(hasTaskItems([item({ id: "n", type: "announcement" })], MANIFEST), false);
  assert.equal(hasTaskItems([item({ id: "h" }), item({ id: "n", type: "announcement" })], MANIFEST), true);
});

// ---- 日期落点 ----

test("anchorOf：任务按截止，考试按开考，公告按发布", () => {
  const publish = Date.parse("2026-10-01T08:00:00+08:00");
  const start = Date.parse("2026-10-05T09:00:00+08:00");
  const due = Date.parse("2026-10-06T23:00:00+08:00");
  assert.equal(anchorOf({ type: "homework", dueAt: due, publishAt: publish }, "automatic", MANIFEST), due);
  assert.equal(anchorOf({ type: "exam", startAt: start, dueAt: due }, "automatic", MANIFEST), start);
  assert.equal(anchorOf({ type: "announcement", publishAt: publish, dueAt: due }, "automatic", MANIFEST), publish);
});

test("anchorOf：用户指定日期依据时覆盖默认", () => {
  const publish = Date.parse("2026-10-01T08:00:00+08:00");
  const due = Date.parse("2026-10-06T23:00:00+08:00");
  assert.equal(anchorOf({ type: "homework", dueAt: due, publishAt: publish }, "publish", MANIFEST), publish);
});

test("visibleFeedItems：隐藏已完成 / 已读公告分别生效", () => {
  const data = { host: { feed: { includeCompleted: false, includeReadNotices: true } }, items: [
    item({ id: "a" }), item({ id: "b", done: true }), item({ id: "n", type: "announcement", done: true }),
  ] };
  assert.deepEqual(visibleFeedItems(data, Date.now(), MANIFEST).map(x => x.id), ["a", "n"]);
});

test("itemDayKey：跨时区落到正确的那一天", () => {
  // 北京时间 10 月 1 日 00:30，在 UTC 还是 9 月 30 日
  const ms = Date.parse("2026-10-01T00:30:00+08:00");
  assert.equal(itemDayKey(ms, "Asia/Shanghai"), "2026-10-01");
  assert.equal(itemDayKey(ms, "UTC"), "2026-09-30");
});

test('忽略：默认保留逾期，开启自动忽略后隐藏，可单条恢复且保留手动忽略', async () => {
  const {visibleFeedItems,ignoredFeedItems}=await import('../plugin-packages/yuketang-notice/ui/feed-model.js');
  const task={id:'task',type:'homework',title:'作业',dueAt:100};
  const notice={id:'notice',type:'announcement',title:'公告',publishAt:50};
  let data={items:[task,notice],host:{}};
  assert.equal(visibleFeedItems(data,200).length,2);
  data.host.ignoreOverdue=true;
  assert.deepEqual(visibleFeedItems(data,200).map(x=>x.id),['notice']);
  assert.deepEqual(ignoredFeedItems(data,200).map(x=>x.id),['task']);
  data.restoredItemIds=['task'];
  assert.equal(visibleFeedItems(data,200).length,2);
  data.ignoredItemIds=['task'];
  assert.equal(ignoredFeedItems(data,200).length,1);
  data.host.ignoreOverdue=false;
  assert.equal(ignoredFeedItems(data,200).length,1);
});
