// Allowlisted same-origin fetch preserves the platform session.

const DEFAULT_SITE = "changjiang.yuketang.cn";

const CONCURRENCY = 4;
const PROFILE_TIMEOUT_MS = 6000;

/** Cache per-assignment deadline lookups to avoid querying every item on each sync. */
const DEADLINE_TTL_MS = 12 * 60 * 60 * 1000;

const EXAM_DONE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Read announcement pages and retain image and attachment URLs. */
const ANNOUNCEMENT_PAGE_SIZE = 30;

const EVALUATION_LABELS = { 11: "作业", 2000: "章节测试", 12: "考试" };

const EXERCISE_LEAF_TYPE = 6;

const ACTIVITY_EXAM = 5;
const ACTIVITY_COURSEWARE = 2;
// On the student site, leaf 7 is self-study cards. Leaf 8 is a lesson,
// whose is_finished describes the class, not the student's reading progress.
const COURSEWARE_LEAF_TYPES = new Set([7, 14]);

class LoginRequiredError extends Error {}

/** Avatar URLs must work inside the host's HTTPS page. */
export function normalizeAvatarUrl(value) {
  if (typeof value !== "string") return "";
  const raw = value.trim();
  if (!raw || /[\\\u0000-\u001f]/.test(raw)) return "";
  // Root-relative images retain the authenticated site origin.
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  try {
    const url = new URL(raw.startsWith("//") ? `https:${raw}` : raw);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return "";
    url.protocol = "https:";
    return url.href;
  } catch (_) { return ""; }
}

function accountAvatar(data, account) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return "";
  const basic = data.basic_profile || {};
  const auth = data.auth || {};
  const ids = [data.user_id, data.id, basic.user_id, auth.user_id, auth.id].filter(v => v != null && v !== "");
  if (ids.some(id => String(id) !== account.id)) return "";
  const number = basic.school_number ?? basic.schoolNumber ?? data.school_number ?? data.schoolNumber;
  if (account.number && number != null && String(number).trim() !== String(account.number).trim()) return "";
  for (const fields of [basic, data, auth]) {
    for (const key of ["avatar", "picture", "profile_photo", "profilePhoto", "avatar_96"]) {
      const url = normalizeAvatarUrl(fields[key]);
      if (url) return url;
    }
  }
  return "";
}


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

