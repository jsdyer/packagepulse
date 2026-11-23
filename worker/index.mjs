import {packageName, registryURL, statsURL} from '../web/model.mjs';

const PERIOD = /^(?:day|week|month|year|all|\d{4}|\d{4}-\d{2}|\d{4}-\d{2}-\d{2})$/;
const positive = (value, fallback, maximum) => Number.isInteger(Number(value)) && Number(value) > 0 ? Math.min(Number(value), maximum) : fallback;

export function route(url) {
  const kind = url.pathname === '/api/package' ? 'package' : url.pathname === '/api/stats' ? 'stats' : null;
  if (!kind) return null;
  const allowed = kind === 'package' ? ['name'] : ['name', 'period'];
  for (const key of url.searchParams.keys()) if (!allowed.includes(key) || url.searchParams.getAll(key).length !== 1) throw Error('Invalid query parameter.');
  const name = packageName(url.searchParams.get('name'));
  const period = url.searchParams.get('period') || 'month';
  if (!PERIOD.test(period)) throw Error('Use a supported jsDelivr period such as month, week or 2026-10.');
  return {kind, name, period, upstream:kind === 'package' ? registryURL(name) : statsURL(name, period)};
}

// Metadata can be large. Stream it with a byte limit rather than buffering a
// whole registry document in Worker memory; the browser validates its content.
function boundedBody(response, maxBytes, controller, timer) {
  const reader = response.body.getReader(); let bytes = 0;
  const finish = () => clearTimeout(timer);
  return new ReadableStream({
    async pull(stream) {
      try {
        const {done, value} = await reader.read();
        if (done) { finish(); stream.close(); return; }
        bytes += value.byteLength;
        if (bytes > maxBytes) { controller.abort(); await reader.cancel(); throw Error('Metadata exceeded its byte limit.'); }
        stream.enqueue(value);
      } catch (error) { finish(); stream.error(error); }
    },
    async cancel(reason) { finish(); controller.abort(); await reader.cancel(reason); }
  });
}

export function createWorker({fetcher = (...args) => fetch(...args), cache = () => globalThis.caches?.default, now = () => new Date()} = {}) {
  return {async fetch(request, env = {}, ctx = {}) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    const origin = request.headers.get('Origin');
    const allowed = !origin || origin === url.origin || origin === env.ALLOWED_ORIGIN;
    const headers = {'Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff','Cache-Control':'no-store','Vary':'Origin'};
    if (allowed && origin) { headers['Access-Control-Allow-Origin'] = origin; headers['Access-Control-Expose-Headers'] = 'X-PackagePulse-Cache, X-PackagePulse-Captured-At'; }
    const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), {status, headers:{...headers,...extra}});
    if (!allowed) return json({error:'This origin is not allowed.'},403);
    if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Allow-Headers':'Accept'}});
    if (request.method !== 'GET') return json({error:'Use GET for public package metadata.'},405,{Allow:'GET, OPTIONS'});
    if (url.pathname === '/api/health') return json({service:'packagepulse',status:'ok',sources:['npm Registry','jsDelivr'],cacheSeconds:positive(env.CACHE_TTL_SECONDS,900,3600)});
    let target;
    try { target = route(url); }
    catch (error) { return json({error:error.message},400); }
    if (!target) return json({error:'API route not found.'},404);
    const ttl = positive(env.CACHE_TTL_SECONDS,900,3600);
    const maxBytes = positive(env.MAX_RESPONSE_BYTES,40000000,80000000);
    const key = new URL('/api/'+target.kind, url.origin);
    key.searchParams.set('name',target.name);
    if (target.kind === 'stats') key.searchParams.set('period',target.period);
    const cacheKey = new Request(key.href); let store;
    try {
      store = cache(); const hit = store && await store.match(cacheKey);
      if (hit) return new Response(hit.body,{status:200,headers:{...headers,'X-PackagePulse-Cache':'HIT','X-PackagePulse-Captured-At':hit.headers.get('X-PackagePulse-Captured-At')}});
    } catch { /* A cache outage must not break a valid lookup. */ }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(),positive(env.UPSTREAM_TIMEOUT_MS,25000,60000));
    try {
      const response = await fetcher(target.upstream,{redirect:'manual',signal:controller.signal,headers:{Accept:'application/json','User-Agent':'PackagePulse/1.0 (https://coolcode.ca/packagepulse/)'}});
      if (!response.ok) {
        clearTimeout(timer); await response.body?.cancel();
        const status = response.status === 404 ? 404 : response.status === 429 ? 429 : 502;
        return json({error:status===404?'No public package record was found.':status===429?'The provider is rate-limiting requests. Please try again later.':'The provider could not complete this request.',code:response.status>=300&&response.status<400?'upstream_redirect_rejected':'upstream_http_error',upstreamStatus:response.status},status,status===429?{'Retry-After':'60'}:{});
      }
      if (!response.body || !/\bjson\b/i.test(response.headers.get('Content-Type')||'')) {clearTimeout(timer);await response.body?.cancel();return json({error:'The provider did not return JSON metadata.',code:'invalid_content_type'},502);}
      if (Number(response.headers.get('Content-Length')) > maxBytes) {clearTimeout(timer);await response.body.cancel();return json({error:'This metadata exceeds the configured response limit.',code:'response_too_large'},502);}
      const capturedAt = now().toISOString();
      const result = new Response(boundedBody(response,maxBytes,controller,timer),{headers:{...headers,'X-PackagePulse-Captured-At':capturedAt,'X-PackagePulse-Cache':'MISS'}});
      if (store) {
        const copy = result.clone(); copy.headers.set('Cache-Control',`public, max-age=${ttl}`); copy.headers.delete('Vary'); copy.headers.delete('Access-Control-Allow-Origin');
        const saving = Promise.resolve().then(()=>store.put(cacheKey,copy)).catch(()=>{});
        try { if (typeof ctx.waitUntil === 'function') ctx.waitUntil(saving); else await saving; } catch { await saving; }
      }
      return result;
    } catch {
      clearTimeout(timer);
      console.error(JSON.stringify({event:'packagepulse_upstream_failure',source:target.kind,timeout:controller.signal.aborted}));
      return json({error:controller.signal.aborted?'The provider took too long to respond.':'The provider connection failed. Try again later.',code:controller.signal.aborted?'upstream_timeout':'upstream_fetch_failed'},502);
    }
  }};
}

export default createWorker();
