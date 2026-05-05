#!/bin/bash
# VibeSpeak Frontend Deployment Script
# Run as root or with sudo

set -e

echo "=== VibeSpeak Frontend Deployment ==="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root for some operations
if [ "$EUID" -ne 0 ]; then
    echo -e "${YELLOW}Note: Some operations may require sudo privileges${NC}"
fi

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(dirname "$SCRIPT_DIR")"

echo -e "${GREEN}[1/6] Installing frontend dependencies...${NC}"
cd "$FRONTEND_DIR"
if [ ! -d "node_modules" ]; then
    npm install
fi

echo -e "${GREEN}[2/6] Building frontend for production...${NC}"
npm run build

echo -e "${GREEN}[3/6] Installing systemd service...${NC}"
if [ "$EUID" -eq 0 ]; then
    cp "$SCRIPT_DIR/vibespeak-frontend.service" /etc/systemd/system/
    systemctl daemon-reload
    systemctl enable vibespeak-frontend.service
    echo -e "${GREEN}Systemd service installed and enabled${NC}"
else
    echo -e "${YELLOW}Please run as root to install systemd service:${NC}"
    echo "  sudo cp $SCRIPT_DIR/vibespeak-frontend.service /etc/systemd/system/"
    echo "  sudo systemctl daemon-reload"
    echo "  sudo systemctl enable vibespeak-frontend.service"
fi

echo -e "${GREEN}[4/6] Installing Caddy configuration...${NC}"
if command -v caddy &> /dev/null; then
    if [ "$EUID" -eq 0 ]; then
        # Check if Caddy uses Caddyfile or individual configs
        if [ -d "/etc/caddy/conf.d" ]; then
            cp "$SCRIPT_DIR/Caddyfile" /etc/caddy/conf.d/vibespeak.conf
            echo -e "${GREEN}Caddy config installed to /etc/caddy/conf.d/vibespeak.conf${NC}"
        elif [ -f "/etc/caddy/Caddyfile" ]; then
            cat "$SCRIPT_DIR/Caddyfile" >> /etc/caddy/Caddyfile
            echo -e "${GREEN}Caddy config appended to /etc/caddy/Caddyfile${NC}"
        else
            cp "$SCRIPT_DIR/Caddyfile" /etc/caddy/Caddyfile
            echo -e "${GREEN}Caddy config installed to /etc/caddy/Caddyfile${NC}"
        fi

        # Create log directory
        mkdir -p /var/log/caddy
        chown caddy:caddy /var/log/caddy 2>/dev/null || true

        # Reload Caddy
        systemctl reload caddy || systemctl restart caddy
        echo -e "${GREEN}Caddy reloaded${NC}"
    else
        echo -e "${YELLOW}Please run as root to install Caddy config:${NC}"
        echo "  sudo cp $SCRIPT_DIR/Caddyfile /etc/caddy/Caddyfile"
        echo "  sudo mkdir -p /var/log/caddy"
        echo "  sudo systemctl reload caddy"
    fi
else
    echo -e "${YELLOW}Caddy not found. Please install Caddy first:${NC}"
    echo "  sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https"
    echo "  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg"
    echo "  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list"
    echo "  sudo apt update && sudo apt install caddy"
fi

echo -e "${GREEN}[5/6] Opening firewall ports...${NC}"
if command -v ufw &> /dev/null; then
    ufw allow 80/tcp || true
    ufw allow 443/tcp || true
    echo -e "${GREEN}Firewall configured (ufw)${NC}"
elif command -v firewall-cmd &> /dev/null; then
    firewall-cmd --permanent --add-service=http 2>/dev/null || true
    firewall-cmd --permanent --add-service=https 2>/dev/null || true
    firewall-cmd --reload 2>/dev/null || true
    echo -e "${GREEN}Firewall configured (firewalld)${NC}"
fi

echo -e "${GREEN}[6/6] Deployment complete!${NC}"
echo ""
echo "=== Next Steps ==="
echo ""
echo "1. Start the frontend service:"
if [ "$EUID" -eq 0 ]; then
    echo "   sudo systemctl start vibespeak-frontend"
else
    echo "   sudo systemctl start vibespeak-frontend"
fi
echo ""
echo "2. Check service status:"
echo "   sudo systemctl status vibespeak-frontend"
echo ""
echo "3. View logs:"
echo "   sudo journalctl -u vibespeak-frontend -f"
echo ""
echo "4. Ensure DNS is configured:"
echo "   vibeSpeak.somebody.icu → $(curl -s ifconfig.me || echo 'your-server-ip')"
echo ""
echo "5. The frontend will be available at:"
echo "   https://vibeSpeak.somebody.icu"
echo ""
echo "6. Backend connection:"
echo "   Frontend → http://local.somebody.icu:8000"
echo ""
