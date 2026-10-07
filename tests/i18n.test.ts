import { describe, expect, it } from 'vitest';
import english from '../shared/en.json';
import { createTranslator, defaultLanguage, isLanguage, translateMessage } from '../shared/i18n.mjs';

describe('Chinese and English translations', () => {
  it('defaults to Chinese and switches interface text without changing interpolation values', () => {
    expect(defaultLanguage).toBe('zh-CN');
    expect(createTranslator()('软件语言')).toBe('软件语言');
    expect(createTranslator('en')('软件语言')).toBe('App language');
    expect(createTranslator('en')('删除「{0}」及其中 {1} 个请求。', ['用户服务', 0])).toBe('Delete “用户服务” and its 0 requests.');
    expect(createTranslator('en')('在 URL、参数、请求头和请求体中使用 {{变量名}}。')).toContain('{{variable}}');
  });
  it('translates native errors in both directions, including errors from before a language change', () => {
    const message = '请求超时（30000 ms），请检查服务或调整设置';
    const translated = 'Request timed out (30000 ms). Check the service or adjust the settings.';
    expect(translateMessage(message, 'en')).toBe(translated);
    expect(translateMessage(translated, 'zh-CN')).toBe(message);
    expect(translateMessage('未定义的环境变量：用户令牌', 'en')).toBe('Undefined environment variable: 用户令牌');
    expect(translateMessage('本地数据读取失败：工作区语言设置无效', 'en')).toBe('Could not read local data: Invalid workspace language setting');
    expect(translateMessage('ECONNREFUSED at 127.0.0.1:8088', 'en')).toBe('ECONNREFUSED at 127.0.0.1:8088');
  });
  it('every English translation preserves its dynamic placeholders', () => {
    const placeholders = (text: string) => [...text.matchAll(/\{(\d+)\}/g)].map(match => match[1]).sort();
    for (const [source, target] of Object.entries(english)) {
      expect(target.trim(), source).not.toBe('');
      expect(placeholders(target), source).toEqual(placeholders(source));
      expect(/[\u3400-\u9fff]/.test(target), source).toBe(false);
    }
  });
  it('only accepts the supported application locales', () => {
    expect(isLanguage('zh-CN')).toBe(true); expect(isLanguage('en')).toBe(true);
    for (const value of ['fr', 'en-US', '', null, undefined, 42]) expect(isLanguage(value)).toBe(false);
  });
});
