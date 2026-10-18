import test from "node:test";
import assert from "node:assert/strict";
import {
  checkLogin,
  createSessionTokens,
  headerValue,
  parseSetCookie,
  __test__,
} from "../plugin-packages/yuketang-notice/main.js";
import { sessionFetch } from "../plugin-packages/yuketang-notice/ui/session-network.js";

const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

/* ------------------------------- primitives ------------------------------- */

test("headerValue：Headers、数组和普通对象都能按大小写无关读取", () => {
  assert.equal(headerValue(new Headers({ "Set-Auth": "abc" }), "set-auth"), "abc");
  assert.equal(headerValue([["Set-Auth", "abc"]], "SET-AUTH"), "abc");
  assert.equal(headerValue({ "set-auth": "abc" }, "Set-Auth"), "abc");
  assert.equal(headerValue(null, "set-auth"), "");
  assert.equal(headerValue({}, "set-auth"), "");
});

test("parseSetCookie：逗号分隔多个 cookie，但 Expires 里的逗号不算分隔", () => {
  const one = parseSetCookie(
    "csrftoken=aaa; Path=/; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Secure; HttpOnly",
  );
  assert.deepEqual(one, [{ name: "csrftoken", value: "aaa" }]);

  const many = parseSetCookie(
    "csrftoken=aaa; Path=/, sessionid=bbb; Path=/; Expires=Wed, 21 Oct 2026 07:28:00 GMT",
  );
  assert.deepEqual(many, [
    { name: "csrftoken", value: "aaa" },
    { name: "sessionid", value: "bbb" },
  ]);
  assert.deepEqual(parseSetCookie(""), []);
  assert.deepEqual(parseSetCookie(null), []);
});

/* ------------------------------- rotation -------------------------------- */

test("Set-Auth 轮换 token，后续请求自动带上 Bearer", () => {
  const session = createSessionTokens();
  assert.equal(session.headers().Authorization, undefined);

  session.absorbHeaders(new Headers({ "Set-Auth": "fresh-1" }));
  assert.equal(session.headers().Authorization, "Bearer fresh-1");

  // 平台有时已经带了 scheme，不能拼成 Bearer Bearer。
  session.absorbHeaders({ "set-auth": "Bearer fresh-2" });
  assert.equal(session.headers().Authorization, "Bearer fresh-2");
  assert.equal(session.revision, 2);
});

test("轮换后的凭据覆盖调用方传入的过期值", () => {
  const session = createSessionTokens({ auth: "old", csrf: "old-csrf" });
  session.absorbHeaders({ "set-auth": "new", "set-cookie": "csrftoken=new-csrf; Path=/" });
  const headers = session.headers({ Authorization: "Bearer stale", "X-CSRFToken": "stale-csrf", xtbz: "ykt" });
  assert.equal(headers.Authorization, "Bearer new");
  assert.equal(headers["X-CSRFToken"], "new-csrf");
  assert.equal(headers.xtbz, "ykt");
});

test("csrftoken 删除通知不会被旧值掩盖", () => {
  const session = createSessionTokens({ csrf: "abc" });
  assert.equal(session.csrf(), "abc");
  session.absorbSetCookie("csrftoken=; Path=/; Max-Age=0");
  assert.equal(session.csrf(), "");
  assert.equal(session.headers()["X-CSRFToken"], undefined);
  // 宿主 cookie 只作为兜底，删掉之后不能复活旧值。
  assert.equal(session.csrf("host-value"), "host-value");
});

test("absorbResponse 兼容 setAuth/setCookie 字段与 Headers", () => {
  const session = createSessionTokens();
  assert.equal(session.absorbResponse(null), false);
  assert.equal(
    session.absorbResponse({ headers: { "set-auth": "t1" }, setCookie: "sessionid=s1; Path=/" }),
    true,
  );
  assert.equal(session.auth, "t1");
  assert.equal(session.cookie("sessionid"), "s1");
  // 没有变化时不递增版本号，避免无意义的重渲染。
  assert.equal(session.absorbResponse({ headers: {} }), false);
  assert.equal(session.revision, 1);
  session.reset();
  assert.equal(session.auth, "");
  assert.equal(session.cookie("sessionid"), "");
});

