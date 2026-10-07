import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { createTranslator } from '../shared/i18n.mjs';
import type { Language } from '../shared/i18n.mjs';
export { createTranslator, translateMessage, formatTime, formatDate, isLanguage } from '../shared/i18n.mjs';
export type { Language, Message, Translator } from '../shared/i18n.mjs';

const LanguageContext = createContext({ language: 'zh-CN' as Language, t: createTranslator() });
export function I18nProvider({ language, children }: { language: Language; children: ReactNode }) {
  const value = useMemo(() => ({ language, t: createTranslator(language) }), [language]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
export function useI18n() { return useContext(LanguageContext); }
