/** 认证管理 */

import { getConfiguredToken } from './config';

const TOKEN_KEY = 'vibespeak_auth_token';

// 缓存的 token（来自 localStorage，用户手动输入）
let userTokenCache: string | null = null;
// 标记是否已初始化 userTokenCache
let userTokenInitialized = false;

/**
 * 初始化用户 token 缓存（仅来自 localStorage）
 */
function initUserTokenCache(): void {
  if (userTokenInitialized) return;

  const stored = localStorage.getItem(TOKEN_KEY);
  if (stored) {
    userTokenCache = stored;
  }
  userTokenInitialized = true;
}

export function getAuthToken(): string | null {
  // 1. 初始化用户 token 缓存（来自 localStorage）
  initUserTokenCache();
  if (userTokenCache) return userTokenCache;

  // 2. 从 URL query parameter 读取（方便分享链接）
  const urlParams = new URLSearchParams(window.location.search);
  const urlToken = urlParams.get('token');
  if (urlToken) {
    setAuthToken(urlToken);
    // 清除 URL 中的 token，避免泄露
    urlParams.delete('token');
    const newUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '');
    window.history.replaceState({}, '', newUrl);
    return urlToken;
  }

  // 3. 从配置文件读取（每次调用都重新读取，确保配置加载后能获取到）
  const configuredToken = getConfiguredToken();
  if (configuredToken) {
    return configuredToken;
  }

  return null;
}

export function setAuthToken(token: string): void {
  userTokenCache = token;
  userTokenInitialized = true;
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuthToken(): void {
  userTokenCache = null;
  userTokenInitialized = true;
  localStorage.removeItem(TOKEN_KEY);
}

export function hasAuthToken(): boolean {
  return getAuthToken() !== null;
}

export function getAuthHeaders(): Record<string, string> {
  const token = getAuthToken();
  if (!token) return {};

  return {
    'Authorization': `Bearer ${token}`,
  };
}

/**
 * 检查是否使用了配置文件中的预置 token
 */
export function isUsingConfiguredToken(): boolean {
  // 如果用户设置了 localStorage token，说明不是使用配置文件的
  initUserTokenCache();
  if (userTokenCache) return false;

  // 检查是否使用了配置文件的 token
  const configuredToken = getConfiguredToken();
  const currentToken = getAuthToken();
  return configuredToken !== undefined && currentToken === configuredToken;
}
