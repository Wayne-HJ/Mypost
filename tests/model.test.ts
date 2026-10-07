import { describe, it, expect } from 'vitest';
import { expand, exportCurl, importCurl, initialWorkspace, newRequest, resolvedUrl, row, validateWorkspace } from '../src/model';

describe('cURL import/export', () => {
  it('imports multiline headers, JSON body, query params and method without executing commands', () => {
    const request = importCurl(`curl 'https://example.com/api?tag=one&tag=two' \\\n -X PATCH -H 'Content-Type: application/json' -H 'X-Test: value:with:colon' --data-raw '{"name":"hello"}'`);
    expect(request.method).toBe('PATCH'); expect(request.params.map(item => item.value)).toEqual(['one', 'two']);
    expect(request.url).toBe('https://example.com/api'); expect(request.bodyType).toBe('json'); expect(request.headers[1].value).toBe('value:with:colon');
    expect(importCurl(`curl https://example.com -H 'X-Test: $(touch /tmp/never)'`).headers[0].value).toBe('$(touch /tmp/never)');
  });
  it('preserves shell quoting and apostrophes in exported bodies', () => {
    const source = newRequest({ method: 'POST', url: 'https://example.com', bodyType: 'json', body: '{"name":"it\'s fine","path":"a\\\\b"}' });
    const restored = importCurl(exportCurl(source)); expect(restored.body).toBe(source.body); expect(restored.method).toBe('POST');
  });
  it('supports basic auth and encoded form values', () => {
    const request = importCurl(`curl.exe https://example.com -u 'user:pass:word' --data-urlencode 'q=中文 &value' --data-urlencode 'q=two'`);
    expect(request.auth).toMatchObject({ type: 'basic', username: 'user', password: 'pass:word' });
    expect(request.bodyRows.map(item => item.value)).toEqual(['中文 &value', 'two']); expect(request.method).toBe('POST');
  });
  it('rejects unsupported options, shell syntax, unclosed strings and file reads', () => {
    for (const command of [`curl https://example.com -k`, `curl https://example.com ; echo hi`, `curl 'https://example.com`, `curl https://example.com -d @secrets.json`, `curl https://example.com https://other.com`]) expect(() => importCurl(command)).toThrow();
  });
  it('retains curl -d default form content-type and explicit HEAD', () => {
    expect(importCurl(`curl https://example.com -d 'plain text'`).headers).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'Content-Type', value: 'application/x-www-form-urlencoded' })]));
    expect(importCurl(`curl -I https://example.com`).method).toBe('HEAD');
  });
  it('exports only enabled rows and resolves environment variables', () => {
    const env = { id: 'env', name: 'env', variables: [row('baseUrl', 'https://example.com'), row('token', 'abc')] };
    const disabled = { ...row('disabled', '{{missing}}'), enabled: false };
    const request = newRequest({ url: '{{baseUrl}}/users', params: [row('q', 'A & 中文'), disabled], headers: [disabled], auth: { type: 'bearer', token: '{{token}}', username: '', password: '' } });
    const command = exportCurl(request, env);
    expect(command).toContain('Authorization: Bearer abc'); expect(command).not.toContain('disabled');
    const url = new URL(resolvedUrl(request, env)); expect(url.searchParams.get('q')).toBe('A & 中文');
  });
});
describe('workspace and variables', () => {
  it('initial workspace is portable and valid after JSON serialization', () => { expect(validateWorkspace(JSON.parse(JSON.stringify(initialWorkspace()))).requests).toHaveLength(4); });
  it('migrates legacy workspaces to Chinese and retains English preference without changing request data', () => {
    const legacy = JSON.parse(JSON.stringify(initialWorkspace()));
    delete legacy.settings.language;
    const migrated = validateWorkspace(legacy);
    expect(migrated.settings.language).toBe('zh-CN');
    expect(migrated.requests).toEqual(legacy.requests); expect(migrated.environments).toEqual(legacy.environments);
    expect(legacy.settings.language).toBeUndefined();
    const english = { ...migrated, settings: { ...migrated.settings, language: 'en' } };
    expect(validateWorkspace(english).settings.language).toBe('en');
    for (const language of ['fr', null, 1]) expect(() => validateWorkspace({ ...migrated, settings: { ...migrated.settings, language } })).toThrow('语言');
  });
  it('rejects malformed workspaces and duplicate request identifiers', () => {
    expect(() => validateWorkspace({ version: 1, requests: [] })).toThrow();
    const value = initialWorkspace(); value.requests[1].id = value.requests[0].id; expect(() => validateWorkspace(value)).toThrow();
    const corrupt = initialWorkspace(); corrupt.requests[0].auth = null as never; expect(() => validateWorkspace(corrupt)).toThrow();
    const dangling = initialWorkspace(); dangling.activeEnvironmentId = 'deleted'; expect(() => validateWorkspace(dangling)).toThrow();
  });
  it('unknown and disabled variables fail rather than sending an incorrect URL', () => {
    expect(() => expand('{{missing}}')).toThrow('未定义');
    expect(() => expand('{{toString}}')).toThrow('未定义');
    expect(() => expand('{{token}}', { id: 'x', name: 'x', variables: [{ ...row('token', 'secret'), enabled: false }] })).toThrow();
  });
});