test("换站点时先清掉内存里的旧凭据，再尝试恢复新站点的副本", () => {
  let stored = { identity: "changjiang.yuketang.cn", auth: "cj-token", csrf: "cj-csrf", cookies: {} };
  const session = createSessionTokens({}, { identity: "changjiang.yuketang.cn", load: () => stored, save: (v) => { stored = v; } });
  assert.equal(session.auth, "cj-token");

  // 切到另一个站点：旧 token 不能留在内存里等下一个请求带走。
  session.setIdentity("pro.yuketang.cn");
  assert.equal(session.auth, "");
  assert.equal(session.headers().Authorization, undefined);

  // 新站点没有存过副本，所以仍然没有凭据。
  session.setIdentity("huanghe.yuketang.cn");
  assert.equal(session.auth, "");
});

test("页面尚未发请求时采纳已存副本的站点，不会把自己的副本判成异站", () => {
  const stored = { identity: "changjiang.yuketang.cn", auth: "saved", csrf: "saved-csrf", cookies: {} };
  const session = createSessionTokens({}, { load: () => stored, save: () => {} });
  assert.equal(session.auth, "saved");
  assert.equal(session.identity, "changjiang.yuketang.cn");
  // 同一个站点再设一次不重复清空。
  assert.equal(session.setIdentity("changjiang.yuketang.cn"), false);
  assert.equal(session.auth, "saved");
});

/* ------------------------------ integration ------------------------------ */

function makeCtx(routes, { settings = {} } = {}) {
  const calls = [];
  return {
    calls,
    settings,
    now: () => Date.UTC(2026, 8, 29, 4, 0, 0),
    state: { get: () => null, set: () => {} },
    web: { cookie: (name) => (name === "csrftoken" ? "csrf-0" : "") },
    log: { warn() {}, info() {}, error() {} },
    network: {
      async fetch(url, init) {
        const headers = { ...(init?.headers || {}) };
        calls.push({ url, headers });
        const path = url.replace(/^https:\/\/[^/]+/, "");
        const key = Object.keys(routes).find((prefix) => path.startsWith(prefix));
        if (!key) return { status: 404, ok: false, headers: {}, text: async () => "not found" };
        const body = routes[key];
        if (typeof body === "function") return body(path, headers);
        return { status: 200, ok: true, headers: {}, text: async () => JSON.stringify(body) };
      },
    },
  };
}

const COURSES = { data: { list: [{ classroom_id: 101, name: "班", term: 202601, course: { name: "课", university_id: 2797 } }] } };
const BASIC = { code: 0, data: { id: 10001, name: "小明", school: "示例大学", schoolNumber: "2024001" } };

test("一次登录校验里，前一个响应轮换的 token 会被后续请求复用", async () => {
  const ctx = makeCtx({
    "/v2/api/web/courses/list": () => ({
      status: 200, ok: true,
      // 平台在普通响应里续期，没有独立的刷新接口。
      headers: { "set-auth": "Bearer rotated", "set-cookie": "csrftoken=csrf-1; Path=/" },
      text: async () => JSON.stringify(COURSES),
    }),
    "/api/v3/user/basic-info": BASIC,
  });
  const result = await checkLogin(ctx);
  assert.equal(result.loggedIn, true);

  const basic = ctx.calls.find((c) => c.url.includes("/api/v3/user/basic-info"));
  assert.equal(basic.headers.Authorization, "Bearer rotated");
  assert.equal(basic.headers["X-CSRFToken"], "csrf-1");
  assert.equal(basic.headers.xtbz, "ykt");
});

