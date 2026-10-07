import http from 'node:http';
const port = Number(process.env.MYPOST_FIXTURE_PORT ?? 8088);
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  if (url.pathname.startsWith('/status/')) { res.writeHead(Number(url.pathname.split('/').at(-1)) || 200); res.end(); return; }
  if (url.pathname === '/delay/10') { await new Promise(resolve => setTimeout(resolve, 10000)); }
  if (url.pathname === '/redirect') { res.writeHead(302, { Location: '/get' }); res.end(); return; }
  if (url.pathname === '/binary') { res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); res.end(Buffer.from([0, 255, 128, 42])); return; }
  let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 1024 * 1024) { res.writeHead(413).end(); return; } }
  let json = null; try { json = JSON.parse(body); } catch { /* 非 JSON body */ }
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'X-Powered-By': 'Mypost Fixture', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ args: Object.fromEntries(url.searchParams), headers: req.headers, method: req.method, url: url.toString(), json, data: body, message: 'Hello, Mypost 👋' }, null, 2));
});
server.listen(port, '127.0.0.1', () => console.log(`Mypost 本地测试接口：http://127.0.0.1:${port}\n在工作台选择「本地开发」环境，然后发送入门示例。`));
process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());
