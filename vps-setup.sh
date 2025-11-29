#!/bin/bash

# VPS Setup Script
# Run this script ON YOUR VPS to set up the environment
# Usage: bash vps-setup.sh

set -e  # Exit on error

echo "🔧 YouTube Crypto Bot - VPS Setup Script"
echo "========================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${YELLOW}⚠️  Not running as root. Some commands may require sudo.${NC}"
    SUDO="sudo"
else
    SUDO=""
fi

echo -e "${GREEN}📦 Updating system packages...${NC}"
$SUDO apt update && $SUDO apt upgrade -y

echo ""
echo -e "${GREEN}📦 Installing Node.js (v20 LTS)...${NC}"
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO -E bash -
    $SUDO apt install -y nodejs
else
    echo -e "${YELLOW}Node.js already installed: $(node --version)${NC}"
fi

echo ""
echo -e "${GREEN}📦 Installing PM2...${NC}"
if ! command -v pm2 &> /dev/null; then
    $SUDO npm install -g pm2
else
    echo -e "${YELLOW}PM2 already installed${NC}"
fi

echo ""
echo -e "${GREEN}📦 Installing build tools...${NC}"
$SUDO apt install -y build-essential python3

echo ""
echo -e "${GREEN}📦 Installing FFmpeg...${NC}"
if ! command -v ffmpeg &> /dev/null; then
    $SUDO apt install -y ffmpeg
else
    echo -e "${YELLOW}FFmpeg already installed${NC}"
fi

echo ""
echo -e "${GREEN}📦 Installing Nginx...${NC}"
if ! command -v nginx &> /dev/null; then
    $SUDO apt install -y nginx
    $SUDO systemctl enable nginx
else
    echo -e "${YELLOW}Nginx already installed${NC}"
fi

echo ""
echo -e "${GREEN}✅ System setup complete!${NC}"
echo ""
echo "Installed versions:"
echo "  Node.js: $(node --version)"
echo "  npm: $(npm --version)"
echo "  PM2: $(pm2 --version)"
echo "  FFmpeg: $(ffmpeg -version | head -n 1)"
echo "  Nginx: $(nginx -v 2>&1)"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Navigate to your app directory"
echo "2. Create .env file with your environment variables"
echo "3. Run: npm install"
echo "4. Run: cd client && npm install && cd .."
echo "5. Run: npm run build"
echo "6. Run: pm2 start ecosystem.config.js"
echo "7. Run: pm2 save"
echo "8. Run: pm2 startup (and follow instructions)"
echo ""

