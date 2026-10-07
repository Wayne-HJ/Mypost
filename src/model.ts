import type { ApiRequest, Environment, Method, Row, Workspace } from './types';
import { defaultLanguage, isLanguage } from '../shared/i18n.mjs';

export const methods: Method[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
export const id = () => crypto.randomUUID();
export const row = (key = '', value = ''): Row => ({ id: id(), enabled: true, key, value });
export function newRequest(overrides: Partial<ApiRequest> = {}): ApiRequest {
  return {
    id: id(), collectionId: null, name: '未命名请求', method: 'GET', url: '',
    params: [], headers: [], bodyType: 'none', body: '', bodyRows: [],
    auth: { type: 'none', token: '', username: '', password: '' }, ...overrides,
  };
}
export function initialWorkspace(): Workspace {
  const collectionId = id();
  const requests = [
    newRequest({ collectionId, name: '获取请求信息', url: '{{baseUrl}}/get', params: [row('source', 'mypost')], headers: [row('Accept', 'application/json')] }),
    newRequest({ collectionId, name: '创建一条记录', method: 'POST', url: '{{baseUrl}}/post', bodyType: 'json', body: '{\n  "name": "Hello, Mypost",\n  "message": "让每次请求，清晰可见。"\n}', headers: [row('Accept', 'application/json')] }),
    newRequest({ collectionId, name: '查看响应状态', url: '{{baseUrl}}/status/200' }),
    newRequest({ collectionId, name: '删除一条记录', method: 'DELETE', url: '{{baseUrl}}/delete' }),
  ];
  const environments = [
    { id: id(), name: '公共测试', variables: [row('baseUrl', 'https://httpbin.org'), row('token', '')] },
    { id: id(), name: '本地开发', variables: [row('baseUrl', 'http://127.0.0.1:8088'), row('token', '')] },
  ];
  return { version: 1, collections: [{ id: collectionId, name: '入门示例' }], requests, environments,
    history: [], tabs: requests.slice(0, 2).map(item => item.id), activeRequestId: requests[0].id,
    activeEnvironmentId: environments[0].id, settings: { timeoutMs: 30000, followRedirects: true, language: defaultLanguage } };
}
export function validateWorkspace(input: unknown): Workspace {
  const value = input as Workspace;
  if (!value || value.version !== 1 || !Array.isArray(value.collections) || !Array.isArray(value.requests)
    || !Array.isArray(value.environments) || !Array.isArray(value.history) || !Array.isArray(value.tabs)
    || !value.settings || typeof value.settings !== 'object') throw new Error('不是有效的 Mypost 工作区文件');
  const ids = new Set<string>();
  const validRows = (rows: Row[]) => Array.isArray(rows) && rows.every(item => item && typeof item.id === 'string'
    && typeof item.key === 'string' && typeof item.value === 'string' && typeof item.enabled === 'boolean');
  for (const item of value.requests) {
    if (!item || typeof item.id !== 'string' || ids.has(item.id) || typeof item.name !== 'string'
      || typeof item.url !== 'string' || !methods.includes(item.method) || ![item.params, item.headers, item.bodyRows].every(validRows)
      || !['none', 'json', 'text', 'urlencoded'].includes(item.bodyType) || typeof item.body !== 'string'
      || !item.auth || !['none', 'basic', 'bearer'].includes(item.auth.type)
      || (item.collectionId !== null && typeof item.collectionId !== 'string')
      || !['token', 'username', 'password'].every(key => typeof item.auth[key as keyof typeof item.auth] === 'string')) throw new Error('工作区包含无效请求');
    ids.add(item.id);
  }
  if (!value.collections.every(item => item && typeof item.id === 'string' && typeof item.name === 'string')
    || !value.environments.every(item => item && typeof item.id === 'string' && typeof item.name === 'string' && validRows(item.variables))) throw new Error('工作区集合或环境无效');
  if (!value.tabs.every(item => typeof item === 'string') || (value.activeRequestId !== null && typeof value.activeRequestId !== 'string')
    || (value.activeEnvironmentId !== null && typeof value.activeEnvironmentId !== 'string')) throw new Error('工作区状态无效');
  if (!Number.isFinite(value.settings.timeoutMs) || value.settings.timeoutMs < 100 || value.settings.timeoutMs > 300000
    || typeof value.settings.followRedirects !== 'boolean') throw new Error('工作区设置无效');
  const language = value.settings.language === undefined ? defaultLanguage : value.settings.language;
  if (!isLanguage(language)) throw new Error('工作区语言设置无效');
  if (value.history.length > 100 || !value.history.every(item => item && typeof item.id === 'string' && typeof item.at === 'string'
    && typeof item.environmentName === 'string' && item.request && typeof item.request.id === 'string'
    && typeof item.request.name === 'string' && typeof item.request.url === 'string'
    && [item.request.params, item.request.headers, item.request.bodyRows].every(validRows)
    && methods.includes(item.request.method) && typeof item.request.body === 'string'
    && ['none', 'json', 'text', 'urlencoded'].includes(item.request.bodyType)
    && ['none', 'bearer', 'basic'].includes(item.request.auth?.type)
    && ['token', 'username', 'password'].every(key => typeof item.request.auth[key as keyof typeof item.request.auth] === 'string'))) throw new Error('工作区历史记录无效');
  const collectionIds = new Set(value.collections.map(item => item.id));
  const environmentIds = new Set(value.environments.map(item => item.id));
  if (collectionIds.size !== value.collections.length || environmentIds.size !== value.environments.length
    || value.requests.some(item => item.collectionId !== null && !collectionIds.has(item.collectionId))
    || value.tabs.some(item => !ids.has(item)) || new Set(value.tabs).size !== value.tabs.length
    || (value.activeRequestId !== null && !value.tabs.includes(value.activeRequestId))
    || (value.activeEnvironmentId !== null && !environmentIds.has(value.activeEnvironmentId))) throw new Error('工作区引用状态无效');
  return { ...value, settings: { ...value.settings, language } };
}
export function expand(value: string, environment?: Environment): string {
  const variables = Object.fromEntries((environment?.variables ?? []).filter(item => item.enabled && item.key.trim()).map(item => [item.key.trim(), item.value]));
  return value.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, key) => {
    if (!Object.prototype.hasOwnProperty.call(variables, key)) throw new Error(`未定义的环境变量：${key}`);
    return variables[key];
  });
}
export function resolvedUrl(request: ApiRequest, environment?: Environment): string {
  const url = new URL(expand(request.url, environment));
  for (const item of request.params) if (item.enabled && item.key.trim()) url.searchParams.append(expand(item.key, environment), expand(item.value, environment));
  return url.toString();
}

