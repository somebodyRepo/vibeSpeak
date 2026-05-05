/** 应用配置管理 - 支持运行时配置 */

import type { AppConfig } from '../types/config';

// 默认配置（fallback）
const DEFAULT_CONFIG: AppConfig = {
  backend: {
    host: '', // 空表示使用相对路径（Caddy 代理模式下）
    apiPath: '/api',
    wsPath: '/ws',
  },
  auth: {
    token: undefined, // Caddy 代理模式下不需要配置
  },
  app: {
    name: 'vibeSpeak',
    version: '1.0.0',
  },
};

let configCache: AppConfig | null = null;

/**
 * 加载运行时配置
 * 从 /config.json 加载，如果不存在则使用默认配置
 */
export async function loadConfig(): Promise<AppConfig> {
  if (configCache) {
    return configCache;
  }

  try {
    const response = await fetch('/config.json');
    if (response.ok) {
      const userConfig = await response.json();
      configCache = { ...DEFAULT_CONFIG, ...userConfig };
      console.log('[Config] Loaded from /config.json:', configCache);
    } else {
      console.warn('[Config] /config.json not found, using defaults');
      configCache = DEFAULT_CONFIG;
    }
  } catch (error) {
    console.warn('[Config] Failed to load config, using defaults:', error);
    configCache = DEFAULT_CONFIG;
  }

  return configCache as AppConfig;
}

/**
 * 获取当前配置（需要先调用 loadConfig）
 */
export function getConfig(): AppConfig {
  if (!configCache) {
    console.warn('[Config] getConfig called before loadConfig, returning defaults');
    return DEFAULT_CONFIG;
  }
  return configCache;
}

/**
 * 后端基础 URL
 */
export function getBackendHost(): string {
  return getConfig().backend.host;
}

/**
 * API 基础路径
 * 如果 host 为空，使用相对路径（Caddy 代理模式）
 */
export function getApiBase(): string {
  const config = getConfig();
  const host = config.backend.host;
  // 如果 host 为空或 undefined，使用相对路径（同域名）
  return host ? `${host}${config.backend.apiPath}` : config.backend.apiPath;
}

/**
 * WebSocket 基础路径
 */
export function getWsBase(): string {
  const config = getConfig();
  return config.backend.host
    .replace('http:', 'ws:')
    .replace('https:', 'wss:');
}

/**
 * 获取完整的 WebSocket URL
 * 如果 host 为空，使用相对路径（Caddy 代理模式）
 */
export function getWebSocketUrl(path: string, token?: string | null): string {
  const config = getConfig();
  const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
  const host = config.backend.host;

  // path 已经包含 /ws 前缀，直接使用
  if (!host) {
    // Caddy 代理模式：使用相对路径，同域名访问
    return `${path}${tokenParam}`;
  }

  // 直接连接后端模式
  const wsHost = host
    .replace('http:', 'ws:')
    .replace('https:', 'wss:');
  return `${wsHost}${path}${tokenParam}`;
}

/**
 * 获取配置的 Auth Token（如果存在）
 * ⚠️ 注意：返回的 token 可能来自配置文件，会暴露给所有用户
 */
export function getConfiguredToken(): string | undefined {
  return getConfig().auth.token;
}

/**
 * 检查是否配置了预置的 Auth Token
 */
export function hasConfiguredToken(): boolean {
  return !!getConfig().auth.token;
}

// 为了兼容之前的同步调用，导出默认配置值
// 注意：实际值应在调用 loadConfig() 后通过 getConfig() 获取
export const BACKEND_HOST = DEFAULT_CONFIG.backend.host;
export const API_BASE = `${DEFAULT_CONFIG.backend.host}${DEFAULT_CONFIG.backend.apiPath}`;
export const WS_BASE = DEFAULT_CONFIG.backend.host.replace('http:', 'ws:').replace('https:', 'wss:');
