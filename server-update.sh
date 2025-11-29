#!/bin/bash
# Run this script on the server to update from GitHub

set -e

echo "🔄 Updating from GitHub..."
cd /root/youtube-crypto-bot

echo "📥 Pulling latest code..."
git pull origin main

echo "🔨 Building server..."
npm run build:server

echo "🔨 Building client..."
cd client
npm run build
cd ..

echo "🔄 Restarting services..."
pm2 restart youtube-crypto-bot
sudo systemctl restart nginx

echo ""
echo "✅ Update complete!"
echo "📊 Check status:"
pm2 status