function tokenize(command: string): string[] {
  const text = command.replace(/\\\r?\n/g, ' ');
  const tokens: string[] = [];
  let token = '', quote = '', started = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quote) {
      if (char === quote) { quote = ''; continue; }
      if (quote === '"' && char === '\\' && ['"', '\\', '$', '`'].includes(text[i + 1])) { token += text[++i]; continue; }
      token += char;
    } else if (char === '"' || char === "'") { quote = char; started = true; }
    else if (char === '\\') { if (i + 1 >= text.length) throw new Error('cURL 转义字符不完整'); token += text[++i]; started = true; }
    else if (/\s/.test(char)) { if (started) { tokens.push(token); token = ''; started = false; } }
    else { token += char; started = true; }
  }
  if (quote) throw new Error('cURL 中的引号未闭合');
  if (started) tokens.push(token);
  return tokens;
}
export function importCurl(command: string): ApiRequest {
  const tokens = tokenize(command.trim());
  if (!['curl', 'curl.exe'].includes(tokens.shift() ?? '')) throw new Error('请粘贴以 curl 开头的命令');
  const request = newRequest({ name: '导入的请求' });
  let explicitMethod = false, rawBody: string[] = [], encodedBody: string[] = [], hasUrl = false;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const next = () => { if (i + 1 >= tokens.length) throw new Error(`${token} 缺少参数`); return tokens[++i]; };
    if (['-X', '--request'].includes(token)) {
      const method = next().toUpperCase() as Method;
      if (!methods.includes(method)) throw new Error(`不支持的方法：${method}`);
      request.method = method; explicitMethod = true;
    } else if (['-H', '--header'].includes(token)) {
      const header = next(), colon = header.indexOf(':');
      if (colon <= 0) throw new Error('Header 应采用 Name: Value 格式');
      request.headers.push(row(header.slice(0, colon).trim(), header.slice(colon + 1).trim()));
    } else if (['-d', '--data', '--data-raw', '--data-binary'].includes(token)) {
      const body = next();
      if (body.startsWith('@') && token !== '--data-raw') throw new Error('暂不支持从 cURL 读取本地文件');
      rawBody.push(body);
    } else if (token === '--data-urlencode') {
      const body = next();
      if (body.startsWith('@') || (!body.includes('=') && body.includes('@'))) throw new Error('暂不支持 cURL 文件参数');
      encodedBody.push(body);
    } else if (['-u', '--user'].includes(token)) {
      const value = next(), colon = value.indexOf(':');
      request.auth = { ...request.auth, type: 'basic', username: colon < 0 ? value : value.slice(0, colon), password: colon < 0 ? '' : value.slice(colon + 1) };
    } else if (['-I', '--head'].includes(token)) { request.method = 'HEAD'; explicitMethod = true; }
    else if (['-s', '--silent', '-S', '--show-error', '--compressed', '-i', '--include', '-g', '--globoff'].includes(token)) { /* 输出选项不影响请求 */ }
    else if (['-L', '--location'].includes(token)) { /* 默认跟随重定向 */ }
    else if (token === '--url') { if (hasUrl) throw new Error('每次只能导入一个 URL'); request.url = next(); hasUrl = true; }
    else if (!token.startsWith('-') && /^https?:\/\//.test(token)) { if (hasUrl) throw new Error('每次只能导入一个 URL'); request.url = token; hasUrl = true; }
    else throw new Error(`暂不支持的 cURL 参数：${token}`);
  }
  if (!hasUrl) throw new Error('cURL 命令缺少 HTTP / HTTPS 地址');
  const url = new URL(request.url);
  if (url.username || url.password) throw new Error('请使用 -u 配置认证，不要将密码放入 URL');
  request.params = [...url.searchParams].map(([key, value]) => row(key, value));
  url.search = ''; request.url = url.toString();
  if (rawBody.length && encodedBody.length) throw new Error('请使用单一请求体格式');
  if (rawBody.length || encodedBody.length) {
    if (!explicitMethod) request.method = 'POST';
    const contentType = request.headers.find(item => item.key.toLowerCase() === 'content-type')?.value ?? '';
    if (encodedBody.length || contentType.includes('x-www-form-urlencoded')) {
      request.bodyType = 'urlencoded';
      request.bodyRows = encodedBody.length ? encodedBody.map(item => { const equal = item.indexOf('='); return equal < 0 ? row(item, '') : row(item.slice(0, equal), item.slice(equal + 1)); }) : [...new URLSearchParams(rawBody.join('&'))].map(([key, value]) => row(key, value));
    } else {
      request.body = rawBody.join('&');
      try { JSON.parse(request.body); request.bodyType = 'json'; } catch { request.bodyType = 'text'; }
      // curl -d 默认为表单。保留其实际 Content-Type，避免导入后改变请求语义。
      if (!contentType) request.headers.push(row('Content-Type', 'application/x-www-form-urlencoded'));
    }
  }
  return request;
}
const shellQuote = (text: string) => `'${text.replace(/'/g, "'\\''")}'`;
export function exportCurl(request: ApiRequest, environment?: Environment): string {
  const resolve = (text: string) => expand(text, environment);
  const args = [`curl --request ${request.method} ${shellQuote(resolvedUrl(request, environment))}`];
  const headers = request.headers.filter(item => item.enabled && item.key.trim()).map(item => ({ key: resolve(item.key), value: resolve(item.value) }));
  if (request.auth.type !== 'none') {
    const auth = request.auth.type === 'bearer' ? `Bearer ${resolve(request.auth.token)}`
      : `Basic ${btoa(String.fromCharCode(...new TextEncoder().encode(`${resolve(request.auth.username)}:${resolve(request.auth.password)}`)))}`;
    for (let i = headers.length - 1; i >= 0; i--) if (headers[i].key.toLowerCase() === 'authorization') headers.splice(i, 1);
    headers.push({ key: 'Authorization', value: auth });
  }
  const hasBody = !['GET', 'HEAD'].includes(request.method) && request.bodyType !== 'none';
  if (hasBody && !headers.some(item => item.key.toLowerCase() === 'content-type')) headers.push({ key: 'Content-Type', value: request.bodyType === 'json' ? 'application/json' : request.bodyType === 'urlencoded' ? 'application/x-www-form-urlencoded' : 'text/plain; charset=utf-8' });
  for (const item of headers) args.push(`--header ${shellQuote(`${item.key}: ${item.value}`)}`);
  if (hasBody) {
    if (request.bodyType === 'urlencoded') {
      for (const item of request.bodyRows) if (item.enabled && item.key.trim()) args.push(`--data-urlencode ${shellQuote(`${resolve(item.key)}=${resolve(item.value)}`)}`);
    } else args.push(`--data-raw ${shellQuote(resolve(request.body))}`);
  }
  return args.join(' \\\n  ');
}
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
export function prettyJson(text: string): string { try { return JSON.stringify(JSON.parse(text), null, 2); } catch { return text; } }
