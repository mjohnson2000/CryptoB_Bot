/**
 * PM2 Ecosystem Configuration
 * PM2 is a process manager that keeps your server running and auto-restarts on crashes
 * 
 * Installation: npm install -g pm2
 * Start: pm2 start ecosystem.config.js
 * Stop: pm2 stop youtube-crypto-bot
 * Restart: pm2 restart youtube-crypto-bot
 * Status: pm2 status
 * Logs: pm2 logs youtube-crypto-bot
 * Monitor: pm2 monit
 */

export default {
  apps: [
    {
      name: 'youtube-crypto-bot',
      script: 'dist/server/index.js',
      instances: 1,
      exec_mode: 'fork',
      
      // Auto-restart configuration
      autorestart: true,
      watch: false, // Set to true in development to watch for file changes
      max_memory_restart: '1G', // Restart if memory exceeds 1GB
      
      // Error handling
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_file: './logs/pm2-combined.log',
      time: true, // Add timestamp to logs
      merge_logs: true,
      
      // Restart strategies
      min_uptime: '10s', // Consider app stable after 10 seconds
      max_restarts: 10, // Max restarts in 1 minute
      restart_delay: 4000, // Wait 4 seconds before restarting
      
      // Environment variables
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 3001
      },
      
      // Advanced options
      kill_timeout: 5000, // Wait 5 seconds for graceful shutdown
      listen_timeout: 10000, // Wait 10 seconds for app to start listening
      shutdown_with_message: true,
      
      // Ignore file changes (for watch mode)
      ignore_watch: [
        'node_modules',
        'logs',
        'output',
        '.git',
        'client'
      ]
    }
  ]
};

