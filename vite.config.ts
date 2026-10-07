import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { executeRequest } = require('./electron/http.cjs');

// 开发预览使用与 Electron 相同的请求引擎。只对本机、同源页面开放。
function localPreviewBridge(): Plugin {
  return {
    name: 'mypost-local-preview',
    configureServer(server) {
      const pending = new Map<string, AbortController>();
      server.middlewares.use('/__mypost', async (req, res) => {
        const host = req.headers.host;
        const origin = req.headers.origin;
        if (req.method !== 'POST' || !host?.startsWith('127.0.0.1:') || origin !== `http://${host}` || req.headers['x-mypost-client'] !== 'preview') {
          res.writeHead(403).end('Forbidden'); return;
        }
        try {
          let raw = '';
          for await (const chunk of req) {
            raw += chunk.toString();
            if (Buffer.byteLength(raw) > 12 * 1024 * 1024) throw new Error('请求数据过大');
          }
          const payload = JSON.parse(raw);
          if (typeof payload.id !== 'string' || payload.id.length > 100) throw new Error('请求标识无效');
          if (req.url === '/cancel') { pending.get(payload.id)?.abort(); res.writeHead(200).end('{}'); return; }
          if (req.url !== '/send' || pending.has(payload.id)) throw new Error('请求无效');
          const controller = new AbortController();
          pending.set(payload.id, controller);
          res.on('close', () => controller.abort());
          try {
            const result = await executeRequest(payload.request, payload.environment, payload.settings, controller.signal);
            res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(result));
          } finally { pending.delete(payload.id); }
        } catch (error) {
          res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: error instanceof Error ? error.message : '请求失败' }));
        }
      });
      server.httpServer?.on('close', () => { for (const controller of pending.values()) controller.abort(); pending.clear(); });
    },
  };
}
export default defineConfig({
  base: './', plugins: [react(), localPreviewBridge()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true, watch: { ignored: ['**/release/**'] } },
  test: { include: ['tests/**/*.test.ts'] },
});
