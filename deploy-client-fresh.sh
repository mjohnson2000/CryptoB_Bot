#!/bin/bash
# Fresh client deployment script - rebuilds and uploads client files to VPS

set -e

VPS_HOST="72.61.71.4"
VPS_USER="root"
VPS_PATH="/root/youtube-crypto-bot"
CLIENT_DIST_PATH="$VPS_PATH/client/dist"

echo "🚀 Fresh Client Deployment"
echo "========================="
echo ""
echo "VPS: $VPS_USER@$VPS_HOST"
echo "Path: $CLIENT_DIST_PATH"
echo ""

# Step 1: Build client locally
echo "📦 Step 1: Building client locally..."
cd client
npm install
npm run build
cd ..

if [ ! -d "client/dist" ]; then
    echo "❌ Error: client/dist directory not found after build!"
    exit 1
fi

echo "✅ Client built successfully"
echo ""

# Step 2: Backup old dist on server
echo "💾 Step 2: Backing up old dist on server..."
ssh $VPS_USER@$VPS_HOST "mkdir -p $VPS_PATH/client/dist.backup && \
    if [ -d '$CLIENT_DIST_PATH' ]; then \
        cp -r $CLIENT_DIST_PATH/* $VPS_PATH/client/dist.backup/ 2>/dev/null || true; \
    fi"

echo "✅ Backup created"
echo ""

# Step 3: Remove old dist on server
echo "🗑️  Step 3: Removing old dist on server..."
ssh $VPS_USER@$VPS_HOST "rm -rf $CLIENT_DIST_PATH/*"

echo "✅ Old files removed"
echo ""

# Step 4: Transfer new dist files
echo "📤 Step 4: Transferring fresh client files..."
rsync -avz --progress --delete \
    client/dist/ \
    $VPS_USER@$VPS_HOST:$CLIENT_DIST_PATH/

echo "✅ Files transferred"
echo ""

# Step 5: Verify files on server
echo "🔍 Step 5: Verifying files on server..."
ssh $VPS_USER@$VPS_HOST "ls -lh $CLIENT_DIST_PATH/ | head -10"

echo ""
echo "✅ Verification complete"
echo ""

# Step 6: Restart nginx
echo "🔄 Step 6: Reloading nginx..."
ssh $VPS_USER@$VPS_HOST "sudo nginx -t && sudo systemctl reload nginx"

echo ""
echo "✅ Nginx reloaded"
echo ""

# Step 7: Clear nginx cache (if any)
echo "🧹 Step 7: Clearing nginx cache..."
ssh $VPS_USER@$VPS_HOST "sudo rm -rf /var/cache/nginx/* 2>/dev/null || true"

echo ""
echo "🎉 Deployment Complete!"
echo ""
echo "📋 Next steps:"
echo "   1. Open https://cryptobnews.com in your browser"
echo "   2. Hard refresh (Cmd+Shift+R or Ctrl+Shift+R)"
echo "   3. Try incognito mode if you still see old UI"
echo ""
echo "If issues persist, check:"
echo "   - Browser cache (clear completely)"
echo "   - Nginx is serving from: $CLIENT_DIST_PATH"
echo "   - Files exist: ssh $VPS_USER@$VPS_HOST 'ls -la $CLIENT_DIST_PATH'"

