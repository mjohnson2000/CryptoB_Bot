#!/bin/bash
# Quick client-only deployment script

set -e

VPS_HOST="72.61.71.4"
VPS_USER="root"
VPS_PATH="/root/youtube-crypto-bot"

echo "🚀 Deploying Client Files Only"
echo "==============================="
echo ""

# Step 1: Build client locally
echo "📦 Building client..."
cd client
npm run build

if [ ! -d "dist" ]; then
    echo "❌ Error: Client build failed! dist/ not found"
    exit 1
fi

echo "✅ Client build complete"
echo ""

# Step 2: Transfer client dist to VPS
echo "📤 Transferring client files to VPS..."
rsync -avz --progress --delete \
    dist/ \
    $VPS_USER@$VPS_HOST:$VPS_PATH/client/dist/

echo "✅ Client files transferred"
echo ""

# Step 3: Reload nginx
echo "🔄 Reloading nginx..."
ssh $VPS_USER@$VPS_HOST "sudo systemctl reload nginx"

echo ""
echo "🎉 Client deployment complete!"
echo ""
echo "The updated client files are now on the VPS."
echo "Try refreshing the page (Ctrl+F5 or Cmd+Shift+R) to clear cache."
echo ""

