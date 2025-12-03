#!/bin/bash
# Complete clean redeployment script
# Clears everything on VPS and uploads fresh build

set -e

VPS_HOST="72.61.71.4"
VPS_USER="root"
VPS_PATH="/root/youtube-crypto-bot"

echo "🧹 Complete Clean Redeployment"
echo "=============================="
echo ""
echo "VPS: $VPS_USER@$VPS_HOST"
echo "Path: $VPS_PATH"
echo ""
echo "⚠️  This will:"
echo "   1. Stop and delete PM2 process"
echo "   2. Completely clear the VPS directory"
echo "   3. Build everything locally"
echo "   4. Upload fresh files"
echo "   5. Install dependencies"
echo "   6. Restart everything"
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

# Step 2: Stop and clean on VPS
echo "🛑 Step 2: Stopping app and cleaning VPS..."
ssh $VPS_USER@$VPS_HOST << 'ENDSSH'
cd /root/youtube-crypto-bot
pm2 delete youtube-crypto-bot || true
pm2 save --force || true
cd /root
rm -rf youtube-crypto-bot
mkdir -p youtube-crypto-bot
ENDSSH

echo "✅ VPS cleaned"
echo ""

# Step 3: Transfer all files
echo "📤 Step 3: Transferring files to VPS..."
echo "This may take a few minutes..."

# Create temp directory
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

# Step 4: Install and setup on VPS
echo "⚙️  Step 4: Installing dependencies and setting up on VPS..."
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

# Create logs directory if it doesn't exist
mkdir -p logs

# Start with PM2
echo "Starting with PM2..."
pm2 start dist/server/index.js --name youtube-crypto-bot
pm2 save

# Reload nginx
echo "Reloading nginx..."
sudo systemctl reload nginx

echo ""
echo "✅ Setup complete!"
echo ""
pm2 status
pm2 logs youtube-crypto-bot --lines 10
ENDSSH

echo ""
echo "🎉 Clean Redeployment Complete!"
echo ""
echo "⚠️  IMPORTANT: You need to copy your .env file to the VPS:"
echo "   scp .env root@72.61.71.4:/root/youtube-crypto-bot/.env"
echo ""
echo "Then restart PM2:"
echo "   ssh root@72.61.71.4 'cd /root/youtube-crypto-bot && pm2 restart youtube-crypto-bot'"
echo ""

