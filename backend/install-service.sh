#!/bin/bash
# vibeSpeak 后端服务安装脚本
# 使用 launchctl 配置为系统守护进程

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLIST_NAME="com.vibespeak.backend"
PLIST_PATH="$SCRIPT_DIR/com.vibespeak.plist"
DEST_PLIST="$HOME/Library/LaunchAgents/$PLIST_NAME.plist"

echo "=== vibeSpeak 后端服务安装脚本 ==="
echo ""

# 检查 .env 文件是否存在
if [ ! -f "$SCRIPT_DIR/.env" ]; then
    echo "警告: .env 文件不存在，请先配置 .env 文件"
    echo "可以复制 .env.example 并修改："
    echo "  cp $SCRIPT_DIR/.env.example $SCRIPT_DIR/.env"
    exit 1
fi

# 检查虚拟环境
if [ ! -d "$SCRIPT_DIR/venv" ]; then
    echo "错误: 虚拟环境不存在，请先运行："
    echo "  python3.11 -m venv venv"
    echo "  source venv/bin/activate"
    echo "  pip install -e ."
    exit 1
fi

# 检查日志目录
mkdir -p "$SCRIPT_DIR/logs"

echo "1. 停止现有服务（如果存在）..."
launchctl stop "$PLIST_NAME" 2>/dev/null || true
launchctl unload "$DEST_PLIST" 2>/dev/null || true

echo "2. 复制 plist 文件..."
cp "$PLIST_PATH" "$DEST_PLIST"

echo "3. 加载服务..."
launchctl load "$DEST_PLIST"

echo "4. 启动服务..."
launchctl start "$PLIST_NAME"

echo ""
echo "=== 安装完成 ==="
echo ""
echo "服务状态:"
echo "  launchctl list | grep vibespeak"
echo ""
echo "查看日志:"
echo "  tail -f $SCRIPT_DIR/logs/stdout.log"
echo "  tail -f $SCRIPT_DIR/logs/stderr.log"
echo ""
echo "停止服务:"
echo "  launchctl stop $PLIST_NAME"
echo ""
echo "卸载服务:"
echo "  launchctl unload $DEST_PLIST"
echo ""
echo "服务将在开机时自动启动。"