// Read status is display-only in this component.
export async function performItemAction() {
  throw new Error("不支持此内容操作");
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

  const latestTerm = Math.max(0, ...courses.map((course) => course.term || 0));
  const picked = pickCourses(courses, settings.onlyCurrentTerm !== false);
  const historicalAnnouncements = settings.syncHistoricalAnnouncements !== false;
  const items = [];
  const failures = [];

  try {
    await runPool(picked, CONCURRENCY, async (course) => {
      const jobs = [];
      if (settings.syncHomework !== false) jobs.push(homeworkOf(api, course, state, now));
      if (settings.syncHomework !== false) jobs.push(coursewareOf(api, course, state, now, failures));
      if (settings.syncExam !== false) jobs.push(examsOf(api, course, state, now));
      if (settings.syncAnnouncement !== false &&
          (historicalAnnouncements || picked.includes(course))) jobs.push(announcementsOf(api, course));
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

  // Archive courses supply announcements only; current-term tasks retain priority.
  if (settings.syncAnnouncement !== false && historicalAnnouncements) {
    const oldCourses = courses.filter((course) => !picked.includes(course));
    try {
      await runPool(oldCourses, CONCURRENCY, async (course) => {
        try {
          items.push(...(await announcementsOf(api, course)).map((item) => ({ ...item, historical: true })));
        } catch (error) {
          if (error instanceof LoginRequiredError) throw error;
          failures.push(`${course.name}: ${messageOf(error)}`);
        }
      });
    } catch (error) {
      if (error instanceof LoginRequiredError) return { loginRequired: true };
      throw error;
    }
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


async function homeworkOf(api, course, state, now) {
  const leaves = await api.taskLeaves(course.cid);
  const exercises = leaves.filter(
    (leaf) => leaf.leaf_type === EXERCISE_LEAF_TYPE && leaf.publish_status === 2,
  );
  const items = [];
  await runPool(exercises, 2, async (leaf) => {
    const done = exerciseDone(leaf);
    const key = `${course.cid}:${leaf.id}`;
    let cached = state.deadlines[key];
    if (!cached || now - cached.at > DEADLINE_TTL_MS) {
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
      historical: false,
    });
  });
  return items;
}

async function coursewareOf(api, course, state, now, failures) {
  const sources = await Promise.allSettled([api.activities(course.cid), api.taskLeaves(course.cid)]);
  const rows = sources.map((result) => {
    if (result.status === "fulfilled") return result.value;
    if (result.reason instanceof LoginRequiredError) throw result.reason;
    failures.push(`${course.name}: ${messageOf(result.reason)}`);
    return [];
  });
  const byResource = new Map();
  for (const row of rows[0]) {
    const resource = resourceId(row.courseware_id);
    if (Number(row.type) !== ACTIVITY_COURSEWARE || !resource) continue;
    byResource.set(resource, { activity: row });
  }
  const leaves = rows[1].filter((leaf) =>
    COURSEWARE_LEAF_TYPES.has(Number(leaf.leaf_type)) && Number(leaf.publish_status) === 2,
  );
  await runPool(leaves, 2, async (leaf) => {
    const key = `${course.cid}:${leaf.id}`;
    let metadata = state.courseware[key];
    try {
      if (!metadata || now - metadata.at > DEADLINE_TTL_MS) {
        metadata = { ...(await api.coursewareLeaf(course.cid, leaf.id)), at: now };
        if (!metadata.resource) throw new Error("课件资源 ID 缺失");
        state.courseware[key] = metadata;
      }
      if (!metadata.resource) throw new Error("课件资源 ID 缺失");
      byResource.set(metadata.resource, { ...byResource.get(metadata.resource), leaf, metadata });
    } catch (error) {
      if (error instanceof LoginRequiredError) throw error;
      // A failed chapter lookup must not discard the direct self-study cards.
      failures.push(`${course.name}: ${messageOf(error)}`);
    }
  });
  return [...byResource].map(([resource, { activity, leaf, metadata }]) => {
    const explicitDone = activity?.view?.done;
    const done = explicitDone != null ? flag(explicitDone) : coursewareDone(leaf);
    const depth = Number(activity?.view?.depth), count = Number(activity?.count);
    const progress = Number.isFinite(depth) && depth >= 0 && count > 0
      ? `已阅读 ${Math.min(depth, count)}/${count} 页` : "";
    const dueAt = toMillis(activity?.end) || toMillis(activity?.deadline) || metadata?.dueAt || null;
    return {
      id: `courseware:${course.cid}:${resource}`,
      type: "homework",
      title: String(activity?.title || leaf?.leaf_level_title || "课件").trim(),
      course: course.name,
      category: "课件",
      publishAt: toMillis(activity?.create_time) || toMillis(leaf?.advance_release_time) || metadata?.publishAt || null,
      dueAt,
      done,
      summary: ["课件", leaf?.leaf_chapter_title?.trim(), progress, done ? "已读完" : "待阅读",
        dueAt ? "" : "未设截止时间"].filter(Boolean).join(" · "),
      url: api.courseUrl(course.cid),
      historical: false,
    };
  });
}

function flag(value) { return value === true || value === 1 || value === "1"; }

function coursewareDone(leaf) {
  return Number(leaf?.schedule) >= 1 || leaf?.schedule === "已完成";
}

function resourceId(value) {
  if (typeof value === "string") return /^\d+$/.test(value) && !/^0+$/.test(value) ? value : "";
  return Number.isSafeInteger(value) && value > 0 ? String(value) : "";
}

async function examsOf(api, course, state, now) {
  const activities = await api.activities(course.cid);
  const exams = activities.filter((a) => a.type === ACTIVITY_EXAM && a.courseware_id);
  const items = [];
  await runPool(exams, 2, async (exam) => {
    const examId = String(exam.courseware_id);
    const key = `${course.cid}:${examId}`;
    const listedDueAt = toMillis(exam.deadline);
    let status = state.exams[key];
    const stale = !status || (!listedDueAt && status.deadlineChecked !== true) ||
      (status.done ? now - status.at > EXAM_DONE_TTL_MS : true);
    const expired = listedDueAt && listedDueAt < now - 24 * 60 * 60 * 1000;
    if (stale && !expired) {
      status = { ...(await api.examStatus(course.cid, examId)), at: now, deadlineChecked: true };
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
      dueAt: listedDueAt || status?.dueAt || null,
      done: Boolean(status?.done),
      summary: [
        status?.label,
        exam.problem_count ? `${exam.problem_count} 题` : "",
        exam.total_score ? `${exam.total_score} 分` : "",
      ].filter(Boolean).join(" · "),
      url: api.courseUrl(course.cid),
      historical: false,
    });
  });
  return items;
}

async function announcementsOf(api, course) {
  const rows = await api.announcements(course.cid);
  return rows.filter((row) => row && row.id != null).map((row) => {
    const assets = noticeContent(row.content, api.courseUrl(course.cid), row);
    return {
      id: `announcement:${course.cid}:${row.id}`,
      type: "announcement",
      title: String(row.topic_name || "公告").trim() || "公告",
      course: course.name,
      category: "公告",
      publishAt: toMillis(row.app_publish_time || row.publish_time),
      done: row.is_read === true || row.is_read === 1 || row.is_read === "1",
      author: row.user_info?.name || "",
      summary: assets.text.slice(0, 160),
      content: assets.text,
      images: assets.images,
      attachments: assets.attachments,
      url: api.courseUrl(course.cid),
      historical: false,
    };
  });
}

async function systemMessagesOf(api) {
  const rows = await api.systemMessages();
  return rows.map((row) => {
    const assets = noticeContent(row.content, api.homeUrl(), row);
    const text = assets.text;
    return {
      id: `notice:${row.id}`,
      type: "notice",
      title: (row.title || "系统消息").trim(),
      course: "雨课堂",
      category: "系统消息",
      publishAt: toMillis(row.start_time),
      done: row.push_status !== 2 && row.push_status !== "2",
      author: row.creator_name || "",
      summary: text.slice(0, 160),
      content: text,
      images: assets.images,
      attachments: assets.attachments,
      url: typeof row.link === "string" && /^https?:/.test(row.link) ? row.link : api.homeUrl(),
      historical: false,
    };
  });
}


function createApi(ctx) {
  const site = siteOf(ctx.settings);
  const base = `https://${site}`;
  let universityId = 0;
  // Shared only within this sync. Reading progress must refresh on the next run.
  const activityRequests = new Map();
  const taskRequests = new Map();

  function csrf() {
    const raw = ctx.web?.cookie ? ctx.web.cookie("csrftoken") : cookieFromDocument("csrftoken");
    return raw || "";
  }

  // These endpoint families require xtbz; x-client: app selects an incompatible authentication path.
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

  async function getJson(path, headers, timeoutMs = 0) {
    const controller = timeoutMs ? new AbortController() : null;
    let timedOut = false;
    const timer = controller ? setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs) : null;
    try {
      const response = await ctx.network.fetch(`${base}${path}`, {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json, text/plain, */*", ...(headers || {}) },
        ...(controller ? { signal: controller.signal } : {}),
      });
      if (response.status === 401) throw new LoginRequiredError("登录已失效");
      if (!response.ok) throw new Error(`HTTP ${response.status} ${path}`);
      const text = await response.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch (_) {
        if (/<html/i.test(text)) throw new LoginRequiredError("登录已失效");
        throw new Error(`返回的不是 JSON：${path}`);
      }
      if (json && (json.code === 50000 || json.msg === "UNAUTHENTICATED")) {
        throw new LoginRequiredError("登录已失效");
      }
      return json;
    } catch (error) {
      if (timedOut) throw new Error("头像资料读取超时");
      throw error;
    } finally { if (timer != null) clearTimeout(timer); }
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

    // Course lists may survive session expiry; basic-info is the authoritative login check.
    async account() {
      const json = await getJson("/api/v3/user/basic-info", v3Headers());
      const data = json?.data;
      if (!data || typeof data !== "object" || !data.id) throw new LoginRequiredError("没拿到账号信息");
      const account = {
        id: String(data.id),
        name: data.name || "",
        school: data.school || "",
        number: data.schoolNumber || "",
        avatar: "",
      };
      account.avatar = accountAvatar(data, account);
      // The profile endpoint supplies the current avatar even when basic-info omits it
      // or retains a default image. Older sites fall back to the web profile.
      for (const path of ["/mobile-app/api/user/profile", "/api/web_lesson/user_info/"]) {
        try {
          const profile = await getJson(path, v3Headers(), PROFILE_TIMEOUT_MS);
          if (profile?.success === false || [profile?.code, profile?.errcode].some(code => code != null && String(code) !== "0")) continue;
          const avatar = accountAvatar(profile?.data, account);
          if (avatar) return { ...account, avatar };
        } catch (error) {
          if (error?.name === "AbortError") throw error;
          // An optional profile failure does not invalidate the v3-verified session.
        }
      }
      return account;
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

    taskLeaves(cid) {
      if (!taskRequests.has(cid)) taskRequests.set(cid, (async () => {
        const sku = await this.skuOf(cid);
        return sku ? this.scoreDetail(cid, sku) : [];
      })());
      return taskRequests.get(cid);
    },

    async coursewareLeaf(cid, leafId) {
      const json = await getJson(`/mooc-api/v1/lms/learn/leaf_info/${cid}/${leafId}/`, moocHeaders(cid));
      const data = json?.data || {};
      return {
        resource: resourceId(data.content_info?.leaf_type_id),
        // Chapter lists can substitute class_end_time here. The leaf detail has
        // the teacher's actual deadline; zero means no courseware deadline.
        dueAt: toMillis(data.score_deadline),
        publishAt: toMillis(data.publish_time),
      };
    },

    // Prefer score_deadline, falling back to course completion when zero.
    async leafDeadline(cid, leafId) {
      const json = await getJson(`/mooc-api/v1/lms/learn/leaf_info/${cid}/${leafId}/`, moocHeaders(cid));
      const data = json?.data || {};
      return toMillis(data.score_deadline) || toMillis(data.class_end_time) || null;
    },

    activities(cid) {
      if (!activityRequests.has(cid)) activityRequests.set(cid, (async () => {
        const json = await getJson(`/v2/api/web/logs/learn/${cid}?actype=-1&page=0&offset=200&sort=-1`);
        const list = json?.data?.activities;
        return Array.isArray(list) ? list : [];
      })());
      return activityRequests.get(cid);
    },

    // Cover statuses distinguish unanswered, active, submitted and expired attempts.
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
        dueAt: toMillis(data.deadline) || null,
      };
    },

    async announcements(cid) {
      const rows = [];
      const seen = new Set();
      let offset = 0;
      while (true) {
        const json = await getJson(
          `/v/discussion/v2/announcements/?cid=${cid}&content=&limit=${ANNOUNCEMENT_PAGE_SIZE}&offset=${offset}&type=9`,
        );
        const data = json?.data;
        const page = data?.results;
        if (!Array.isArray(page)) throw new Error("公告列表格式不正确");
        let added = 0;
        for (const row of page) {
          if (row?.id == null || seen.has(String(row.id))) continue;
          seen.add(String(row.id));
          rows.push(row);
          added++;
        }
        offset += page.length;
        const total = Number(data.count ?? data.total);
        if (!page.length || !added || (Number.isFinite(total) && offset >= total)) break;
        if (!data.next && page.length < ANNOUNCEMENT_PAGE_SIZE) break;
      }
      return rows;
    },

    async systemMessages() {
      const json = await getJson("/c27/online_courseware/ykt/system_message/?client_type=2");
      const rows = json?.data?.results;
      return Array.isArray(rows) ? rows : [];
    },
  };
}


function siteOf(settings) {
  const site = String(settings?.site || DEFAULT_SITE).trim().toLowerCase();
  return /^[a-z0-9.-]+\.yuketang\.cn$/.test(site) ? site : DEFAULT_SITE;
}

/** Limit task synchronization to the latest term. */
function pickCourses(courses, onlyCurrentTerm) {
  if (!onlyCurrentTerm) return courses;
  const latest = Math.max(0, ...courses.map((c) => c.term || 0));
  if (!latest) return courses;
  return courses.filter((c) => !c.term || c.term === latest);
}

/** Prefer explicit answered/total progress over fractional schedule values. */
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
 * Normalize seconds, milliseconds or platform wall time to milliseconds; null when
 * unrecognized.
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

/** Retain text, uploaded images and attachments separately; accept readable web URLs only. */
function noticeContent(raw, base, row = {}) {
  let content = raw;
  if (typeof raw === "string" && /^\s*\{/.test(raw)) {
    try { content = JSON.parse(raw); } catch (_) {   }
  }
  const obj = content && typeof content === "object" ? content : {};
  const html = typeof content === "string" ? content : String(obj.text || obj.app_text || "");
  const images = [];
  const attachments = [];
  const imageUrls = new Set();
  const fileUrls = new Set();
  const addImage = (rawImage) => {
    const value = typeof rawImage === "string" ? { url: rawImage } : rawImage || {};
    const url = assetUrl(value.url || value.file_url || value.src || value.image_url, base);
    if (!url || imageUrls.has(url)) return;
    imageUrls.add(url);
    images.push({ url, name: String(value.name || value.alt || "") });
  };
  const addAttachment = (rawFile) => {
    const value = typeof rawFile === "string" ? { url: rawFile } : rawFile || {};
    const url = assetUrl(value.file_url || value.url || value.download_url || value.href, base);
    if (!url || fileUrls.has(url)) return;
    fileUrls.add(url);
    let inferredName = "";
    try { inferredName = decodeURIComponent(new URL(url).pathname.split("/").pop() || ""); } catch (_) {}
    const size = Number(value.file_size ?? value.size);
    attachments.push({
      url,
      name: String(value.file_name || value.name || value.filename || inferredName || "附件"),
      type: String(value.file_type || value.type || value.mime_type || "").toLowerCase(),
      size: Number.isFinite(size) && size > 0 ? Math.trunc(size) : null,
    });
  };
  const values = (value) => Array.isArray(value) ? value : value ? [value] : [];
  for (const source of [obj, row]) {
    for (const key of ["upload_images", "images", "image_list"]) values(source[key]).forEach(addImage);
    for (const key of ["accessory_list", "attachments", "file_list"]) values(source[key]).forEach(addAttachment);
  }
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    addImage({ url: htmlAttribute(match[0], "data-src") || htmlAttribute(match[0], "src"), alt: htmlAttribute(match[0], "alt") });
  }
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const url = htmlAttribute(match[0].slice(0, match[0].indexOf(">") + 1), "href");
    const parsed = assetUrl(url, base);
    const fileLink = parsed && /\.(pdf|docx?|xlsx?|pptx?|zip|rar|7z|txt|csv|jpe?g|png|gif|webp|mp[34]|wav|ogg)(?:$|[?#])/i.test(parsed);
    if (fileLink || /\bdownload(?:\s|=|>)/i.test(match[1])) addAttachment({ url, name: htmlToText(match[2]) });
  }
  return { text: htmlToText(html), images, attachments };
}

function assetUrl(value, base) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(decodeHtml(value.trim()), base);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return "";
    // Use HTTPS for media to avoid cleartext blocking.
    url.protocol = "https:";
    return url.href;
  } catch (_) { return ""; }
}

function htmlAttribute(tag, name) {
  const match = new RegExp(`(?:\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return decodeHtml(match ? (match[1] ?? match[2] ?? match[3] ?? "") : "");
}

function decodeHtml(text) {
  return String(text || "")
    .replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (_, n) => {
      const code = n[0].toLowerCase() === "x" ? parseInt(n.slice(1), 16) : Number(n);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    })
    .replace(/&nbsp;/gi, " ").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&apos;|&#39;/gi, "'").replace(/&amp;/gi, "&");
}

function htmlToText(html) {
  return decodeHtml(String(html || "")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<!--[^]*?-->/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d|tr)>/gi, "\n")
    .replace(/<\/td>/gi, "\t")
    .replace(/<[^>]+>/g, ""))
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
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
    courseware: state.courseware && typeof state.courseware === "object" ? state.courseware : {},
  };
}

/** Prune cache entries unused for two months. */
function saveState(ctx, state, now) {
  if (!ctx.state?.set) return;
  const keep = (map) => {
    const out = {};
    for (const [key, value] of Object.entries(map)) {
      if (value && now - (value.at || 0) < 60 * 24 * 60 * 60 * 1000) out[key] = value;
    }
    return out;
  };
  ctx.state.set("cache", { deadlines: keep(state.deadlines), exams: keep(state.exams), courseware: keep(state.courseware) });
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

// Expose pure helpers for tests alongside runtime entry exports.
export const __test__ = { toMillis, htmlToText, exerciseDone, pickCourses, siteOf, noticeContent, assetUrl };
