const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const zlib = require('node:zlib');
const { executeRequest, prepareRequest, MAX_RESPONSE_BYTES } = require('../electron/http.cjs');

let server, base;
const row = (key, value, enabled = true) => ({ key, value, enabled });
const request = change => ({ method: 'GET', url: `${base}/echo`, params: [], headers: [], auth: { type: 'none' }, bodyType: 'none', body: '', bodyRows: [], ...change });
before(async () => {
  server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/slow') { setTimeout(() => { if (!res.destroyed) res.end('done'); }, 700); return; }
    if (url.pathname === '/slow-body') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.write('start'); setTimeout(() => { if (!res.destroyed) res.end('done'); }, 700); return; }
    if (url.pathname === '/redirect') { res.writeHead(302, { Location: '/echo' }); res.end(); return; }
    if (url.pathname === '/large') { res.end(Buffer.alloc(MAX_RESPONSE_BYTES + 1)); return; }
    if (url.pathname === '/binary') { res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); res.end(Buffer.from([0, 255, 128, 42])); return; }
    if (url.pathname === '/latin') { res.writeHead(200, { 'Content-Type': 'text/plain; charset=iso-8859-1' }); res.end(Buffer.from([99, 97, 102, 233])); return; }
    if (url.pathname === '/gzip') { res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' }); res.end(zlib.gzipSync('{"ok":true}')); return; }
    if (url.pathname === '/error') { res.writeHead(422, { 'Content-Type': 'application/json' }); res.end('{"error":"invalid"}'); return; }
    let body = ''; for await (const chunk of req) body += chunk;
    res.writeHead(200, { 'Content-Type': 'application/json', 'X-Test': 'fixture' });
    res.end(JSON.stringify({ method: req.method, params: [...url.searchParams], headers: req.headers, body }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });

test('query params preserve existing and repeated values; disabled fields are ignored', async () => {
  const result = await executeRequest(request({ url: `${base}/echo?tag=old`, params: [row('tag', '{{value}}'), row('空 格', '中文 &'), row('ignored', '{{missing}}', false)] }), { variables: [row('value', 'new')] });
  assert.deepEqual(JSON.parse(result.body).params, [['tag', 'old'], ['tag', 'new'], ['空 格', '中文 &']]);
  assert.equal(result.status, 200); assert.ok(result.duration >= 0); assert.equal(result.size, Buffer.byteLength(result.body));
  assert.ok(result.headers.find(item => item.key === 'x-test' && item.value === 'fixture'));
});
test('JSON body and bearer token are interpolated and default content type is set', async () => {
  const result = await executeRequest(request({ method: 'POST', bodyType: 'json', body: '{"name":"{{name}}"}', auth: { type: 'bearer', token: '{{token}}' }, headers: [row('Authorization', 'ignored')] }), { variables: [row('name', '测试'), row('token', 'abc')] });
  const echo = JSON.parse(result.body);
  assert.equal(echo.headers.authorization, 'Bearer abc'); assert.equal(echo.headers['content-type'], 'application/json'); assert.deepEqual(JSON.parse(echo.body), { name: '测试' });
});
test('basic auth supports Unicode; form body properly encodes duplicate fields', async () => {
  const result = await executeRequest(request({ method: 'PUT', bodyType: 'urlencoded', bodyRows: [row('name', 'A&B 中文'), row('name', 'second')], auth: { type: 'basic', username: '用户', password: 'p:密' } }));
  const echo = JSON.parse(result.body);
  assert.equal(Buffer.from(echo.headers.authorization.slice(6), 'base64').toString(), '用户:p:密');
  assert.deepEqual([...new URLSearchParams(echo.body)], [['name', 'A&B 中文'], ['name', 'second']]);
});
test('GET and HEAD never send body; explicit content type is preserved', async () => {
  const prepared = prepareRequest(request({ bodyType: 'json', body: 'not JSON' })); assert.equal(prepared.body, undefined);
  const result = await executeRequest(request({ method: 'HEAD' })); assert.equal(result.body, ''); assert.equal(result.size, 0);
  const custom = prepareRequest(request({ method: 'POST', bodyType: 'json', body: '{}', headers: [row('Content-Type', 'application/vnd.test+json')] }));
  assert.equal(custom.headers.get('content-type'), 'application/vnd.test+json');
});
test('invalid URL schemes, unresolved variables, invalid JSON and timeout settings fail clearly', async () => {
  for (const url of ['file:///etc/passwd', 'ftp://example.com']) await assert.rejects(executeRequest(request({ url })), /HTTP 和 HTTPS/);
  await assert.rejects(executeRequest(request({ url: 'localhost' })), /完整/);
  await assert.rejects(executeRequest(request({ url: '{{missing}}/get' })), /未定义的环境变量/);
  await assert.rejects(executeRequest(request({ method: 'POST', bodyType: 'json', body: '{' })), /有效的 JSON/);
  await assert.rejects(executeRequest(request(), null, { timeoutMs: 0 }), /超时时间/);
});
test('redirect following can be disabled and HTTP error statuses remain inspectable', async () => {
  const followed = await executeRequest(request({ url: `${base}/redirect` })); assert.equal(followed.status, 200); assert.equal(followed.redirected, true);
  const manual = await executeRequest(request({ url: `${base}/redirect` }), null, { followRedirects: false }); assert.equal(manual.status, 302); assert.equal(manual.redirected, false);
  const error = await executeRequest(request({ url: `${base}/error` })); assert.equal(error.status, 422); assert.equal(JSON.parse(error.body).error, 'invalid');
});
test('timeout applies both before headers and while streaming the body', async () => {
  for (const path of ['/slow', '/slow-body']) await assert.rejects(executeRequest(request({ url: `${base}${path}` }), null, { timeoutMs: 100 }), /请求超时/);
});
test('in-flight request can be cancelled', async () => {
  const controller = new AbortController();
  const promise = executeRequest(request({ url: `${base}/slow` }), null, {}, controller.signal);
  setTimeout(() => controller.abort(), 25);
  await assert.rejects(promise, /请求已取消/);
});
test('binary bytes are lossless, charset is honored and gzip is decoded', async () => {
  const binary = await executeRequest(request({ url: `${base}/binary` })); assert.equal(binary.isBinary, true); assert.deepEqual(Buffer.from(binary.base64, 'base64'), Buffer.from([0, 255, 128, 42]));
  assert.equal((await executeRequest(request({ url: `${base}/latin` }))).body, 'café');
  assert.deepEqual(JSON.parse((await executeRequest(request({ url: `${base}/gzip` }))).body), { ok: true });
});
test('oversized responses are aborted', async () => { await assert.rejects(executeRequest(request({ url: `${base}/large` })), /20 MB/); });
