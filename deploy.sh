#!/bin/bash

# Sigma Chat Deployment Script
# Usage: ./deploy.sh [domain] [method]
# Methods: docker (default), pm2, systemd

set -e

DOMAIN=${1:-"localhost:3000"}
METHOD=${2:-"docker"}
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "╔════════════════════════════════════════╗"
echo "║     Sigma Chat Auto-Deployment        ║"
echo "╚════════════════════════════════════════╝"
echo ""
echo "🌐 Domain: $DOMAIN"
echo "🚀 Method: $METHOD"
echo ""

# Function to generate random secrets
generate_secret() {
  if command -v openssl &> /dev/null; then
    openssl rand -base64 32
  else
    head -c 32 /dev/urandom | base64
  fi
}

# Function to setup Docker deployment
deploy_docker() {
  echo "📦 Setting up Docker deployment..."
  
  if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker and Docker Compose."
    echo "   Visit: https://docs.docker.com/get-docker/"
    exit 1
  fi

  if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cat > .env <<EOF
DB_USER=sigma
DB_PASSWORD=$(generate_secret)
SESSION_SECRET=$(generate_secret)
APP_URL=https://$DOMAIN
NODE_ENV=production
RESEND_API_KEY=your_resend_api_key_here
EOF
    echo "✅ .env created. Please edit it to add your RESEND_API_KEY"
  fi

  echo "🐳 Starting Docker Compose services..."
  docker-compose up -d

  echo ""
  echo "✅ Docker deployment complete!"
  echo "📊 Check status: docker-compose ps"
  echo "📋 View logs: docker-compose logs -f"
  echo "🌐 Access app: http://localhost:3000"
}

# Function to setup PM2 deployment
deploy_pm2() {
  echo "⚙️  Setting up PM2 deployment..."

  if ! command -v npm &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 16+."
    exit 1
  fi

  if ! command -v pm2 &> /dev/null; then
    echo "📥 Installing PM2..."
    npm install -g pm2
  fi

  if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cat > .env <<EOF
PORT=3000
DATABASE_URL=postgresql://user:password@localhost:5432/sigma_chat
SESSION_SECRET=$(generate_secret)
APP_URL=https://$DOMAIN
NODE_ENV=production
RESEND_API_KEY=your_resend_api_key_here
UPLOAD_DIR=./uploads
EOF
    echo "✅ .env created. Please edit it with your database credentials and API keys"
  fi

  if [ ! -f ecosystem.config.js ]; then
    echo "⚙️  Creating PM2 ecosystem config..."
    cat > ecosystem.config.js <<'EOFPM2'
module.exports = {
  apps: [{
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
    max_memory_restart: '500M'
  }]
};
EOFPM2
  fi

  echo "📚 Installing dependencies..."
  npm ci --only=production

  echo "🚀 Starting with PM2..."
  pm2 start ecosystem.config.js
  pm2 save

  echo ""
  echo "✅ PM2 deployment complete!"
  echo "📊 Check status: pm2 status"
  echo "📋 View logs: pm2 logs sigma-chat"
  echo "🌐 Access app: http://localhost:3000"
}

# Function to setup Systemd deployment
deploy_systemd() {
  echo "🐧 Setting up Systemd deployment..."

  if ! command -v npm &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 16+."
    exit 1
  fi

  if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cat > .env <<EOF
PORT=3000
DATABASE_URL=postgresql://user:password@localhost:5432/sigma_chat
SESSION_SECRET=$(generate_secret)
APP_URL=https://$DOMAIN
NODE_ENV=production
RESEND_API_KEY=your_resend_api_key_here
UPLOAD_DIR=./uploads
EOF
    echo "✅ .env created. Please edit it with your database credentials and API keys"
  fi

  echo "📚 Installing dependencies..."
  npm ci --only=production

  echo "📝 Creating systemd service..."
  SERVICE_FILE="/etc/systemd/system/sigma-chat.service"
  
  if [ -f "$SERVICE_FILE" ]; then
    sudo systemctl stop sigma-chat || true
  fi

  sudo tee "$SERVICE_FILE" > /dev/null <<EOFSVC
[Unit]
Description=Sigma Chat Application
After=network.target postgresql.service

[Service]
Type=simple
User=$USER
WorkingDirectory=$SCRIPT_DIR
EnvironmentFile=$SCRIPT_DIR/.env
ExecStart=$(which node) server.js
Restart=always
RestartSec=5
SyslogIdentifier=sigma-chat

[Install]
WantedBy=multi-user.target
EOFSVC

  sudo systemctl daemon-reload
  sudo systemctl enable sigma-chat
  sudo systemctl start sigma-chat

  echo ""
  echo "✅ Systemd deployment complete!"
  echo "📊 Check status: systemctl status sigma-chat"
  echo "📋 View logs: journalctl -u sigma-chat -f"
  echo "🌐 Access app: http://localhost:3000"
}

# Main deployment logic
case $METHOD in
  docker)
    deploy_docker
    ;;
  pm2)
    deploy_pm2
    ;;
  systemd)
    deploy_systemd
    ;;
  *)
    echo "❌ Unknown deployment method: $METHOD"
    echo ""
    echo "Usage: ./deploy.sh [domain] [method]"
    echo ""
    echo "Methods:"
    echo "  docker   - Docker Compose (recommended, all-in-one)"
    echo "  pm2      - PM2 cluster manager"
    echo "  systemd  - Systemd service (Linux only)"
    exit 1
    ;;
esac

echo ""
echo "📖 For more information, see SELF_HOSTING.md"
echo ""
