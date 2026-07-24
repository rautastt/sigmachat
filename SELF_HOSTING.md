# 🚀 Self-Hosting Sigma Chat

This guide explains how to self-host Sigma Chat on your own infrastructure. You have three options:

1. **Local/Manual Setup** — For development or small personal deployments
2. **Docker Compose** — Recommended for easy local or VPS deployment
3. **Auto-Deploy Scripts** — One-command setup with systemd or PM2

---

## Option 1: Local Setup (Development)

### Prerequisites
- Node.js 16+ (LTS recommended)
- PostgreSQL 12+
- Git

### Installation Steps

```bash
# Clone the repository
git clone https://github.com/rautastt/sigmachat.git
cd sigmachat

# Install dependencies
npm install

# Copy and configure environment variables
cp env.example .env
# Edit .env with your settings (see below)

# Initialize the database
psql $DATABASE_URL -f database/schema.sql

# Start the server
npm run dev       # Development (with auto-reload)
npm start         # Production
```

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@localhost:5432/sigma_chat` |
| `SESSION_SECRET` | Random secret for sessions | `your-random-secret-key-here` |
| `APP_URL` | Public URL for email links | `https://chat.yourdomain.com` |
| `RESEND_API_KEY` | Email service API key | (Get from resend.com) |
| `NODE_ENV` | Environment mode | `production` or `development` |
| `UPLOAD_DIR` | Upload directory | `./uploads` |

---

## Option 2: Docker Compose (Recommended)

### Prerequisites
- Docker & Docker Compose installed

### Setup

1. **Clone the repository:**
```bash
git clone https://github.com/rautastt/sigmachat.git
cd sigmachat
```

2. **Create `.env` file:**
```bash
cp env.example .env
```

3. **Edit `.env` with your settings** (at minimum, change `SESSION_SECRET` and `RESEND_API_KEY`)

4. **Start the services:**
```bash
docker-compose up -d
```

The app will be available at `http://localhost:3000`

5. **View logs:**
```bash
docker-compose logs -f app
```

6. **Stop services:**
```bash
docker-compose down
```

### Dockerfile (Create `Dockerfile`)

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Create uploads directory
RUN mkdir -p /tmp/uploads

# Expose port
EXPOSE 3000

# Start application
CMD ["npm", "start"]
```

### Docker Compose File (Create `docker-compose.yml`)

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: sigma_chat
      POSTGRES_USER: ${DB_USER:-sigma}
      POSTGRES_PASSWORD: ${DB_PASSWORD:-changeme}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./database/schema.sql:/docker-entrypoint-initdb.d/init.sql
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U sigma"]
      interval: 10s
      timeout: 5s
      retries: 5

  app:
    build: .
    environment:
      NODE_ENV: production
      PORT: 3000
      DATABASE_URL: postgresql://${DB_USER:-sigma}:${DB_PASSWORD:-changeme}@postgres:5432/sigma_chat
      SESSION_SECRET: ${SESSION_SECRET:-change-me-to-random-secret}
      APP_URL: ${APP_URL:-http://localhost:3000}
      RESEND_API_KEY: ${RESEND_API_KEY}
      UPLOAD_DIR: /tmp/uploads
    ports:
      - "3000:3000"
    depends_on:
      postgres:
        condition: service_healthy
    volumes:
      - ./uploads:/tmp/uploads
    restart: unless-stopped

volumes:
  postgres_data:
```

### Environment File for Docker (Add to `.env`)

```env
# Docker Postgres
DB_USER=sigma
DB_PASSWORD=your_secure_password_here

# App Config
SESSION_SECRET=your_long_random_secret_here
APP_URL=http://localhost:3000
RESEND_API_KEY=your_resend_api_key_here
```

---

## Option 3: Auto-Deploy Scripts

### Using PM2 (Recommended for VPS)

1. **Install PM2 globally:**
```bash
npm install -g pm2
```

2. **Create `ecosystem.config.js`:**
```javascript
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
```

3. **Deploy script (`deploy.sh`):**
```bash
#!/bin/bash
set -e

echo "🚀 Deploying Sigma Chat..."

# Stop existing app
pm2 stop sigma-chat || true

# Pull latest code
git pull origin main

# Install dependencies
npm ci --only=production

# Run database migrations
psql $DATABASE_URL -f database/schema.sql || true

# Start with PM2
pm2 start ecosystem.config.js
pm2 save

echo "✅ Deployment complete!"
```

