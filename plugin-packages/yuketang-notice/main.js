// 雨课堂通知组件 · 课简扩展组件（apiVersion 3，kind = extension）
//
// 宿主会在雨课堂自己的域名下开一个看不见的 WebView，把这份脚本注入进去，再调用下面导出的函数：
// - checkLogin(ctx)：登录页上反复调用，登上了就返回账号，宿主据此关掉登录页
// - sync(ctx)：后台定时调用，返回作业 / 考试 / 公告条目，宿主负责通知、日历和写进课表
//
// 所有请求都走 ctx.network.fetch，也就是页面自己的 fetch：同源、自动带上登录 Cookie，
// 宿主只放行 manifest 里 allowedHosts 列出的几个雨课堂站点。

const DEFAULT_SITE = "changjiang.yuketang.cn";

/** 同时在飞的请求数：课程多时一门一门串着查太慢，一下全放出去又像刷接口 */
const CONCURRENCY = 4;

/** 作业截止时间要一份一份查 leaf_info，查过的缓存这么久，免得每次同步都把所有作业再问一遍 */
const DEADLINE_TTL_MS = 12 * 60 * 60 * 1000;

/** 交过的试卷不会再变回未交，缓存下来就不用每次都去问 cover */
const EXAM_DONE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** 每门课最多拿这么多条公告；太老的公告没有提醒价值 */
const ANNOUNCEMENT_LIMIT = 10;

/** 评测类型 id → 名称（score_detail 里的 evaluation_id） */
const EVALUATION_LABELS = { 11: "作业", 2000: "章节测试", 12: "考试" };

/** 习题叶子（作业 / 课后作业 / 章节测试）；视频、课件、简介都不是提醒对象 */
const EXERCISE_LEAF_TYPE = 6;

/** 学习日志里的试卷 */
const ACTIVITY_EXAM = 5;

class LoginRequiredError extends Error {}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

export async function checkLogin(ctx) {
  const api = createApi(ctx);
  try {
    const courses = await api.courses();
    const account = await api.account(courses);
    return { loggedIn: true, account };
  } catch (error) {
    if (error instanceof LoginRequiredError) return { loggedIn: false };
    throw error;
  }
}

export async function sync(ctx) {
  const api = createApi(ctx);
  const settings = ctx.settings || {};
  const state = loadState(ctx);
  const now = ctx.now ? ctx.now() : Date.now();

  let courses;
  let account;
  try {
    courses = await api.courses();
    account = await api.account(courses);
  } catch (error) {
    if (error instanceof LoginRequiredError) return { loginRequired: true };
    throw error;
  }

  const picked = pickCourses(courses, settings.onlyCurrentTerm !== false);
  const items = [];
  const failures = [];

  try {
    await runPool(picked, CONCURRENCY, async (course) => {
      const jobs = [];
      if (settings.syncHomework !== false) jobs.push(homeworkOf(api, course, state, now));
      if (settings.syncExam !== false) jobs.push(examsOf(api, course, state, now));
      if (settings.syncAnnouncement !== false) jobs.push(announcementsOf(api, course));
      for (const result of await Promise.allSettled(jobs)) {
        if (result.status === "fulfilled") {
          items.push(...result.value);
        } else if (result.reason instanceof LoginRequiredError) {
          throw result.reason;
        } else {
          failures.push(`${course.name}: ${messageOf(result.reason)}`);
        }
      }
    });
  } catch (error) {
    if (error instanceof LoginRequiredError) return { loginRequired: true };
    throw error;
  }

  if (settings.syncSystemMessage === true) {
    try {
      items.push(...(await systemMessagesOf(api)));
    } catch (error) {
      if (error instanceof LoginRequiredError) return { loginRequired: true };
      failures.push(`系统消息: ${messageOf(error)}`);
    }
  }

  saveState(ctx, state, now);
  if (failures.length) ctx.log?.warn?.("部分课程没取到", failures.slice(0, 5));

  const visible = settings.hideFinished === true ? items.filter((it) => !it.done) : items;
  return {
    account,
    items: visible,
    message: failures.length ? `${failures.length} 项没取到，下次同步会再试` : undefined,
  };
}

// ---------------------------------------------------------------------------
// 各类条目
// ---------------------------------------------------------------------------

