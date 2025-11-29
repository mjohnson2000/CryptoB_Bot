# PM2 Process Manager Setup

This guide explains how to use PM2 to keep your server running 24/7 with automatic restart on crashes.

## What is PM2?

PM2 is a production process manager for Node.js applications that:
- ✅ Keeps your server running forever
- ✅ Auto-restarts on crashes
- ✅ Auto-restarts on server reboots
- ✅ Monitors memory and CPU usage
- ✅ Provides log management
- ✅ Zero-downtime reloads

## Installation

```bash
npm install -g pm2
```

## Quick Start

### 1. Build the project
```bash
npm run build
```

### 2. Start with PM2
```bash
npm run start:pm2
```

Or manually:
```bash
pm2 start ecosystem.config.js
```

### 3. Check status
```bash
npm run status:pm2
```

Or manually:
```bash
pm2 status
```

## Available Commands

| Command | Description |
|---------|-------------|
| `npm run start:pm2` | Start the server with PM2 |
| `npm run stop:pm2` | Stop the server |
| `npm run restart:pm2` | Restart the server |
| `npm run logs:pm2` | View server logs |
| `npm run status:pm2` | Check server status |
| `npm run monit:pm2` | Open PM2 monitoring dashboard |

## PM2 Commands Reference

### Basic Commands
```bash
# Start application
pm2 start ecosystem.config.js

# Stop application
pm2 stop youtube-crypto-bot

# Restart application
pm2 restart youtube-crypto-bot

# Delete application from PM2
pm2 delete youtube-crypto-bot

# View logs
pm2 logs youtube-crypto-bot

# View real-time logs
pm2 logs youtube-crypto-bot --lines 100

# Monitor CPU/Memory
pm2 monit
```

### Advanced Commands
```bash
# Save PM2 process list (for auto-start on reboot)
pm2 save

# Setup PM2 to start on system boot
pm2 startup

# View detailed info
pm2 show youtube-crypto-bot

# Reload app (zero-downtime)
pm2 reload youtube-crypto-bot

# Flush all logs
pm2 flush

# View all processes
pm2 list
```

## Auto-Start on System Reboot

To make PM2 start your app automatically when the server reboots:

```bash
# 1. Save current PM2 process list
pm2 save

# 2. Generate startup script
pm2 startup

# 3. Run the command that PM2 outputs (it will be different for each system)
# Example: sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u yourusername --hp /home/yourusername
```

## Logs

Logs are stored in the `logs/` directory:
- `pm2-error.log` - Error logs
- `pm2-out.log` - Standard output logs
- `pm2-combined.log` - All logs combined

View logs in real-time:
```bash
pm2 logs youtube-crypto-bot --lines 100
```

## Monitoring

### Real-time Monitoring
```bash
pm2 monit
```

This shows:
- CPU usage
- Memory usage
- Logs in real-time
- Process status

### Web Dashboard (Optional)
```bash
pm2 web
```
Then visit `http://localhost:9615` in your browser.

## Configuration

The PM2 configuration is in `ecosystem.config.js`. Key settings:

- **autorestart**: `true` - Auto-restart on crashes
- **max_memory_restart**: `1G` - Restart if memory exceeds 1GB
- **max_restarts**: `10` - Max restarts per minute
- **restart_delay**: `4000` - Wait 4 seconds before restarting

## Troubleshooting

### Server won't start
```bash
# Check logs
pm2 logs youtube-crypto-bot --err

# Check if port is in use
lsof -i :3001

# View detailed info
pm2 show youtube-crypto-bot
```

### Server keeps restarting
```bash
# Check error logs
pm2 logs youtube-crypto-bot --err --lines 50

# Check if it's a memory issue
pm2 monit
```

### Remove PM2 completely
```bash
pm2 delete youtube-crypto-bot
pm2 kill
```

## Production Best Practices

1. **Always use PM2 in production** - Never run `npm start` directly
2. **Set up auto-start on reboot** - Use `pm2 startup` and `pm2 save`
3. **Monitor logs regularly** - Check `pm2 logs` for errors
4. **Set up log rotation** - PM2 handles this automatically
5. **Monitor resource usage** - Use `pm2 monit` to watch CPU/memory

## Alternative: Running Without PM2

If you prefer not to use PM2, the server now has built-in crash protection:
- Global error handlers prevent crashes
- Uncaught exceptions are logged but don't crash the server
- Unhandled rejections are logged but don't crash the server

However, PM2 is still recommended for:
- Auto-restart on crashes
- Auto-start on system reboot
- Better log management
- Resource monitoring