4. **Make it executable and run:**
```bash
chmod +x deploy.sh
./deploy.sh
```

5. **View logs:**
```bash
pm2 logs sigma-chat
```

---

### Using Systemd (VPS on Linux)

1. **Create systemd service (`/etc/systemd/system/sigma-chat.service`):**
```ini
[Unit]
Description=Sigma Chat Application
After=network.target postgresql.service

[Service]
Type=simple
User=sigma
WorkingDirectory=/home/sigma/sigmachat
Environment="PATH=/usr/local/bin:/usr/bin:/bin"
Environment="NODE_ENV=production"
EnvironmentFile=/home/sigma/sigmachat/.env
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
SyslogIdentifier=sigma-chat

[Install]
WantedBy=multi-user.target
```

2. **Enable and start:**
```bash
sudo systemctl enable sigma-chat
sudo systemctl start sigma-chat
```

3. **View logs:**
```bash
sudo journalctl -u sigma-chat -f
```

---

### One-Command Deploy Script

Save this as `setup.sh` and run with `./setup.sh` (requires Node.js and PostgreSQL installed):

```bash
#!/bin/bash
set -e

DOMAIN=${1:-"localhost:3000"}
DB_PASS=$(openssl rand -base64 32)
SESSION_SECRET=$(openssl rand -base64 32)

echo "🚀 Sigma Chat Auto-Deploy"
echo "Domain: $DOMAIN"

# Clone repository
if [ ! -d "sigmachat" ]; then
  git clone https://github.com/rautastt/sigmachat.git
fi

cd sigmachat

# Create database
echo "📦 Setting up PostgreSQL..."
createdb sigma_chat 2>/dev/null || true

# Create .env
cat > .env <<EOF
PORT=3000
DATABASE_URL=postgresql://postgres:$DB_PASS@localhost:5432/sigma_chat
SESSION_SECRET=$SESSION_SECRET
APP_URL=https://$DOMAIN
NODE_ENV=production
UPLOAD_DIR=./uploads
EOF

# Install dependencies
echo "📚 Installing dependencies..."
npm ci --only=production

# Initialize database
echo "🗄️  Initializing database..."
psql sigma_chat -f database/schema.sql

# Create systemd service
echo "⚙️  Setting up systemd service..."
sudo tee /etc/systemd/system/sigma-chat.service > /dev/null <<EOF
[Unit]
Description=Sigma Chat
After=network.target

[Service]
Type=simple
User=\$USER
WorkingDirectory=$(pwd)
EnvironmentFile=$(pwd)/.env
ExecStart=$(which node) server.js
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable sigma-chat
sudo systemctl start sigma-chat

echo "✅ Sigma Chat is running!"
echo "🌐 Visit: http://$DOMAIN"
echo "📝 Logs: sudo journalctl -u sigma-chat -f"
```

---

## Production Checklist

Before going live, ensure:

- [ ] Database backups are configured
- [ ] `SESSION_SECRET` is a strong random string
- [ ] `RESEND_API_KEY` is configured for email
- [ ] `APP_URL` is set to your public domain
- [ ] HTTPS/SSL is enabled (use Nginx reverse proxy or Let's Encrypt)
- [ ] Firewall allows only necessary ports (80, 443)
- [ ] Uploads directory has proper permissions
- [ ] Regular log rotation is enabled
- [ ] Monitoring/alerting is configured

---

## Reverse Proxy (Nginx)

For HTTPS and better performance, use Nginx as a reverse proxy:

```nginx
server {
    listen 443 ssl http2;
    server_name chat.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name chat.yourdomain.com;
    return 301 https://$server_name$request_uri;
}
```

---

## Troubleshooting

**Connection refused error:**
- Check PostgreSQL is running: `psql -U postgres -h localhost`
- Verify `DATABASE_URL` is correct

**Port 3000 already in use:**
```bash
lsof -i :3000  # Find process using port
kill -9 <PID>  # Kill it
```

**Uploads not persisting:**
- Ensure `UPLOAD_DIR` exists and is writable
- In Docker, verify volume is mounted correctly

**Email not sending:**
- Verify `RESEND_API_KEY` is valid
- Check `APP_URL` matches your domain

---

## Support

- **Issues:** https://github.com/rautastt/sigmachat/issues
- **Documentation:** Check README.md for tech stack details
