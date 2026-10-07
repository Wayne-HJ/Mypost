const { performance } = require('node:perf_hooks');

const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
const MAX_RESPONSE_BYTES = 20 * 1024 * 1024;
const MAX_BODY_BYTES = 10 * 1024 * 1024;

function interpolate(value, variables = {}) {
  return String(value ?? '').replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, name) => {
    if (!Object.prototype.hasOwnProperty.call(variables, name)) throw new Error(`未定义的环境变量：${name}`);
    return String(variables[name]);
  });
}

function prepareRequest(request, environment, settings = {}) {
  if (!request || typeof request !== 'object') throw new Error('请求格式无效');
  const variables = Object.fromEntries((environment?.variables ?? [])
    .filter(row => row.enabled && row.key.trim()).map(row => [row.key.trim(), row.value]));
  const resolve = value => interpolate(value, variables);
  const method = String(request.method ?? 'GET').toUpperCase();
  if (!METHODS.has(method)) throw new Error('不支持的 HTTP 方法');
  let url;
  try { url = new URL(resolve(request.url)); } catch (error) {
    if (error.message.includes('环境变量')) throw error;
    throw new Error('请输入完整的 HTTP 或 HTTPS 地址');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('仅支持 HTTP 和 HTTPS 协议');
  if (url.username || url.password) throw new Error('请通过「认证」配置用户名和密码');
  for (const row of request.params ?? []) {
    if (row.enabled && row.key.trim()) url.searchParams.append(resolve(row.key), resolve(row.value));
  }
  const headers = new Headers();
  for (const row of request.headers ?? []) {
    if (row.enabled && row.key.trim()) headers.append(resolve(row.key.trim()), resolve(row.value));
  }
  if (request.auth?.type === 'bearer') headers.set('Authorization', `Bearer ${resolve(request.auth.token)}`);
  if (request.auth?.type === 'basic') headers.set('Authorization', `Basic ${Buffer.from(`${resolve(request.auth.username)}:${resolve(request.auth.password)}`).toString('base64')}`);
  let body;
  if (!['GET', 'HEAD'].includes(method) && request.bodyType !== 'none') {
    if (request.bodyType === 'urlencoded') {
      const fields = new URLSearchParams();
      for (const row of request.bodyRows ?? []) {
        if (row.enabled && row.key.trim()) fields.append(resolve(row.key), resolve(row.value));
      }
      body = fields.toString();
      if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/x-www-form-urlencoded');
    } else {
      body = resolve(request.body ?? '');
      if (request.bodyType === 'json') {
        try { JSON.parse(body); } catch { throw new Error('请求体不是有效的 JSON，请检查语法或环境变量'); }
        if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
      } else if (!headers.has('Content-Type')) headers.set('Content-Type', 'text/plain; charset=utf-8');
    }
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) throw new Error('请求体超过 10 MB 限制');
  }
  return { url: url.toString(), method, headers, body, redirect: settings.followRedirects === false ? 'manual' : 'follow' };
}

async function executeRequest(request, environment, settings = {}, externalSignal) {
  const prepared = prepareRequest(request, environment, settings);
  const timeoutMs = Number(settings.timeoutMs ?? 30000);
  if (!Number.isFinite(timeoutMs) || timeoutMs < 100 || timeoutMs > 300000) throw new Error('超时时间必须在 100–300000 毫秒之间');
  const timeoutController = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; timeoutController.abort(); }, timeoutMs);
  const signal = externalSignal ? AbortSignal.any([timeoutController.signal, externalSignal]) : timeoutController.signal;
  const start = performance.now();
  try {
    const response = await fetch(prepared.url, { ...prepared, signal });
    const chunks = [];
    let size = 0;
    if (response.body) {
      const reader = response.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_RESPONSE_BYTES) {
            await reader.cancel();
            throw new Error('响应超过 20 MB 限制，请改用下载工具获取该资源');
          }
          chunks.push(Buffer.from(value));
        }
      } finally { reader.releaseLock(); }
    }
    const bytes = Buffer.concat(chunks);
    const contentType = response.headers.get('content-type') ?? '';
    const isBinary = Boolean(contentType) && !/(text\/|json|xml|javascript|x-www-form-urlencoded|svg)/i.test(contentType);
    let text = '';
    if (!isBinary) {
      const charset = contentType.match(/charset\s*=\s*["']?([^\s;"']+)/i)?.[1] ?? 'utf-8';
      try { text = new TextDecoder(charset).decode(bytes); } catch { text = bytes.toString('utf8'); }
    }
    return {
      status: response.status, statusText: response.statusText,
      headers: [...response.headers.entries()].map(([key, value]) => ({ key, value })),
      body: text, base64: isBinary ? bytes.toString('base64') : undefined,
      isBinary, size, duration: Math.round(performance.now() - start),
      url: response.url, redirected: response.redirected, receivedAt: new Date().toISOString(),
    };
  } catch (error) {
    if (timedOut) throw new Error(`请求超时（${timeoutMs} ms），请检查服务或调整设置`);
    if (externalSignal?.aborted) throw new Error('请求已取消');
    if (error.cause?.code) throw new Error(`网络请求失败：${error.cause.code} · ${error.cause.message}`);
    throw error;
  } finally { clearTimeout(timer); }
}

module.exports = { prepareRequest, executeRequest, interpolate, MAX_RESPONSE_BYTES };
