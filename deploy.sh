#!/bin/bash

# Deployment script for Hostinger VPS
# This script helps you deploy the YouTube Crypto Bot to your VPS

set -e  # Exit on error

echo "🚀 YouTube Crypto Bot - Deployment Script"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo -e "${RED}❌ Error: .env file not found!${NC}"
    echo "Please create a .env file with all required environment variables."
    exit 1
fi

echo -e "${GREEN}✅ .env file found${NC}"
echo ""

# Get VPS details
read -p "Enter your VPS IP address or hostname: " VPS_HOST
read -p "Enter your VPS username (default: root): " VPS_USER
VPS_USER=${VPS_USER:-root}

read -p "Enter deployment path on VPS (default: /var/www/youtube-crypto-bot): " DEPLOY_PATH
DEPLOY_PATH=${DEPLOY_PATH:-/var/www/youtube-crypto-bot}

echo ""
echo -e "${YELLOW}Deployment Configuration:${NC}"
echo "  VPS Host: $VPS_HOST"
echo "  VPS User: $VPS_USER"
echo "  Deploy Path: $DEPLOY_PATH"
echo ""

read -p "Continue with deployment? (y/n): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled."
    exit 0
fi

echo ""
echo -e "${GREEN}📦 Building project...${NC}"
npm run build

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Build failed!${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}📤 Transferring files to VPS...${NC}"

# Create deployment directory on VPS
ssh $VPS_USER@$VPS_HOST "mkdir -p $DEPLOY_PATH"

# Transfer files (exclude node_modules, .git, etc.)
rsync -avz --progress \
    --exclude 'node_modules' \
    --exclude 'client/node_modules' \
    --exclude '.git' \
    --exclude 'output' \
    --exclude 'logs' \
    --exclude 'dist' \
    --exclude 'client/dist' \
    --exclude '.env' \
    . $VPS_USER@$VPS_HOST:$DEPLOY_PATH/

echo ""
echo -e "${GREEN}✅ Files transferred successfully${NC}"
echo ""
echo -e "${YELLOW}Next steps on your VPS:${NC}"
echo ""
echo "1. SSH into your VPS:"
echo "   ssh $VPS_USER@$VPS_HOST"
echo ""
echo "2. Navigate to deployment directory:"
echo "   cd $DEPLOY_PATH"
echo ""
echo "3. Create .env file (copy from local or create new):"
echo "   nano .env"
echo ""
echo "4. Install dependencies:"
echo "   npm install"
echo "   cd client && npm install && cd .."
echo ""
echo "5. Build the project:"
echo "   npm run build"
echo ""
echo "6. Start with PM2:"
echo "   pm2 start ecosystem.config.js"
echo "   pm2 save"
echo ""
echo "7. Set up Nginx (if needed):"
echo "   See DEPLOYMENT.md for Nginx configuration"
echo ""
echo -e "${GREEN}Deployment script completed!${NC}"

