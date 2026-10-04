// 登录协议随组件包更新；宿主仅提供通用 Cookie 读取和会话校验。
export const SITES = ['changjiang.yuketang.cn', 'www.yuketang.cn', 'huanghe.yuketang.cn', 'pro.yuketang.cn'];
export const CAPTCHA_APP_ID = '2091064951';
/** 扫码登录服务：/wsapp/ 上跑的是学堂在线协议，二维码 60 秒一换 */
export const QR_WS_PATH = '/wsapp/';
/** 服务端没给有效期时的保守值；实测 WS 返回 60 秒 */
export const QR_DEFAULT_SECONDS = 60;

export function requireSuccess(result, web, fallback) {
  const ok = web ? result.success === true
    : result.success !== false && String(result.code) === '0';
  if (!ok) throw new Error(result.msg || result.message || fallback);
}

export class RainLoginClient {
  constructor({site, fetch, cookie, now = Date.now}) {
    if (!SITES.includes(site)) throw new Error('不支持的雨课堂站点');
    this.site = site; this.fetch = fetch; this.cookie = cookie; this.now = now;
    this.origin = `https://${site}`; this.prepared = false; this.mobileForCode = null;
    this.calls = new Set();
    this.loginUrl = `${this.origin}/web?next=%2Fv2%2Fweb%2Findex&type=3`;
  }
  endpoint(path) {
    if (!path.startsWith('/') || path.startsWith('//')) throw new Error('登录接口路径无效');
    const url = new URL(path, this.origin);
    if (url.origin !== this.origin) throw new Error('登录接口超出当前站点');
    return url.href;
  }
  async request(path, body = null, {json = true, universityId = '0', timeoutMs = 20000} = {}) {
    const controller = new AbortController(); this.calls.add(controller);
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      const csrf = await this.cookie('csrftoken') || '';
      const response = await this.fetch(this.endpoint(path), {
        method: body ? 'POST' : 'GET', credentials: 'include', signal: controller.signal,
        referrer: this.loginUrl, referrerPolicy: 'same-origin',
        headers: {'Accept': 'application/json, text/plain, */*', 'Content-Type': 'application/json',
          'X-CSRFToken': csrf, 'xtbz': 'ykt', 'X-Client': 'web', 'Xt-Agent': 'web',
          'university-id': universityId, 'uv-id': universityId},
        ...(body ? {body: JSON.stringify(body)} : {}),
      });
      if (!response.ok) {
        // 雨课堂的错误也是 JSON（如 400 + {"code":50400,"msg":"BAD_REQUEST"}）：
        // 直接说「HTTP 400」对用户没有任何意义，能读到 msg 就带上。
        const detail = await response.text().catch(() => '');
        let message = '';
        try {
          const parsed = JSON.parse(detail);
          message = parsed?.msg || parsed?.message || '';
        } catch { message = ''; }
        throw new Error(message && message !== 'BAD_REQUEST'
          ? `雨课堂登录请求失败（HTTP ${response.status}：${message}）`
          : `雨课堂登录请求失败（HTTP ${response.status}）`);
      }
      if (!json) return {};
      const result = await response.json();
      if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('雨课堂返回的登录数据无法识别');
      return result;
    } catch (error) {
      if (timedOut) throw new Error('请求超时，请检查网络后重试');
      if (error.name === 'TypeError') throw new Error('网络连接失败，请检查网络后重试');
      throw error;
    } finally { clearTimeout(timeout); this.calls.delete(controller); }
  }
  async prepare() {
    if (this.prepared) return;
    await this.request('/web?next=%2Fv2%2Fweb%2Findex&type=3', null, {json: false});
    this.prepared = true;
  }
  async sendSms(mobile, proof) {
    if (!/^1\d{10}$/.test(mobile)) throw new Error('请输入正确的手机号');
    if (!proof?.ticket?.trim() || proof.ticket.length > 4096 || !proof.randstr?.trim() || proof.randstr.length > 1024) {
      throw new Error('请先完成官方安全验证');
    }
    await this.prepare();
    const result = await this.request('/pc/login/send_sms_login_code/', {
      mobile, login: true, ticket: proof.ticket, randstr: proof.randstr, hcaptcha_token: '',
    });
    requireSuccess(result, true, '短信验证码发送失败');
    this.mobileForCode = mobile;
  }
  async loginSms(code) {
    if (!this.mobileForCode) throw new Error('请先获取短信验证码');
    if (!/^\d{4,8}$/.test(code)) throw new Error('请输入正确的短信验证码');
    const result = await this.request('/pc/login/verify_pwd_login/', {type: 'PC', name: this.mobileForCode, pwd: code});
    requireSuccess(result, true, '短信登录失败，请检查验证码');
    // 账号有效性统一交给组件入口 checkLogin 校验，不在这里重复打开账号接口。
    return result;
  }
  async createQr() {
    await this.prepare();
    const result = await this.request('/api/v3/user/login/app-web-pre-info');
    requireSuccess(result, false, '二维码获取失败');
    const data = result.data || {};
    if (!data.qrContent || !data.token) throw new Error('雨课堂没有返回有效二维码');
    const url = new URL(data.qrContent);
    if (url.protocol !== 'https:' || ![this.site, 'mp.weixin.qq.com'].includes(url.hostname)) throw new Error('二维码地址无效');
    // 接口没给 expire_seconds 时按 60 秒算：token 的 JWT exp 就是签发后 300 秒，
    // 但二维码本身远短于它，按 180 秒算会让用户以为还有时间、其实早过期了。
    const seconds = Math.max(30, Math.min(300, Number(data.expire_seconds) || QR_DEFAULT_SECONDS));
    return {content: data.qrContent, token: data.token, expiresAt: this.now() + seconds * 1000};
  }
  /**
   * 等微信扫码确认。服务端在没人扫码时会一直挂着长轮询，token 过期后立刻回 400，
   * 所以这里遇到过期/失效就换一张码继续等，而不是直接报错——否则用户扫完
   * 只会看到一句「请求失败（HTTP 400）」，像是没反应。
   */
  async confirmQr(challenge, {onRotate} = {}) {
    let current = challenge;
    for (let attempt = 0; attempt < 3; attempt++) {
      const remaining = current.expiresAt - this.now();
      if (remaining <= 0) {
        if (attempt === 2) throw new Error('二维码多次过期，请点「刷新二维码」重试');
        current = await this.createQr();
        onRotate?.(current);
        continue;
      }
      let result;
      try {
        result = await this.request('/api/v3/user/login/app-web-login', {token: current.token}, {timeoutMs: remaining});
      } catch (error) {
        // token 失效 / 过期：换一张码重新等，不把它当成失败
        if (/HTTP 400|HTTP 401|HTTP 403/.test(error.message || '')) {
          if (attempt === 2) throw new Error('二维码已失效，请点「刷新二维码」重试');
          current = await this.createQr();
          onRotate?.(current);
          continue;
        }
        throw error;
      }
      const data = result.data || {}, userId = data.UserID ?? data.user_id, auth = data.Auth ?? data.auth;
      if (userId == null || !auth) {
        // 没人扫码时正常返回 {code:0,data:null}：继续等下一轮
        if (attempt === 2) throw new Error('未收到扫码确认，请重新扫码');
        continue;
      }
      // 拿到 UserID/Auth 后必须换到 sessionid，否则后续同步全是未登录
      await this.establishSession(userId, auth);
      return {userId, auth};
    }
    throw new Error('未收到扫码确认，请重新扫码');
  }

  /** {UserID,Auth} 换取网页会话 Cookie（sessionid）；/pc/web_login 走的是网页登录分支 */
  async establishSession(userId, auth) {
    await this.prepare();
    const result = await this.request('/pc/web_login', {UserID: userId, Auth: auth}, {json: false});
    // 这个接口可能不回 JSON，真正的判据是 CookieManager 里有没有 sessionid
    void result;
    if (!await this.cookie('sessionid')) throw new Error('未能建立网页登录会话，请重试');
  }

  /** 这个站点上扫码登录服务的 WebSocket 地址 */
  qrSocketUrl() {
    return `wss://${this.site}${QR_WS_PATH}`;
  }
  /** 学堂在线协议开一张二维码用的请求体 */
  static qrRequest() {
    return JSON.stringify({op: 'requestlogin', role: 'web', version: 1.4, type: 'qrcode', from: 'web'});
  }
  /**
   * 解析 WS 上收到的扫码消息。
   * 注意 ticket 是微信那张二维码**图片**地址，qrcode 才是要编码成码的文本；
   * 拿 ticket 去编码会生成一张指向图片的死链，扫了没反应。
   */
  static parseQrMessage(raw) {
    let payload;
    try { payload = JSON.parse(raw); } catch { return null; }
    if (payload?.op === 'requestlogin') {
      const content = payload.qrcode || payload.ticket;
      if (!content) return null;
      const seconds = Math.max(30, Math.min(300, Number(payload.expire_seconds) || QR_DEFAULT_SECONDS));
      return {type: 'qr', content, seconds};
    }
    if (payload?.op === 'loginsuccess' && payload.UserID && payload.Auth) {
      return {type: 'success', userId: payload.UserID, auth: payload.Auth};
    }
    return null;
  }
  async validateSession() {
    if (!await this.cookie('sessionid')) throw new Error('没有取得有效的网页登录会话');
    const courses = await this.request('/v2/api/web/courses/list?identity=2');
    const university = (courses.data?.list || []).map(row => row.course?.university_id).find(id => id && String(id) !== '0') || '0';
    const result = await this.request('/api/v3/user/basic-info', null, {universityId: String(university)});
    requireSuccess(result, false, '登录状态校验失败');
    if (!result.data?.id) throw new Error('未获取到雨课堂账号');
    const data = result.data;
    return {id: String(data.id), name: data.name || '', school: data.school || '', number: data.schoolNumber || '', avatar: data.avatar || ''};
  }
  cancel() { this.calls.forEach(call => call.abort()); this.calls.clear(); }
}
