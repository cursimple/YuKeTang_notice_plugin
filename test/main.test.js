import { test } from "node:test";
import assert from "node:assert/strict";
import { checkLogin, sync, __test__ } from "../plugin-packages/yuketang-notice/main.js";

const NOW = Date.UTC(2026, 8, 29, 4, 0, 0);

function makeCtx(routes, { settings = {}, state = {} } = {}) {
  const calls = [];
  const store = { ...state };
  return {
    calls,
    store,
    settings,
    now: () => NOW,
    state: { get: (k) => store[k], set: (k, v) => { store[k] = v; } },
    web: { cookie: (name) => (name === "csrftoken" ? "csrf-123" : "") },
    log: { warn() {}, info() {}, error() {} },
    network: {
      async fetch(url, init) {
        calls.push({ url, headers: init?.headers || {} });
        const path = url.replace(/^https:\/\/[^/]+/, "");
        const key = Object.keys(routes).find((prefix) => path.startsWith(prefix));
        if (!key) return response(404, "not found");
        const body = routes[key];
        return typeof body === "function" ? body(path, init) : response(200, JSON.stringify(body));
      },
    },
  };
}

function response(status, text) {
  return { status, ok: status >= 200 && status < 300, text: async () => text };
}

const COURSES = {
  data: {
    list: [
      { classroom_id: 101, name: "计科2401", term: 202601, course: { name: "数据结构", university_id: 2797 }, teacher: { name: "王老师" } },
      { classroom_id: 102, name: "计科2401", term: 202601, course: { name: "离散数学", university_id: 2797 } },
      { classroom_id: 99, name: "旧班", term: 202502, course: { name: "高等数学", university_id: 2797 } },
    ],
  },
};
const BASIC = { code: 0, data: { id: 10001, name: "小明", school: "示例大学", schoolNumber: "2024001", avatar: "" } };

function fullRoutes(overrides = {}) {
  return {
    "/v2/api/web/courses/list": COURSES,
    "/api/v3/user/basic-info": BASIC,
    "/c27/online_courseware/course/classroom/101/0/sku_list/": { data: { data_list: [{ sku_id: 9001 }] } },
    "/c27/online_courseware/course/classroom/102/0/sku_list/": { data: { data_list: [] } },
    "/c27/online_courseware/schedule/score_detail/single/9001/0/": {
      data: {
        leaf_level_infos: [
          { id: 1, leaf_type: 6, publish_status: 2, evaluation_id: 11, leaf_level_title: "第一章作业", leaf_chapter_title: "绪论", schedule_detail: "3/10", schedule: 0.3 },
          { id: 2, leaf_type: 6, publish_status: 2, evaluation_id: 2000, leaf_level_title: "章节测试一", schedule_detail: "5/5", schedule: 1 },
          { id: 3, leaf_type: 6, publish_status: 0, leaf_level_title: "未发布的期末" },
          { id: 4, leaf_type: 0, publish_status: 2, leaf_level_title: "视频" },
        ],
      },
    },
    "/mooc-api/v1/lms/learn/leaf_info/101/1/": { data: { score_deadline: 1790700000000, class_end_time: 1800000000000 } },
    "/mooc-api/v1/lms/learn/leaf_info/101/2/": { data: { score_deadline: 0, class_end_time: 1800000000000 } },
    "/v2/api/web/logs/learn/101": {
      data: {
        activities: [
          { type: 5, courseware_id: 777, title: "期中测验", deadline: 1790800000000, create_time: 1790000000000, problem_count: 20, total_score: 100 },
          { type: 14, courseware_id: 555, title: "课堂" },
        ],
      },
    },
    "/v2/api/web/logs/learn/102": { data: { activities: [] } },
    "/v/exam/cover": { data: { result: { status: 0 }, start_time: 1790750000000, deadline: 1790800000000 } },
    "/v/discussion/v2/announcements/?cid=101": {
      data: {
        results: [
          { id: 31, topic_name: "调课通知", content: { text: "<p>周三的课<br>改到周五</p>" }, user_info: { name: "王老师" }, app_publish_time: "2026-09-28 20:15:00", is_read: false },
        ],
      },
    },
    "/v/discussion/v2/announcements/?cid=102": { data: { results: [] } },
    "/v/discussion/v2/announcements/?cid=99": {
      data: {
        results: [
          { id: 91, topic_name: "往期资料", content: { text: "<p>上一学期资料</p>" }, user_info: { name: "旧老师" }, app_publish_time: "2025-03-01 09:00:00", is_read: true },
        ],
      },
    },
    ...overrides,
  };
}

test("checkLogin：basic-info 回 UNAUTHENTICATED 就是没登录", async () => {
  const ctx = makeCtx({
    "/v2/api/web/courses/list": COURSES,
    "/api/v3/user/basic-info": { code: 50000, msg: "UNAUTHENTICATED", data: "" },
  });
  assert.deepEqual(await checkLogin(ctx), { loggedIn: false });
});

test("checkLogin：登录了就带回账号，并用课程里的学校 id 填 v3 头", async () => {
  const ctx = makeCtx(fullRoutes());
  const result = await checkLogin(ctx);
  assert.equal(result.loggedIn, true);
  assert.equal(result.account.name, "小明");
  assert.equal(result.account.school, "示例大学");
  const basic = ctx.calls.find((c) => c.url.includes("/api/v3/user/basic-info"));
  assert.equal(basic.headers["university-id"], "2797");
  assert.equal(basic.headers.xtbz, "ykt");
  assert.equal(basic.headers["X-CSRFToken"], "csrf-123");
});

