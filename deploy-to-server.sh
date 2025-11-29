#!/bin/bash
# Simple deployment script - commits, pushes, and updates server

set -e

echo "🚀 Deploying to server via GitHub..."
echo ""

# Step 1: Commit all changes
echo "📝 Committing changes..."
git add -A
git commit -m "Update: Audio chunking fix and UI improvements" || echo "No changes to commit"

# Step 2: Push to GitHub
echo "📤 Pushing to GitHub..."
git push origin main

echo ""
echo "✅ Code pushed to GitHub!"
echo ""
echo "📋 Now run these commands on the server:"
echo "   cd /root/youtube-crypto-bot"
echo "   git pull origin main"
echo "   npm run build"
echo "   cd client && npm run build && cd .."
echo "   pm2 restart youtube-crypto-bot"
echo "   sudo systemctl restart nginx"
echo ""
