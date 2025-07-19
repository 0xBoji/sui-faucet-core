module.exports = {
  apps: [
    {
      name: 'sui-faucet-discord-bot',
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork', // Discord bot should run in fork mode, not cluster
      
      // Environment configuration
      env: {
        NODE_ENV: 'development',
      },
      
      env_production: {
        NODE_ENV: 'production',
      },
      
      // Resource limits
      max_memory_restart: '256M',
      min_uptime: '10s',
      max_restarts: 10,
      
      // Logging
      log_file: 'logs/bot.log',
      out_file: 'logs/bot-out.log',
      error_file: 'logs/bot-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      
      // Auto restart configuration
      watch: false,
      ignore_watch: ['node_modules', 'logs', '*.log'],
      
      // Advanced options
      kill_timeout: 5000,
      listen_timeout: 3000,
      
      // Environment file
      env_file: '.env',
      
      // Cron restart (optional - restart daily at 4 AM)
      cron_restart: '0 4 * * *',
      
      // Source map support
      source_map_support: true,
      
      // Graceful shutdown
      kill_retry_time: 100,
      
      // Monitoring
      pmx: true,
      
      // Auto restart on file change (development only)
      watch_options: {
        followSymlinks: false,
        usePolling: false
      }
    }
  ]
};
