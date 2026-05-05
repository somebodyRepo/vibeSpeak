"""认证中间件"""
import secrets
from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import get_settings

settings = get_settings()
security = HTTPBearer(auto_error=False)


class AuthMiddleware(BaseHTTPMiddleware):
    """HTTP 认证中间件"""

    # 不需要认证的路径
    PUBLIC_PATHS = {
        "/",
        "/docs",
        "/openapi.json",
        "/redoc",
        "/api/health",
    }

    async def dispatch(self, request: Request, call_next):
        # 如果未启用认证，直接放行
        if not settings.auth_enabled:
            return await call_next(request)

        # 检查是否是公开路径
        path = request.url.path
        if path in self.PUBLIC_PATHS or path.startswith("/ws/"):
            return await call_next(request)

        # 检查 Authorization header
        auth_header = request.headers.get("Authorization")
        if not auth_header:
            return self._unauthorized_response("Missing Authorization header")

        # 解析 Bearer token
        parts = auth_header.split()
        if len(parts) != 2 or parts[0].lower() != "bearer":
            return self._unauthorized_response("Invalid Authorization header format")

        token = parts[1]
        if not self._verify_token(token):
            return self._unauthorized_response("Invalid or expired token")

        return await call_next(request)

    def _verify_token(self, token: str) -> bool:
        """验证 token"""
        if not settings.auth_token:
            return False
        # 使用常量时间比较防止时序攻击
        return secrets.compare_digest(token, settings.auth_token)

    def _unauthorized_response(self, message: str):
        """返回 401 响应"""
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"detail": message},
            headers={"WWW-Authenticate": "Bearer"},
        )


async def verify_token(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> str:
    """FastAPI 依赖项：验证 token（用于 WebSocket）"""
    if not settings.auth_enabled:
        return ""

    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    if not secrets.compare_digest(token, settings.auth_token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return token
