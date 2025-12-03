#!/bin/bash
# Full deployment script - cleans server and uploads everything fresh

set -e

VPS_HOST="72.61.71.4"
VPS_USER="root"
VPS_PATH="/root/youtube-crypto-bot"

echo "🚀 Full Server Deployment"
echo "========================="
echo ""
echo "VPS: $VPS_USER@$VPS_HOST"
echo "Path: $VPS_PATH"
echo ""
echo "⚠️  This will rebuild everything on the server"
echo ""

# Step 1: Build locally
echo "📦 Step 1: Building locally..."
npm run build

if [ ! -d "dist" ] || [ ! -d "client/dist" ]; then
    echo "❌ Error: Build failed! dist/ or client/dist/ not found"
    exit 1
fi

echo "✅ Local build complete"
echo ""

# Step 2: Create deployment package
echo "📦 Step 2: Preparing files for transfer..."
TEMP_DIR=$(mktemp -d)
echo "Using temp directory: $TEMP_DIR"

# Copy source files (excluding node_modules, dist, output, etc.)
rsync -avz --progress \
    --exclude 'node_modules' \
    --exclude 'client/node_modules' \
    --exclude 'dist' \
    --exclude 'client/dist' \
    --exclude 'output' \
    --exclude 'logs' \
    --exclude '.git' \
    --exclude '.env' \
    --exclude '*.log' \
    . "$TEMP_DIR/"

# Copy built files
cp -r dist "$TEMP_DIR/"
cp -r client/dist "$TEMP_DIR/client/"

echo "✅ Files prepared"
echo ""

# Step 3: Transfer to server
echo "📤 Step 3: Transferring files to server..."
echo "This may take a few minutes..."

rsync -avz --progress --delete \
    "$TEMP_DIR/" \
    $VPS_USER@$VPS_HOST:$VPS_PATH/

echo "✅ Files transferred"
echo ""

# Step 4: Cleanup temp directory
rm -rf "$TEMP_DIR"

# Step 5: Instructions for server
echo ""
echo "📋 Next steps on the server:"
echo ""
echo "ssh $VPS_USER@$VPS_HOST"
echo ""
echo "Then run:"
echo "  cd $VPS_PATH"
echo "  npm install"
echo "  cd client && npm install && cd .."
echo "  npm run build"
echo "  pm2 restart youtube-crypto-bot"
echo "  sudo systemctl reload nginx"
echo ""
echo "Or run this one-liner on the server:"
echo "  cd $VPS_PATH && npm install && cd client && npm install && cd .. && npm run build && pm2 restart youtube-crypto-bot && sudo systemctl reload nginx"
echo ""

