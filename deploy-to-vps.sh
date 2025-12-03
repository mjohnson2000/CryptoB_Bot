#!/bin/bash
# Complete VPS Deployment Script
# Clears current app and uploads fresh version from Mac

set -e

VPS_HOST="72.61.71.4"
VPS_USER="root"
VPS_PATH="/root/youtube-crypto-bot"

echo "🚀 Complete VPS Deployment"
echo "=========================="
echo ""
echo "VPS: $VPS_USER@$VPS_HOST"
echo "Path: $VPS_PATH"
echo ""
echo "⚠️  This will:"
echo "   1. Stop the current app on VPS"
echo "   2. Clear the existing deployment"
echo "   3. Build locally"
echo "   4. Upload everything to VPS"
echo "   5. Install dependencies and restart"
echo ""

read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled."
    exit 1
fi

# Step 1: Build locally
echo ""
echo "📦 Step 1: Building locally..."
npm run build

if [ ! -d "dist" ] || [ ! -d "client/dist" ]; then
    echo "❌ Error: Build failed! dist/ or client/dist/ not found"
    exit 1
fi

echo "✅ Local build complete"
echo ""

# Step 2: Stop app on VPS
echo "🛑 Step 2: Stopping app on VPS..."
ssh $VPS_USER@$VPS_HOST "cd $VPS_PATH && pm2 stop youtube-crypto-bot || true"
echo "✅ App stopped"
echo ""

# Step 3: Clear existing deployment
echo "🧹 Step 3: Clearing existing deployment on VPS..."
ssh $VPS_USER@$VPS_HOST "rm -rf $VPS_PATH/* $VPS_PATH/.* 2>/dev/null || true"
ssh $VPS_USER@$VPS_HOST "mkdir -p $VPS_PATH"
echo "✅ VPS cleared"
echo ""

# Step 4: Transfer files
echo "📤 Step 4: Transferring files to VPS..."
echo "This may take a few minutes..."

# Create temp directory for transfer
TEMP_DIR=$(mktemp -d)
echo "Using temp directory: $TEMP_DIR"

# Copy all files except exclusions
rsync -avz --progress \
    --exclude 'node_modules' \
    --exclude 'client/node_modules' \
    --exclude 'output' \
    --exclude 'logs' \
    --exclude '.git' \
    --exclude '.env' \
    --exclude '*.log' \
    --exclude '.DS_Store' \
    . "$TEMP_DIR/"

# Transfer to VPS
rsync -avz --progress \
    "$TEMP_DIR/" \
    $VPS_USER@$VPS_HOST:$VPS_PATH/

# Cleanup temp directory
rm -rf "$TEMP_DIR"

echo "✅ Files transferred"
echo ""

# Step 5: Install dependencies and restart on VPS
echo "⚙️  Step 5: Installing dependencies and restarting on VPS..."
ssh $VPS_USER@$VPS_HOST << 'ENDSSH'
cd /root/youtube-crypto-bot

# Install server dependencies
echo "Installing server dependencies..."
npm install

# Install client dependencies
echo "Installing client dependencies..."
cd client && npm install && cd ..

# Build on server (to ensure everything is compiled)
echo "Building on server..."
npm run build

# Restart PM2
echo "Restarting PM2..."
pm2 restart youtube-crypto-bot || pm2 start ecosystem.config.js

# Reload nginx
echo "Reloading nginx..."
sudo systemctl reload nginx

echo ""
echo "✅ Deployment complete!"
echo ""
pm2 status
ENDSSH

echo ""
echo "🎉 Deployment Complete!"
echo ""
echo "The app should now be running on your VPS."
echo "Check status with: ssh $VPS_USER@$VPS_HOST 'pm2 status'"
echo ""

