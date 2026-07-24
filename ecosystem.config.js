module.exports = {
  apps: [
    {
      name: 'sigma-chat',
      script: './server.js',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_file: './logs/combined.log',
      time_format: 'YYYY-MM-DD HH:mm:ss Z',
      restart_delay: 4000,
      max_memory_restart: '500M',
      merge_logs: true,
      watch: false,
      ignore_watch: [
        'node_modules',
        'logs',
        'uploads',
        '.env'
      ]
    }
  ],

  deploy: {
    production: {
      user: 'deploy',
      host: 'your-server.com',
      ref: 'origin/main',
      repo: 'https://github.com/rautastt/sigmachat.git',
      path: '/opt/sigmachat',
      'post-deploy': 'npm ci && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-deploy-local': 'echo "Deploying to production"'
    }
  }
};