test("轮换后的凭据写入 ctx.state，下次同步可继续使用", async () => {
  const store = {};
  const ctx = makeCtx(
    {
      "/v2/api/web/courses/list": () => ({
        status: 200, ok: true,
        headers: { "set-auth": "secret-token", "set-cookie": "csrftoken=csrf-1; Path=/" },
        text: async () => JSON.stringify(COURSES),
      }),
      "/api/v3/user/basic-info": BASIC,
    },
  );
  ctx.state = { get: (key) => store[key] ?? null, set: (key, value) => { store[key] = value; } };
  await checkLogin(ctx);

  assert.equal(store.session?.auth, "secret-token");
  assert.equal(store.session?.csrf, "csrf-1");
  assert.equal(store.session?.identity, "changjiang.yuketang.cn");

  // 下一次同步是新的 JS 上下文，只能靠持久化副本续上。
  const next = makeCtx({ "/v2/api/web/courses/list": COURSES, "/api/v3/user/basic-info": BASIC });
  next.state = { get: (key) => store[key] ?? null, set: (key, value) => { store[key] = value; } };
  await checkLogin(next);
  const basic = next.calls.find((c) => c.url.includes("/api/v3/user/basic-info"));
  assert.equal(basic.headers.Authorization, "Bearer secret-token");
  assert.equal(basic.headers["X-CSRFToken"], "csrf-1");
});

test("切站点后不复用上一个学校的会话", async () => {
  const store = {
    session: { identity: "changjiang.yuketang.cn", auth: "changjiang-token", csrf: "c1", cookies: {} },
  };
  const ctx = makeCtx(
    { "/v2/api/web/courses/list": COURSES, "/api/v3/user/basic-info": BASIC },
    { settings: { site: "pro.yuketang.cn" } },
  );
  ctx.state = { get: (key) => store[key] ?? null, set: (key, value) => { store[key] = value; } };
  await checkLogin(ctx);
  const basic = ctx.calls.find((c) => c.url.includes("/api/v3/user/basic-info"));
  assert.equal(basic.headers.Authorization, undefined, "不能把长江的 token 发到荷塘");
});

test("登录失效时丢掉持久化副本，下次不会拿死 token 重试", async () => {
  const store = { session: { identity: "changjiang.yuketang.cn", auth: "dead", csrf: "c", cookies: {} } };
  const ctx = makeCtx({
    "/v2/api/web/courses/list": COURSES,
    "/api/v3/user/basic-info": { code: 50000, msg: "UNAUTHENTICATED", data: "" },
  });
  ctx.state = { get: (key) => store[key] ?? null, set: (key, value) => { store[key] = value; } };
  const result = await checkLogin(ctx);
  assert.deepEqual(result, { loggedIn: false });
  assert.equal(store.session, null);
});

test("sessionFetch 把原生桥回传的轮换凭据接进下一次请求", async () => {
  const calls = [];
  let rotate = true;
  const sdk = {
    capabilities: { sessionFetch: true },
    request: async (command, payload) => {
      calls.push([command, payload]);
      if (command !== "network.session.fetch") return true;
      const result = { status: 200, body: "{}", contentType: "application/json" };
      if (rotate) { result.setAuth = "Bearer bridged"; result.setCookie = "csrftoken=csrf-b"; rotate = false; }
      return result;
    },
  };
  const fetch = sessionFetch(sdk);
  await fetch("https://changjiang.yuketang.cn/one");
  await flush();
  await fetch("https://changjiang.yuketang.cn/two");

  const [, first] = calls.find(([c]) => c === "network.session.fetch");
  const second = calls.filter(([c]) => c === "network.session.fetch")[1][1];
  assert.equal(first.headers.Authorization, undefined, "第一次请求还没有 token");
  assert.equal(second.headers.Authorization, "Bearer bridged");
  assert.equal(second.headers["X-CSRFToken"], "csrf-b");
});

test("sessionFetch 在没有原生桥时退回普通 fetch", () => {
  const fallback = () => "fallback";
  assert.equal(sessionFetch({ capabilities: {} }, fallback), fallback);
  assert.equal(sessionFetch(undefined, fallback), fallback);
});

test("__test__ 导出保留原有纯函数，方便回归", () => {
  assert.equal(typeof __test__.toMillis, "function");
  assert.equal(typeof __test__.siteOf, "function");
});
