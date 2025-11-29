#!/bin/bash
# Run this on the server to set up git

set -e

cd /root/youtube-crypto-bot

echo "📦 Backing up .env file..."
cp .env .env.backup

echo "🔧 Initializing git..."
git init
git remote add origin https://github.com/mjohnson2000/CryptoB_Bot.git || git remote set-url origin https://github.com/mjohnson2000/CryptoB_Bot.git

echo "📥 Fetching from GitHub..."
git fetch origin

echo "🔄 Pulling latest code..."
git pull origin main --allow-unrelated-histories || {
    echo "⚠️  Conflicts detected. Resetting to match GitHub..."
    git reset --hard origin/main
}

echo "🔒 Restoring .env file..."
cp .env.backup .env

echo "✅ Git setup complete!"
echo ""
echo "Now rebuild:"
echo "  npm run build:server"
echo "  cd client && npm run build && cd .."
echo "  pm2 restart youtube-crypto-bot"
