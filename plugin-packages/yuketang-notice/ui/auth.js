// Authentication protocol belongs to the component; the host provides cookies and session verification.
export const SITES = ['changjiang.yuketang.cn', 'www.yuketang.cn', 'huanghe.yuketang.cn', 'pro.yuketang.cn'];
export const CAPTCHA_APP_ID = '2091064951';
export const QR_WS_PATH = '/wsapp/';
/** Conservative QR lifetime when the server omits expiry. */
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
        // Preserve structured platform errors alongside HTTP status.
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
    // Delegate account validity to the entry's checkLogin function.
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
    // QR expiry is shorter than token JWT lifetime; use 60 seconds without server metadata.
    const seconds = Math.max(30, Math.min(300, Number(data.expire_seconds) || QR_DEFAULT_SECONDS));
    return {content: data.qrContent, token: data.token, expiresAt: this.now() + seconds * 1000};
  }
  /**
   * Long-poll scan confirmation; expired tokens request a fresh QR rather than a generic
   * failure.
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
        // Restart scanning after token expiry.
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
        if (attempt === 2) throw new Error('未收到扫码确认，请重新扫码');
        continue;
      }
      // Exchange UserID/Auth for sessionid before synchronization.
      await this.establishSession(userId, auth);
      return {userId, auth};
    }
    throw new Error('未收到扫码确认，请重新扫码');
  }

  /** Exchange credentials through the web-login branch for session cookies. */
  async establishSession(userId, auth) {
    await this.prepare();
    const result = await this.request('/pc/web_login', {UserID: userId, Auth: auth}, {json: false});
    // A sessionid cookie confirms this non-JSON response.
    void result;
    if (!await this.cookie('sessionid')) throw new Error('未能建立网页登录会话，请重试');
  }

  qrSocketUrl() {
    return `wss://${this.site}${QR_WS_PATH}`;
  }
  static qrRequest() {
    return JSON.stringify({op: 'requestlogin', role: 'web', version: 1.4, type: 'qrcode', from: 'web'});
  }
  /** Encode qrcode text, not ticket image URLs, when parsing scan events. */
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
