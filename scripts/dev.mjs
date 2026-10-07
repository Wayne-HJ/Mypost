import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import electron from 'electron';

const server = await createServer({ server: { host: '127.0.0.1', port: 5173, strictPort: true } });
await server.listen();
const child = spawn(electron, ['.'], { stdio: 'inherit', env: { ...process.env, MYPOST_DEV_URL: 'http://127.0.0.1:5173' } });
let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  child.kill();
  await server.close();
  process.exit(code);
}
child.on('exit', code => stop(code ?? 0));
child.on('error', error => { console.error(error); stop(1); });
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
