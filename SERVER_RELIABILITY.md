# Server Reliability & Crash Protection

This document explains all the measures in place to ensure the server never stops unexpectedly.

## 🛡️ Built-in Crash Protection

### 1. Global Error Handlers

The server now has comprehensive error handlers that prevent crashes:

#### Uncaught Exception Handler
- **Catches**: Synchronous errors that would normally crash Node.js
- **Action**: Logs the error but **does NOT exit** the process
- **Result**: Server continues running even if unexpected errors occur

```typescript
process.on('uncaughtException', (error: Error) => {
  console.error('❌ UNCAUGHT EXCEPTION - Server will continue running:', error);
  // Server continues - doesn't exit
});
```

#### Unhandled Rejection Handler
- **Catches**: Unhandled promise rejections (async errors)
- **Action**: Logs the error but **does NOT exit** the process
- **Result**: Server continues running even if async operations fail

```typescript
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ UNHANDLED REJECTION - Server will continue running:', reason);
  // Server continues - doesn't exit
});
```

### 2. Express Error Middleware

- **Catches**: Errors thrown in route handlers
- **Action**: Sends error response to client, logs error
- **Result**: Request fails gracefully, server continues running

### 3. Automation Error Handling

The automation service has multiple layers of error protection:

- **Try-catch blocks** around all async operations
- **Error catching** on `createVideo()` and `approveAndUpload()` promises
- **Final safety net** catch block for any unexpected errors
- **Always schedules next run** even if current run fails

**Result**: If one automated video creation fails, automation continues for the next scheduled run.

### 4. Graceful Shutdown

When the server receives termination signals (SIGTERM, SIGINT):

- Stops accepting new connections
- Waits for current requests to complete
- Stops automation gracefully
- Exits cleanly

**This prevents data loss and ensures clean shutdowns.**

## 🔄 PM2 Process Manager (Recommended)

PM2 provides an additional layer of protection:

### Auto-Restart Features

1. **Crash Detection**: If the process exits unexpectedly, PM2 restarts it
2. **Memory Monitoring**: Restarts if memory exceeds 1GB
3. **Auto-Start on Reboot**: Server starts automatically when system reboots
4. **Restart Limits**: Prevents infinite restart loops

### PM2 Configuration

```javascript
{
  autorestart: true,              // Auto-restart on crashes
  max_memory_restart: '1G',       // Restart if memory > 1GB
  max_restarts: 10,               // Max 10 restarts per minute
  restart_delay: 4000,            // Wait 4s before restarting
  min_uptime: '10s'               // Consider stable after 10s
}
```

## 📊 Health Check Endpoint

The server includes an enhanced health check endpoint:

```
GET /api/health
```

**Returns:**
- Server status
- Uptime
- Automation status
- Memory usage
- Timestamp

**Use this for:**
- Monitoring services
- Load balancers
- Health checks
- Debugging

## 🚀 How to Run with Maximum Reliability

### Option 1: With PM2 (Recommended for Production)

```bash
# 1. Build the project
npm run build

# 2. Start with PM2
npm run start:pm2

# 3. Set up auto-start on reboot
pm2 save
pm2 startup
```

**Benefits:**
- ✅ Auto-restart on crashes
- ✅ Auto-start on system reboot
- ✅ Memory monitoring
- ✅ Log management
- ✅ Process monitoring

### Option 2: Without PM2 (Still Protected)

```bash
# 1. Build the project
npm run build

# 2. Start normally
npm start
```

**Benefits:**
- ✅ Built-in crash protection (won't exit on errors)
- ✅ Global error handlers
- ✅ Graceful shutdown
- ⚠️ Manual restart required if process exits
- ⚠️ Won't auto-start on reboot

## 📝 Logging

All errors are logged to:
- **Console**: Real-time error output
- **PM2 Logs** (if using PM2): `logs/pm2-error.log`, `logs/pm2-out.log`

## 🔍 Monitoring

### Check Server Status

```bash
# With PM2
npm run status:pm2

# Health check endpoint
curl http://localhost:3001/api/health
```

### View Logs

```bash
# With PM2
npm run logs:pm2

# Real-time monitoring
npm run monit:pm2
```

## 🛠️ Troubleshooting

### Server Keeps Restarting

1. Check error logs: `pm2 logs youtube-crypto-bot --err`
2. Check memory usage: `pm2 monit`
3. Verify environment variables are set correctly
4. Check if port is available: `lsof -i :3001`

### Server Won't Start

1. Check if port is in use
2. Verify `.env` file exists and has required variables
3. Check build output: `npm run build`
4. View detailed logs: `pm2 logs youtube-crypto-bot`

### Automation Not Running

1. Check automation status: `GET /api/automation/status`
2. Check server logs for automation errors
3. Verify YouTube credentials are set up
4. Check if automation was started via UI or API

## ✅ Summary

**The server is now protected against:**
- ✅ Uncaught exceptions (won't crash)
- ✅ Unhandled promise rejections (won't crash)
- ✅ Route handler errors (handled gracefully)
- ✅ Automation errors (continues to next run)
- ✅ Memory issues (PM2 restarts if needed)
- ✅ System reboots (PM2 auto-starts)

**For maximum reliability, use PM2 in production!**

