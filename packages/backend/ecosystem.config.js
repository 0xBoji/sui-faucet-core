module.exports = {
  apps: [
    {
      name: 'sui-faucet',
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'cluster',
      
      // Environment configuration
      env: {
        NODE_ENV: 'development',
        PORT: 3001
      },
      
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      
      // Resource limits
      max_memory_restart: '512M',
      min_uptime: '10s',
      max_restarts: 10,
      
      // Logging
      log_file: '/opt/sui-faucet/logs/app.log',
      out_file: '/opt/sui-faucet/logs/out.log',
      error_file: '/opt/sui-faucet/logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      
      // Auto restart configuration
      watch: false,
      ignore_watch: ['node_modules', 'logs', '*.log'],
      
      // Advanced options
      kill_timeout: 5000,
      listen_timeout: 3000,
      
      // Health monitoring
      health_check_url: 'http://localhost:3001/api/v1/health',
      health_check_grace_period: 3000,
      
      // Environment file
      env_file: '.env.prod',
      
      // Cron restart (optional - restart daily at 3 AM)
      cron_restart: '0 3 * * *',
      
      // Source map support
      source_map_support: true,
      
      // Instance variables
      instance_var: 'INSTANCE_ID',
      
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
  ],
  
  // Deployment configuration
  deploy: {
    production: {
      user: 'ubuntu',
      host: ['production-server'],
      ref: 'origin/main',
      repo: 'https://github.com/your-username/sui-faucet-core-node.git',
      path: '/opt/sui-faucet',
      'post-deploy': 'npm ci --production && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': 'apt update && apt install git -y'
    },
    
    staging: {
      user: 'ubuntu',
      host: ['staging-server'],
      ref: 'origin/develop',
      repo: 'https://github.com/your-username/sui-faucet-core-node.git',
      path: '/opt/sui-faucet-staging',
      'post-deploy': 'npm ci --production && npm run build && pm2 reload ecosystem.config.js --env staging',
      'pre-setup': 'apt update && apt install git -y'
    }
  }
};
