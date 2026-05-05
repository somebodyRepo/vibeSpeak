.PHONY: help install dev build clean docker-up docker-down docker-logs

help: ## 显示帮助信息
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

install: ## 安装所有依赖
	cd backend && python3.11 -m venv venv && source venv/bin/activate && pip install -e ".[dev]"
	cd frontend && npm install

dev-backend: ## 启动后端开发服务器
	cd backend && source venv/bin/activate && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

dev-frontend: ## 启动前端开发服务器
	cd frontend && npm run dev

dev: ## 同时启动前后端 (需要两个终端)
	@echo "请在两个终端分别运行: make dev-backend 和 make dev-frontend"

build-backend: ## 构建后端
	cd backend && source venv/bin/activate && pip install -e .

build-frontend: ## 构建前端
	cd frontend && npm run build

build: build-backend build-frontend ## 构建前后端

clean: ## 清理构建产物
	rm -rf frontend/dist frontend/node_modules backend/__pycache__ backend/app/__pycache__
	find backend -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true

docker-up: ## 启动 Docker 服务
	docker-compose up -d

docker-down: ## 停止 Docker 服务
	docker-compose down

docker-logs: ## 查看 Docker 日志
	docker-compose logs -f

docker-build: ## 构建 Docker 镜像
	docker-compose build

test-backend: ## 运行后端测试
	cd backend && source venv/bin/activate && pytest

lint-backend: ## 后端代码检查
	cd backend && source venv/bin/activate && ruff check app/ && black --check app/

lint-frontend: ## 前端代码检查
	cd frontend && npm run lint