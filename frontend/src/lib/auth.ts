/**认证管理 */

const TOKEN_KEY = 'vibespeak_auth_token';

let cachedToken: string | null = null;

export function getAuthToken(): string | null {
  if (cachedToken) return cachedToken;

  // 从 localStorage 读取
  const stored = localStorage.getItem(TOKEN_KEY);
  if (stored) {
    cachedToken = stored;
    return stored;
  }

  // 从 URL query parameter 读取（方便分享链接）
  const urlParams = new URLSearchParams(window.location.search);
  const urlToken = urlParams.get('token');
  if (urlToken) {
    setAuthToken(urlToken);
    // 清除 URL中的 token，避免泄露
    urlParams.delete('token');
    const newUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '');
    window.history.replaceState({}, '', newUrl);
    return urlToken;
  }

  return null;
}

export function setAuthToken(token: string): void {
  cachedToken = token;
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuthToken(): void {
  cachedToken = null;
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