async function homeworkOf(api, course, state, now) {
  const sku = await api.skuOf(course.cid);
  if (!sku) return [];
  const leaves = await api.scoreDetail(course.cid, sku);
  const exercises = leaves.filter(
    (leaf) => leaf.leaf_type === EXERCISE_LEAF_TYPE && leaf.publish_status === 2,
  );
  const items = [];
  await runPool(exercises, 2, async (leaf) => {
    const done = exerciseDone(leaf);
    const key = `${course.cid}:${leaf.id}`;
    let cached = state.deadlines[key];
    // 已完成的不必再查截止时间：没有提醒价值，缓存里有就用，没有就不查
    if (!done && (!cached || now - cached.at > DEADLINE_TTL_MS)) {
      const dueAt = await api.leafDeadline(course.cid, leaf.id);
      cached = { dueAt, at: now };
      state.deadlines[key] = cached;
    }
    const label = EVALUATION_LABELS[leaf.evaluation_id] || "课后作业";
    const chapter = (leaf.leaf_chapter_title || "").trim();
    items.push({
      id: `homework:${course.cid}:${leaf.id}`,
      type: "homework",
      title: (leaf.leaf_level_title || label).trim(),
      course: course.name,
      category: label,
      dueAt: cached?.dueAt || null,
      done,
      summary: [label, chapter, progressText(leaf)].filter(Boolean).join(" · "),
      url: api.courseUrl(course.cid),
    });
  });
  return items;
}

async function examsOf(api, course, state, now) {
  const activities = await api.activities(course.cid);
  const exams = activities.filter((a) => a.type === ACTIVITY_EXAM && a.courseware_id);
  const items = [];
  await runPool(exams, 2, async (exam) => {
    const examId = String(exam.courseware_id);
    const key = `${course.cid}:${examId}`;
    const dueAt = toMillis(exam.deadline);
    let status = state.exams[key];
    const stale = !status || (status.done ? now - status.at > EXAM_DONE_TTL_MS : true);
    // 截止一天以上的就不再问状态了：结果不会再变，也没有提醒价值
    const expired = dueAt && dueAt < now - 24 * 60 * 60 * 1000;
    if (stale && !expired) {
      status = { ...(await api.examStatus(course.cid, examId)), at: now };
      state.exams[key] = status;
    }
    items.push({
      id: `exam:${course.cid}:${examId}`,
      type: "exam",
      title: (exam.title || "试卷").trim(),
      course: course.name,
      category: "考试",
      publishAt: toMillis(exam.create_time),
      startAt: status?.startAt || null,
      dueAt,
      done: Boolean(status?.done),
      summary: [
        status?.label,
        exam.problem_count ? `${exam.problem_count} 题` : "",
        exam.total_score ? `${exam.total_score} 分` : "",
      ].filter(Boolean).join(" · "),
      url: api.courseUrl(course.cid),
    });
  });
  return items;
}

async function announcementsOf(api, course) {
  const rows = await api.announcements(course.cid, ANNOUNCEMENT_LIMIT);
  return rows.map((row) => {
    const content = row.content || {};
    const text = htmlToText(content.text || content.app_text || "");
    return {
      id: `announcement:${course.cid}:${row.id}`,
      type: "announcement",
      title: (row.topic_name || "公告").trim(),
      course: course.name,
      category: "公告",
      publishAt: toMillis(row.app_publish_time || row.publish_time),
      done: Boolean(row.is_read),
      author: row.user_info?.name || "",
      summary: text.slice(0, 120),
      content: text.slice(0, 4000),
      url: api.courseUrl(course.cid),
    };
  });
}

async function systemMessagesOf(api) {
  const rows = await api.systemMessages();
  return rows.map((row) => {
    const text = htmlToText(row.content || "");
    return {
      id: `notice:${row.id}`,
      type: "notice",
      title: (row.title || "系统消息").trim(),
      course: "雨课堂",
      category: "系统消息",
      publishAt: toMillis(row.start_time),
      done: row.push_status !== 2,
      author: row.creator_name || "",
      summary: text.slice(0, 120),
      content: text.slice(0, 4000),
      url: typeof row.link === "string" && /^https?:/.test(row.link) ? row.link : api.homeUrl(),
    };
  });
}

// ---------------------------------------------------------------------------
// 雨课堂接口
// ---------------------------------------------------------------------------

