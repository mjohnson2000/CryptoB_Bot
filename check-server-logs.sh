#!/bin/bash
# Script to check server logs for automation errors

VPS_HOST="72.61.71.4"
VPS_USER="root"
VPS_PATH="/root/youtube-crypto-bot"

echo "📋 Checking Server Logs for Automation Errors"
echo "=============================================="
echo ""

echo "🔍 Checking PM2 logs (last 50 lines)..."
echo ""
ssh $VPS_USER@$VPS_HOST "cd $VPS_PATH && pm2 logs youtube-crypto-bot --lines 50 --nostream | grep -A 5 -B 5 -i 'automation\|error\|failed\|1:42\|01:42' || pm2 logs youtube-crypto-bot --lines 50 --nostream"

echo ""
echo ""
echo "📊 PM2 Status:"
ssh $VPS_USER@$VPS_HOST "pm2 status"

echo ""
echo ""
echo "📁 Checking log files..."
ssh $VPS_USER@$VPS_HOST "cd $VPS_PATH && ls -lah logs/ 2>/dev/null || echo 'No logs directory found'"

echo ""
echo "✅ Done"