test("sync：当前学期优先，同时保留往期公告，不拉往期作业考试", async () => {
  const ctx = makeCtx(fullRoutes());
  const result = await sync(ctx);
  assert.equal(result.loginRequired, undefined);
  const byId = Object.fromEntries(result.items.map((it) => [it.id, it]));

  const hw = byId["homework:101:1"];
  assert.equal(hw.type, "homework");
  assert.equal(hw.title, "第一章作业");
  assert.equal(hw.course, "数据结构");
  assert.equal(hw.dueAt, 1790700000000);
  assert.equal(hw.done, false);
  assert.match(hw.summary, /作业 · 绪论 · 已答 3\/10/);

  assert.equal(byId["homework:101:2"].done, true);
  assert.ok(!ctx.calls.some((c) => c.url.includes("leaf_info/101/2/")));
  assert.equal(byId["homework:101:3"], undefined);
  assert.equal(byId["homework:101:4"], undefined);

  const exam = byId["exam:101:777"];
  assert.equal(exam.dueAt, 1790800000000);
  assert.equal(exam.startAt, 1790750000000);
  assert.match(exam.summary, /未作答 · 20 题 · 100 分/);

  const ann = byId["announcement:101:31"];
  assert.equal(ann.content, "周三的课\n改到周五");
  assert.equal(ann.author, "王老师");
  assert.equal(ann.publishAt, Date.UTC(2026, 8, 28, 12, 15, 0));

  const old = byId["announcement:99:91"];
  assert.equal(old.historical, true);
  assert.equal(old.content, "上一学期资料");
  assert.ok(!ctx.calls.some((c) => c.url.includes("sku_list") && c.url.includes("99")));
  assert.equal(result.account.id, "10001");
});

test("sync：截止时间缓存住，第二次同步不再查 leaf_info", async () => {
  const ctx = makeCtx(fullRoutes());
  await sync(ctx);
  const first = ctx.calls.filter((c) => c.url.includes("leaf_info")).length;
  assert.equal(first, 1);
  ctx.calls.length = 0;
  await sync(ctx);
  assert.equal(ctx.calls.filter((c) => c.url.includes("leaf_info")).length, 0);
  assert.ok(ctx.store.cache.deadlines["101:1"]);
});

test("sync：登录过期返回 loginRequired，不抛错", async () => {
  const ctx = makeCtx(fullRoutes({ "/api/v3/user/basic-info": { code: 50000, msg: "UNAUTHENTICATED" } }));
  assert.deepEqual(await sync(ctx), { loginRequired: true });
});

test("sync：课程接口中途 401 也按登录失效处理", async () => {
  const ctx = makeCtx(fullRoutes({ "/v2/api/web/logs/learn/101": () => response(401, "") }));
  assert.deepEqual(await sync(ctx), { loginRequired: true });
});

test("sync：某门课接口报错只记一笔，其余照常返回", async () => {
  const ctx = makeCtx(fullRoutes({ "/v/discussion/v2/announcements/?cid=101": () => response(500, "boom") }));
  const result = await sync(ctx);
  assert.ok(result.items.some((it) => it.id === "homework:101:1"));
  assert.ok(!result.items.some((it) => it.id === "announcement:101:31"));
  assert.ok(result.items.some((it) => it.id === "announcement:99:91"));
  assert.match(result.message, /没取到/);
});

test("sync：设置关掉的类型不拉，隐藏已完成生效", async () => {
  const ctx = makeCtx(fullRoutes(), {
    settings: { syncExam: false, syncAnnouncement: false, hideFinished: true },
  });
  const result = await sync(ctx);
  assert.ok(!ctx.calls.some((c) => c.url.includes("/logs/learn/")));
  assert.ok(!ctx.calls.some((c) => c.url.includes("announcements")));
  assert.deepEqual(result.items.map((it) => it.id), ["homework:101:1"]);
});

test("sync：站点设置只认 *.yuketang.cn，其余回落到长江雨课堂", async () => {
  const ctx = makeCtx(fullRoutes(), { settings: { site: "evil.example.com" } });
  await checkLogin(ctx);
  assert.ok(ctx.calls.every((c) => c.url.startsWith("https://changjiang.yuketang.cn/")));
  assert.equal(__test__.siteOf({ site: "www.yuketang.cn" }), "www.yuketang.cn");
});

test("toMillis：毫秒、秒、北京时间字符串都认", () => {
  const { toMillis } = __test__;
  assert.equal(toMillis(1790700000000), 1790700000000);
  assert.equal(toMillis(1790700000), 1790700000000);
  assert.equal(toMillis("1790700000000"), 1790700000000);
  assert.equal(toMillis("2025-12-08 12:18:24"), Date.UTC(2025, 11, 8, 4, 18, 24));
  assert.equal(toMillis(0), null);
  assert.equal(toMillis(""), null);
  assert.equal(toMillis("随便"), null);
});

test('不支持内容操作：已读接口已从组件移除', async () => {
  const { performItemAction } = await import('../plugin-packages/yuketang-notice/main.js');
  const ctx = makeCtx({});
  ctx.action = {type:'markRead',itemId:'announcement:101:31'};
  await assert.rejects(performItemAction(ctx), /不支持/);
});
