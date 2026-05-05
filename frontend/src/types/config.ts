/** 应用配置类型定义 */

export interface BackendConfig {
  /** 后端服务器地址，如 http://local.somebody.icu:8000 */
  host: string;
  /** API 路径前缀 */
  apiPath: string;
  /** WebSocket 路径前缀 */
  wsPath: string;
}

export interface AuthConfig {
  /**
   * 预配置的 Auth Token
   * ⚠️ 安全警告：此 Token 会被暴露给所有访问前端的用户
   * 仅建议在内部/受控环境使用，公网环境建议保持为空让用户手动输入
   */
  token?: string;
}

export interface AppInfo {
  /** 应用名称 */
  name: string;
  /** 版本号 */
  version: string;
}

export interface AppConfig {
  backend: BackendConfig;
  auth: AuthConfig;
  app: AppInfo;
}
