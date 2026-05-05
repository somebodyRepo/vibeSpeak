# VibeSpeak Frontend 部署指南

## 架构说明

### 安全架构（推荐）

```
用户 → HTTPS://你的域名 → Caddy
                              ↓
                       ┌──────────────────────────────┐
                       │  Caddy 自动注入 Auth Token   │
                       │  (Token 不暴露给前端)        │
                       └──────────────────────────────┘
                              ↓
                       ┌──────────┐    ┌──────────┐
                       │ /api/*   │ →  │ Backend  │
                       │ /ws/*    │    │ (8000)   │
                       └──────────┘    └──────────┘
                              ↓
                       ┌──────────┐
                       │ /*       │ →  Frontend (:5173)
                       └──────────┘
```

**安全优势：**
- ✅ Auth Token 只存在于服务器 Caddy 配置
- ✅ 用户无法通过浏览器开发者工具获取 Token
- ✅ Token 只在服务器间传输

## 环境要求

- Node.js 18+
- npm 9+
- Caddy 2+
- systemd (Linux)

## 快速部署

### 1. 配置 Caddy（关键步骤）

```bash
# 复制示例配置到系统目录（不在 git 仓库中）
sudo cp deploy/Caddyfile.example /etc/caddy/Caddyfile.d/vibespeak.conf

# 编辑配置，填入你的实际信息
sudo vim /etc/caddy/Caddyfile.d/vibespeak.conf
```

需要替换的占位符：
- `YOUR_DOMAIN` → 你的域名（如：vibespeak.example.com）
- `YOUR_BACKEND_HOST` → 后端地址（如：backend.internal）
- `YOUR_AUTH_TOKEN` → 后端认证 Token

**更安全：使用环境变量**

```bash
# 编辑 Caddy systemd 服务
sudo systemctl edit caddy

# 添加环境变量
[Service]
Environment="AUTH_TOKEN=你的实际Token"
```

然后 Caddyfile 中使用：
```caddyfile
header_up Authorization "Bearer {env.AUTH_TOKEN}"
```

### 2. 安装依赖并构建

```bash
cd /home/ubuntu/app/vibeSpeak/frontend
npm install
npm run build
```

### 3. 配置前端（如需要）

如果使用 Caddy 代理模式，保持默认配置即可：

```bash
# 确认 config.json 存在（已自动创建）
cat public/config.json
```

如需直接连接后端（不经过 Caddy），编辑 `public/config.json`：
```json
{
  "backend": {
    "host": "http://你的后端地址:8000"
  }
}
```

### 4. 运行部署脚本

```bash
sudo bash deploy/install.sh
```

### 5. 启动服务

```bash
sudo systemctl start vibespeak-frontend
sudo systemctl reload caddy
```

## 服务管理

```bash
# 前端服务
sudo systemctl {start|stop|restart|status} vibespeak-frontend
sudo journalctl -u vibespeak-frontend -f

# Caddy 服务
sudo systemctl reload caddy
sudo journalctl -u caddy -f
```

## 配置文件说明

### Caddyfile（敏感信息）

| 路径 | 行为 | Token 注入 |
|------|------|-----------|
| `/api/*` | 转发到后端 | Caddy 添加 |
| `/ws/*` | WebSocket 转发 | Caddy 添加 |
| `/*` | 转发到前端 | 无 |

**位置**: `/etc/caddy/Caddyfile.d/vibespeak.conf`（系统目录，不在 git 中）

### 前端配置

**位置**: `public/config.json`（已被 .gitignore 忽略）

Caddy 代理模式下：
```json
{
  "backend": { "host": "" }
}
```

## 安全最佳实践

1. **敏感文件位置**：
   - ✅ Caddyfile → `/etc/caddy/`（系统目录）
   - ✅ config.json → `public/`（被 gitignore 忽略）
   - ✅ Token → 环境变量或系统配置文件

2. **文件权限**：
   ```bash
   sudo chmod 600 /etc/caddy/Caddyfile.d/vibespeak.conf
   ```

3. **Git 提交检查**：
   ```bash
   # 确认敏感文件不会被提交
   git status
   # 应该看不到 Caddyfile 和 config.json
   ```

## 故障排查

### 服务无法启动

```bash
# 检查日志
sudo journalctl -u vibespeak-frontend -n 20
sudo journalctl -u caddy -n 20

# 验证 Caddy 配置
sudo caddy validate --config /etc/caddy/Caddyfile
```

### API 返回 401

检查 Caddy 是否正确注入 Token：
```bash
sudo grep -n "Authorization" /etc/caddy/Caddyfile.d/vibespeak.conf
```

## Git 安全清单

提交代码前确认：

- [ ] `deploy/Caddyfile` 不在 `git status` 中
- [ ] `public/config.json` 不在 `git status` 中
- [ ] README.md 中没有真实的 Token 或域名
- [ ] 所有敏感信息都已替换为占位符（YOUR_XXX）
