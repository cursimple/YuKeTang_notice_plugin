/** Native transport persists session cookies; the component owns authentication. */
import { pageSession } from '../main.js';

export function sessionFetch(sdk, fallback = globalThis.fetch?.bind(globalThis)) {
  if (!sdk?.capabilities?.sessionFetch) return fallback;
  let sequence = 0;
  const prefix = Math.random().toString(36).slice(2);
  return (url, init = {}) => new Promise((resolve, reject) => {
    const signal = init.signal;
    if (signal?.aborted) { reject(new DOMException('cancelled', 'AbortError')); return; }
    const requestId = `session_${prefix}_${++sequence}`;
    let settled = false;
    const done = (error, value) => {
      if (settled) return;
      settled = true; signal?.removeEventListener('abort', abort);
      error ? reject(error) : resolve(value);
    };
    const abort = () => {
      sdk.request('network.session.cancel', {requestId}).catch(() => {});
      done(new DOMException('cancelled', 'AbortError'));
    };
    signal?.addEventListener('abort', abort, {once:true});
    // A rotation persisted for another site must not be sent to this one.
    try { pageSession.setIdentity(new URL(String(url)).host); } catch (_) {}
    // Rotated credentials from earlier responses win over the caller's stale values.
    sdk.request('network.session.fetch', {requestId, url:String(url), method:init.method || 'GET',
      headers:pageSession.headers(init.headers || {}), body:init.body || '', referrer:init.referrer || '', timeoutMs:init.timeoutMs || 20000})
      .then(result => {
        try {
          // The host persists response cookies before replying; anything it also surfaces here
          // (Set-Auth / Set-Cookie) is kept so the next request can reuse it.
          pageSession.absorbResponse(result);
          done(null, new Response([204,205,304].includes(result.status)?null:result.body, {status:result.status,
            headers:result.contentType?{'Content-Type':result.contentType}:{}}));
        } catch(error) { done(error); }
      }, error => done(error));
  });
}
