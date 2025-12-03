#!/bin/bash
# Commands to run on the VPS server to check logs

echo "Run these commands on your VPS server:"
echo ""
echo "cd /root/youtube-crypto-bot"
echo "pm2 logs youtube-crypto-bot --lines 100 | grep -i 'automation\|error\|1:42\|01:42'"
echo ""
echo "Or to see all recent logs:"
echo "pm2 logs youtube-crypto-bot --lines 100"
echo ""
echo "To check PM2 status:"
echo "pm2 status"
echo ""

