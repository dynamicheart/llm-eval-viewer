/* Copyright (c) 2026 dynamicheart. Licensed under the MIT License. */

import { createI18n } from 'vue-i18n';
import en from './en.js';
import zhCN from './zh-CN.js';

const LOCALE_KEY = 'evalscope_locale';

const i18n = createI18n({
  legacy: false,
  locale: localStorage.getItem(LOCALE_KEY) || 'zh-CN',
  fallbackLocale: 'en',
  messages: {
    en,
    'zh-CN': zhCN,
  },
});

/**
 * Switch locale and persist to localStorage.
 * @param {'en' | 'zh-CN'} locale
 */
export function setLocale(locale) {
  i18n.global.locale.value = locale;
  localStorage.setItem(LOCALE_KEY, locale);
}

/**
 * Get the current locale.
 * @returns {'en' | 'zh-CN'}
 */
export function getLocale() {
  return i18n.global.locale.value;
}

export default i18n;
