import english from './en.json' with { type: 'json' };

export const supportedLanguages = ['zh-CN', 'en'];
export const defaultLanguage = 'zh-CN';
export function isLanguage(value) { return supportedLanguages.includes(value); }

export function createTranslator(language = defaultLanguage) {
  return (message, values = []) => {
    const text = language === 'en' ? english[message] ?? message : message;
    return text.replace(/\{(\d+)\}/g, (placeholder, index) => String(values[Number(index)] ?? placeholder));
  };
}

const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patterns = Object.entries(english).flatMap(([source, target]) => [source, target].map(text => {
  const indices = [];
  let pattern = '', offset = 0;
  for (const match of text.matchAll(/\{(\d+)\}/g)) {
    pattern += escapeRegex(text.slice(offset, match.index)) + '([\\s\\S]*?)';
    indices.push(Number(match[1])); offset = match.index + match[0].length;
  }
  return { source, text, indices, regex: new RegExp(`^${pattern}${escapeRegex(text.slice(offset))}$`) };
}));

// Errors may come from Electron or from a request sent before a language change.
// Translate our own messages; leave server data, user-defined names and unknown errors intact.
export function translateMessage(message, language = defaultLanguage, depth = 0) {
  const text = String(message ?? '');
  const t = createTranslator(language);
  if (Object.prototype.hasOwnProperty.call(english, text)) return t(text);
  for (const item of patterns) {
    const match = text.match(item.regex);
    if (!match) continue;
    const values = [];
    item.indices.forEach((index, i) => { values[index] = match[i + 1]; });
    if (item.source === '本地数据读取失败：{0}' && depth < 3) values[0] = translateMessage(values[0], language, depth + 1);
    return t(item.source, values);
  }
  return text;
}

export function formatTime(value, language = defaultLanguage) {
  return new Date(value).toLocaleTimeString(language === 'en' ? 'en-US' : 'zh-CN', { hour: '2-digit', minute: '2-digit' });
}
export function formatDate(value, language = defaultLanguage) {
  return new Date(value).toLocaleDateString(language === 'en' ? 'en-US' : 'zh-CN', { month: '2-digit', day: '2-digit' });
}
