const fs = require('node:fs/promises');
const path = require('node:path');
const { defaultLanguage, isLanguage } = require('../shared/i18n.mjs');

const MAX_WORKSPACE_BYTES = 20 * 1024 * 1024;
const validRows = rows => Array.isArray(rows) && rows.every(row => row && typeof row.id === 'string'
  && typeof row.key === 'string' && typeof row.value === 'string' && typeof row.enabled === 'boolean');
function validRequest(request) {
  return request && typeof request.id === 'string' && typeof request.name === 'string' && typeof request.url === 'string'
    && (request.collectionId === null || typeof request.collectionId === 'string')
    && ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(request.method)
    && [request.params, request.headers, request.bodyRows].every(validRows)
    && ['none', 'json', 'text', 'urlencoded'].includes(request.bodyType) && typeof request.body === 'string'
    && ['none', 'bearer', 'basic'].includes(request.auth?.type)
    && ['token', 'username', 'password'].every(key => typeof request.auth[key] === 'string');
}
function validateWorkspace(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.collections) || !Array.isArray(value.requests)
    || !Array.isArray(value.environments) || !Array.isArray(value.history) || !Array.isArray(value.tabs)
    || !value.settings || typeof value.settings !== 'object') throw new Error('不是有效的 Mypost 工作区文件');
  const ids = new Set();
  for (const request of value.requests) {
    if (!validRequest(request) || ids.has(request.id)) throw new Error('工作区包含无效请求');
    ids.add(request.id);
  }
  for (const item of value.collections) {
    if (!item || typeof item.id !== 'string' || typeof item.name !== 'string') throw new Error('工作区包含无效集合');
  }
  for (const item of value.environments) {
    if (!item || typeof item.id !== 'string' || typeof item.name !== 'string' || !validRows(item.variables)) throw new Error('工作区包含无效环境');
  }
  if (!value.tabs.every(id => typeof id === 'string') || (value.activeRequestId !== null && typeof value.activeRequestId !== 'string')
    || (value.activeEnvironmentId !== null && typeof value.activeEnvironmentId !== 'string')) throw new Error('工作区状态无效');
  if (value.history.length > 100 || !value.history.every(item => item && typeof item.id === 'string'
    && typeof item.at === 'string' && typeof item.environmentName === 'string' && validRequest(item.request))) throw new Error('工作区历史记录无效');
  if (!Number.isFinite(value.settings.timeoutMs) || value.settings.timeoutMs < 100 || value.settings.timeoutMs > 300000
    || typeof value.settings.followRedirects !== 'boolean') throw new Error('工作区请求设置无效');
  const language = value.settings.language === undefined ? defaultLanguage : value.settings.language;
  if (!isLanguage(language)) throw new Error('工作区语言设置无效');
  const collectionIds = new Set(value.collections.map(item => item.id));
  const environmentIds = new Set(value.environments.map(item => item.id));
  if (collectionIds.size !== value.collections.length || environmentIds.size !== value.environments.length
    || value.requests.some(item => item.collectionId !== null && !collectionIds.has(item.collectionId))
    || value.tabs.some(id => !ids.has(id)) || new Set(value.tabs).size !== value.tabs.length
    || (value.activeRequestId !== null && !value.tabs.includes(value.activeRequestId))
    || (value.activeEnvironmentId !== null && !environmentIds.has(value.activeEnvironmentId))) throw new Error('工作区引用状态无效');
  if (Buffer.byteLength(JSON.stringify(value)) > MAX_WORKSPACE_BYTES) throw new Error('工作区超过 20 MB 限制');
  return { ...value, settings: { ...value.settings, language } };
}

function createStorage(filename) {
  let queue = Promise.resolve();
  return {
    async load() {
      try { return validateWorkspace(JSON.parse(await fs.readFile(filename, 'utf8'))); }
      catch (error) { if (error.code === 'ENOENT') return null; throw new Error(`本地数据读取失败：${error.message}`); }
    },
    save(value) {
      const data = JSON.stringify(validateWorkspace(value), null, 2);
      const operation = queue.catch(() => {}).then(async () => {
        await fs.mkdir(path.dirname(filename), { recursive: true });
        const temp = `${filename}.tmp`;
        await fs.writeFile(temp, data, { mode: 0o600 });
        await fs.rename(temp, filename);
      });
      queue = operation;
      return operation;
    },
    async flush() { await queue; },
  };
}
module.exports = { createStorage, validateWorkspace, MAX_WORKSPACE_BYTES };
