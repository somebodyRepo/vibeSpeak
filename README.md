# vibeSpeak

语音转文字服务，支持实时流式转写和批量文件转写。专注于普通话和四川方言识别，并提供 LLM 润色功能（方言转标准书面中文）。

## 功能特性

- **实时转写**: 麦克风录音 → WebSocket 流式传输 → 逐句显示
- **批量转写**: 上传音频文件 → 离线处理 → 时间戳分段展示
- **AI 润色**: 支持多模型（Anthropic/OpenAI/DeepSeek/GLM），方言转书面、纠错、会议纪要

## 技术栈

| 层次 | 技术 |
|------|------|
| ASR | FunASR + SenseVoiceSmall (~200MB模型) |
| 后端 | Python 3.11 + FastAPI |
| 前端 | React 18 + TypeScript + Vite + TailwindCSS |
| 数据库 | SQLite (本地) / PostgreSQL (在线) |

## 快速开始

### 前置要求

- Python 3.11+
- Node.js 18+
- ffmpeg (音频转码)

### 后端启动

```bash
cd backend

# 创建虚拟环境
python3.11 -m venv venv
source venv/bin/activate

# 安装依赖
pip install -e ".[dev]"

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入 LLM API key

# 启动服务
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 前端启动

```bash
cd frontend

npm install
npm run dev
```

访问 http://localhost:5173

### Docker 一键启动

```bash
docker-compose up -d
```

访问 http://localhost:3000

## 配置说明

后端 `.env` 配置项：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| LLM_PROVIDER | LLM 提供商 | anthropic |
| ANTHROPIC_API_KEY | Anthropic API Key | - |
| OPENAI_API_KEY | OpenAI API Key | - |
| DEEPSEEK_API_KEY | DeepSeek API Key | - |
| ZHIPU_API_KEY | GLM API Key | - |
| ASR_DEVICE | ASR 设备 (auto/cpu/cuda/mps) | auto |

## API 文档

启动后端后访问 http://localhost:8000/docs 查看 Swagger 文档。

主要路由：

- `POST /api/transcribe/upload` - 上传音频文件
- `GET /api/transcribe/{task_id}` - 查询转写结果
- `WS /ws/realtime` - 实时流式转写 WebSocket
- `POST /api/polish/` - 文本润色

## 项目结构

```
vibeSpeek/
├── backend/
│   ├── app/
│   │   ├── api/          # API 路由
│   │   ├── services/     # ASR/LLM 服务
│   │   ├── models/       # 数据模型
│   │   ├── core/         # 配置
│   │   └── main.py       # FastAPI 入口
│   ├── models/           # ASR 模型 (gitignored)
│   ├── uploads/          # 上传文件 (gitignored)
│   └── .env
├── frontend/
│   ├── src/
│   │   ├── components/   # React 组件
│   │   ├── hooks/        # 自定义 hooks
│   │   ├── lib/          # API 客户端
│   │   └── types/        # TypeScript 类型
│   └── package.json
├── docker-compose.yml
├── Makefile
└── README.md
```

## License

MIT