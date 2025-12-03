#!/bin/bash
# Script to copy .env file to VPS

VPS_HOST="72.61.71.4"
VPS_USER="root"
VPS_PATH="/root/youtube-crypto-bot"

echo "📋 Copying .env file to VPS"
echo "============================"
echo ""

if [ ! -f ".env" ]; then
    echo "❌ Error: .env file not found in current directory"
    echo "Please make sure you're in the project root directory"
    exit 1
fi

echo "📤 Copying .env to VPS..."
scp .env $VPS_USER@$VPS_HOST:$VPS_PATH/.env

if [ $? -eq 0 ]; then
    echo "✅ .env file copied successfully"
    echo ""
    echo "🔄 Restarting PM2 to load environment variables..."
    ssh $VPS_USER@$VPS_HOST "cd $VPS_PATH && pm2 restart youtube-crypto-bot"
    echo ""
    echo "✅ PM2 restarted"
    echo ""
    echo "📊 Checking environment variables..."
    ssh $VPS_USER@$VPS_HOST "cd $VPS_PATH && pm2 logs youtube-crypto-bot --lines 5 --nostream | grep -i 'Environment loaded'"
    echo ""
    echo "🎉 Done! The automation should now work."
else
    echo "❌ Failed to copy .env file"
    exit 1
fi

