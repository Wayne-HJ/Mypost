const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createStorage, validateWorkspace } = require('../electron/storage.cjs');
const workspace = () => ({ version: 1, collections: [], requests: [], environments: [], history: [], tabs: [], activeRequestId: null, activeEnvironmentId: null, settings: { timeoutMs: 30000, followRedirects: true } });

test('missing storage is empty; concurrent saves are atomic and retain the newest edit', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mypost-store-'));
  try {
    const file = path.join(dir, 'nested', 'workspace.json'), storage = createStorage(file);
    assert.equal(await storage.load(), null);
    await Promise.all(Array.from({ length: 12 }, (_, i) => storage.save({ ...workspace(), settings: { timeoutMs: 1000 + i, followRedirects: true } })));
    await storage.flush();
    assert.equal((await storage.load()).settings.timeoutMs, 1011);
    await assert.rejects(fs.stat(`${file}.tmp`), { code: 'ENOENT' });
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
test('corrupt storage is not silently replaced', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mypost-corrupt-'));
  try {
    const file = path.join(dir, 'workspace.json'); await fs.writeFile(file, '{bad');
    await assert.rejects(createStorage(file).load(), /读取失败/);
    assert.equal(await fs.readFile(file, 'utf8'), '{bad');
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
test('migrates old files and persists English language across storage instances', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mypost-language-'));
  try {
    const file = path.join(dir, 'workspace.json'), legacy = workspace();
    await fs.writeFile(file, JSON.stringify(legacy));
    const migrated = await createStorage(file).load();
    assert.equal(migrated.settings.language, 'zh-CN');
    assert.deepEqual(migrated.requests, legacy.requests);
    assert.equal(JSON.parse(await fs.readFile(file, 'utf8')).settings.language, undefined);
    await createStorage(file).save({ ...migrated, settings: { ...migrated.settings, language: 'en' } });
    assert.equal((await createStorage(file).load()).settings.language, 'en');
    for (const language of ['fr', null, 42]) assert.throws(() => validateWorkspace({ ...legacy, settings: { ...legacy.settings, language } }), /语言/);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
test('invalid imported workspaces and dangerous timeout values are rejected', () => {
  assert.throws(() => validateWorkspace({ version: 2 }), /工作区/);
  assert.throws(() => validateWorkspace({ ...workspace(), settings: { timeoutMs: -1, followRedirects: true } }), /设置/);
  assert.throws(() => validateWorkspace({ ...workspace(), requests: [{ id: 'x', url: 'https://example.com' }] }), /请求/);
  assert.throws(() => validateWorkspace({ ...workspace(), environments: [{ id: 'x', name: 'bad', variables: null }] }), /环境/);
  assert.throws(() => validateWorkspace({ ...workspace(), activeRequestId: 'missing' }), /引用/);
  assert.throws(() => validateWorkspace({ ...workspace(), history: [{ id: 'x', at: 'today', environmentName: 'x', request: { id: 'x', url: 'https://example.com', params: [], headers: [], bodyRows: [] } }] }), /历史/);
});