function createApi(ctx) {
  const site = siteOf(ctx.settings);
  const base = `https://${site}`;
  let universityId = 0;

  function csrf() {
    const raw = ctx.web?.cookie ? ctx.web.cookie("csrftoken") : cookieFromDocument("csrftoken");
    return raw || "";
  }

  // v3 接口（/api/v3/…、/c27/online_courseware/…）要这一套头；少了 xtbz 会回「incorrect xtbz」，
  // 多带 x-client: app 反而一律 UNAUTHENTICATED
  function v3Headers(cid) {
    const headers = {
      xtbz: "ykt",
      "university-id": String(universityId),
      "uv-id": String(universityId),
      "Xt-Agent": "web",
      "X-Client": "web",
      "X-CSRFToken": csrf(),
    };
    if (cid != null) headers["classroom-id"] = String(cid);
    return headers;
  }

  // mooc-api 这一路学校 id 固定填 0
  function moocHeaders(cid) {
    return {
      xtbz: "ykt",
      "xt-agent": "web",
      "X-Client": "web",
      "uv-id": "0",
      "university-id": "0",
      "classroom-id": String(cid),
      "X-CSRFToken": csrf(),
    };
  }

  async function getJson(path, headers) {
    const response = await ctx.network.fetch(`${base}${path}`, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json, text/plain, */*", ...(headers || {}) },
    });
    if (response.status === 401) throw new LoginRequiredError("登录已失效");
    if (!response.ok) throw new Error(`HTTP ${response.status} ${path}`);
    const text = await response.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch (_) {
      // 未登录时部分接口直接回登录页 HTML
      if (/<html/i.test(text)) throw new LoginRequiredError("登录已失效");
      throw new Error(`返回的不是 JSON：${path}`);
    }
    if (json && (json.code === 50000 || json.msg === "UNAUTHENTICATED")) {
      throw new LoginRequiredError("登录已失效");
    }
    return json;
  }

  return {
    homeUrl: () => `${base}/v2/web/index`,
    courseUrl: (cid) => `${base}/v2/web/studentLog/${cid}`,

    async courses() {
      const json = await getJson("/v2/api/web/courses/list?identity=2");
      const list = json?.data?.list;
      if (!Array.isArray(list)) throw new LoginRequiredError("没拿到课程列表");
      const courses = list
        .filter((row) => row && row.classroom_id)
        .map((row) => ({
          cid: row.classroom_id,
          name: (row.course?.name || row.name || "课程").trim(),
          className: (row.name || "").trim(),
          term: Number(row.term) || 0,
          universityId: Number(row.course?.university_id) || 0,
          teacher: row.teacher?.name || "",
        }));
      universityId = courses.find((c) => c.universityId)?.universityId || 0;
      return courses;
    },

    // 课程列表在登录过期后还会照样回数据，靠不住；basic-info 才会老老实实回 UNAUTHENTICATED
    async account() {
      const json = await getJson("/api/v3/user/basic-info", v3Headers());
      const data = json?.data;
      if (!data || typeof data !== "object" || !data.id) throw new LoginRequiredError("没拿到账号信息");
      return {
        id: String(data.id),
        name: data.name || "",
        school: data.school || "",
        number: data.schoolNumber || "",
        avatar: data.avatar || "",
      };
    },

    async skuOf(cid) {
      const json = await getJson(`/c27/online_courseware/course/classroom/${cid}/0/sku_list/`, v3Headers(cid));
      const list = json?.data?.data_list;
      return Array.isArray(list) && list.length ? list[0].sku_id : null;
    },

    async scoreDetail(cid, sku) {
      const json = await getJson(`/c27/online_courseware/schedule/score_detail/single/${sku}/0/`, v3Headers(cid));
      const leaves = json?.data?.leaf_level_infos;
      return Array.isArray(leaves) ? leaves : [];
    },

    // 截止时间：score_deadline 优先，为 0 时按课程结课时间（和官网「未完成」一致）
    async leafDeadline(cid, leafId) {
      const json = await getJson(`/mooc-api/v1/lms/learn/leaf_info/${cid}/${leafId}/`, moocHeaders(cid));
      const data = json?.data || {};
      return toMillis(data.score_deadline) || toMillis(data.class_end_time) || null;
    },

    async activities(cid) {
      const json = await getJson(`/v2/api/web/logs/learn/${cid}?actype=-1&page=0&offset=200&sort=-1`);
      const list = json?.data?.activities;
      return Array.isArray(list) ? list : [];
    },

    // cover.result.status：0 未作答，1 答题中，4/5 已交卷，6 缺考，其余 >1 已截止
    async examStatus(cid, examId) {
      const json = await getJson(`/v/exam/cover?exam_id=${encodeURIComponent(examId)}&classroom_id=${cid}`);
      const data = json?.data || {};
      const raw = Number(data.result?.status);
      const labels = { 0: "未作答", 1: "答题中", 4: "已交卷", 5: "已交卷", 6: "缺考" };
      const label = labels[raw] || (raw > 1 ? "已截止" : "");
      return {
        done: raw === 4 || raw === 5,
        label,
        startAt: toMillis(data.start_time) || null,
      };
    },

    async announcements(cid, limit) {
      const json = await getJson(
        `/v/discussion/v2/announcements/?cid=${cid}&content=&limit=${limit}&offset=0&type=9`,
      );
      const rows = json?.data?.results;
      return Array.isArray(rows) ? rows : [];
    },

    async systemMessages() {
      const json = await getJson("/c27/online_courseware/ykt/system_message/?client_type=2");
      const rows = json?.data?.results;
      return Array.isArray(rows) ? rows : [];
    },
  };
}

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------

function siteOf(settings) {
  const site = String(settings?.site || DEFAULT_SITE).trim().toLowerCase();
  return /^[a-z0-9.-]+\.yuketang\.cn$/.test(site) ? site : DEFAULT_SITE;
}

/** 只留当前学期：课程列表里历年的课都在，全拉一遍又慢又吵 */
function pickCourses(courses, onlyCurrentTerm) {
  if (!onlyCurrentTerm) return courses;
  const latest = Math.max(0, ...courses.map((c) => c.term || 0));
  if (!latest) return courses;
  return courses.filter((c) => !c.term || c.term === latest);
}

/** 完成度以答题进度为准：「3/10」这种 schedule_detail 比 schedule 小数更准 */
function exerciseDone(leaf) {
  const detail = typeof leaf.schedule_detail === "string" ? leaf.schedule_detail : "";
  const match = /^(\d+)\s*\/\s*(\d+)$/.exec(detail.trim());
  if (match && Number(match[2]) > 0 && Number(match[1]) >= Number(match[2])) return true;
  return Number(leaf.schedule) >= 1;
}

function progressText(leaf) {
  const detail = typeof leaf.schedule_detail === "string" ? leaf.schedule_detail.trim() : "";
  if (/^\d+\s*\/\s*\d+$/.test(detail)) return `已答 ${detail.replace(/\s+/g, "")}`;
  return "";
}

/**
 * 平台的时间有三种写法：毫秒、秒、「2025-12-08 12:18:24」（北京时间）。统一成毫秒，认不出就 null。
 */
function toMillis(value) {
  if (value == null || value === "" || value === 0 || value === "0") return null;
  if (typeof value === "number" || /^\d+$/.test(String(value))) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n < 1e12 ? n * 1000 : n;
  }
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(String(value).trim());
  if (!match) return null;
  const [, y, mo, d, h = "0", mi = "0", s = "0"] = match;
  return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h) - 8, Number(mi), Number(s));
}

function htmlToText(html) {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cookieFromDocument(name) {
  const doc = globalThis.document;
  if (!doc || typeof doc.cookie !== "string") return "";
  for (const part of doc.cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

function loadState(ctx) {
  const raw = ctx.state?.get ? ctx.state.get("cache") : null;
  const state = raw && typeof raw === "object" ? raw : {};
  return {
    deadlines: state.deadlines && typeof state.deadlines === "object" ? state.deadlines : {},
    exams: state.exams && typeof state.exams === "object" ? state.exams : {},
  };
}

/** 缓存只留近两个月用过的，老课的条目别一直攒着 */
function saveState(ctx, state, now) {
  if (!ctx.state?.set) return;
  const keep = (map) => {
    const out = {};
    for (const [key, value] of Object.entries(map)) {
      if (value && now - (value.at || 0) < 60 * 24 * 60 * 60 * 1000) out[key] = value;
    }
    return out;
  };
  ctx.state.set("cache", { deadlines: keep(state.deadlines), exams: keep(state.exams) });
}

async function runPool(list, limit, worker) {
  let index = 0;
  const runners = Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (index < list.length) {
      const current = list[index++];
      await worker(current);
    }
  });
  await Promise.all(runners);
}

function messageOf(error) {
  return error && error.message ? error.message : String(error);
}

// 单测要用到的纯函数；宿主只认 checkLogin / sync
export const __test__ = { toMillis, htmlToText, exerciseDone, pickCourses, siteOf };
