# Asset Manager VPS Deployment SOP

This procedure deploys Asset Manager alongside existing applications on Ubuntu. It must not stop, delete, overwrite, replace, or reconfigure any existing application, process, container, port, database, systemd unit, or Nginx site.

## Deployment allocation

- Repository: `https://github.com/LawrenceMukombo/assetmanager.git`
- Directory: `/var/www/assetmanager`
- Internal listener: `127.0.0.1:5003`
- Domain: `assetmanager.lamtoninvestments.com`
- PostgreSQL database and role: `assetmanager`
- systemd unit: `assetmanager.service`
- Nginx site: `assetmanager`

## 1. Preflight safety checks

Run as `root`. Every check must pass. An `ABORT` message means stop and select a different unused resource; do not remove the existing resource.

```bash
set -euo pipefail

test ! -e /var/www/assetmanager || { echo "ABORT: /var/www/assetmanager already exists"; exit 1; }
test ! -e /etc/systemd/system/assetmanager.service || { echo "ABORT: assetmanager.service already exists"; exit 1; }
test ! -e /etc/nginx/sites-available/assetmanager || { echo "ABORT: Nginx site assetmanager already exists"; exit 1; }

if ss -ltnH | awk '{print $4}' | grep -Eq '(^|:)5003$'; then
  echo "ABORT: port 5003 is already occupied"
  exit 1
fi

if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='assetmanager'" | grep -q 1; then
  echo "ABORT: PostgreSQL role assetmanager already exists"
  exit 1
fi

if sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='assetmanager'" | grep -q 1; then
  echo "ABORT: PostgreSQL database assetmanager already exists"
  exit 1
fi

command -v git
command -v node
command -v pnpm
command -v psql
command -v nginx
node --version
pnpm --version
nginx -t
```

## 2. Clone the application

```bash
mkdir -p /var/www/assetmanager
git clone https://github.com/LawrenceMukombo/assetmanager.git /var/www/assetmanager
cd /var/www/assetmanager
git branch --show-current
git log -1 --oneline
```

## 3. Create isolated production secrets and database

```bash
DB_PASSWORD=$(openssl rand -hex 24)
JWT_SECRET=$(openssl rand -hex 64)

sudo -u postgres psql -c "CREATE ROLE assetmanager LOGIN PASSWORD '$DB_PASSWORD'"
sudo -u postgres createdb -O assetmanager assetmanager

install -m 600 /dev/null /etc/assetmanager.env
cat > /etc/assetmanager.env <<EOF
NODE_ENV=production
PORT=5003
DATABASE_URL=postgresql://assetmanager:${DB_PASSWORD}@127.0.0.1:5432/assetmanager
JWT_SECRET=${JWT_SECRET}
APP_BASE_URL=https://assetmanager.lamtoninvestments.com
EOF
chmod 600 /etc/assetmanager.env
```

## 4. Install, migrate, and build

```bash
cd /var/www/assetmanager
pnpm install --frozen-lockfile

set -a
source /etc/assetmanager.env
set +a

pnpm --filter @workspace/db run push
pnpm --filter @workspace/npams-web run build
pnpm --filter @workspace/api-server run build

test -f artifacts/api-server/dist/index.mjs
test -f artifacts/api-server/dist/frontend/index.html
```

## 5. Register the isolated systemd service

```bash
cat > /etc/systemd/system/assetmanager.service <<'EOF'
[Unit]
Description=Asset Manager
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/var/www/assetmanager
EnvironmentFile=/etc/assetmanager.env
ExecStart=/usr/bin/node --enable-source-maps artifacts/api-server/dist/index.mjs
Restart=always
RestartSec=5
NoNewPrivileges=true
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

chown -R www-data:www-data /var/www/assetmanager
systemctl daemon-reload
systemctl enable --now assetmanager
systemctl status assetmanager --no-pager
curl --fail --head http://127.0.0.1:5003/login
```

## 6. Add an isolated Nginx site

```bash
cat > /etc/nginx/sites-available/assetmanager <<'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name assetmanager.lamtoninvestments.com;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:5003;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }
}
EOF

ln -s /etc/nginx/sites-available/assetmanager /etc/nginx/sites-enabled/assetmanager
nginx -t
systemctl reload nginx
curl --fail --head http://assetmanager.lamtoninvestments.com
```

## 7. Enable HTTPS for only this subdomain

```bash
certbot --nginx -d assetmanager.lamtoninvestments.com --redirect
curl --fail --head https://assetmanager.lamtoninvestments.com
```

## 8. Safe application updates

These commands affect only Asset Manager. They do not restart Nginx, PostgreSQL, PM2, Docker, or any other application.

```bash
set -euo pipefail
cd /var/www/assetmanager

PREVIOUS_COMMIT=$(git rev-parse HEAD)
git fetch origin main
git merge --ff-only origin/main

pnpm install --frozen-lockfile

set -a
source /etc/assetmanager.env
set +a

pnpm --filter @workspace/db run push
pnpm --filter @workspace/npams-web run build
pnpm --filter @workspace/api-server run build

chown -R www-data:www-data /var/www/assetmanager
systemctl restart assetmanager
systemctl status assetmanager --no-pager
curl --fail --head http://127.0.0.1:5003/login

echo "Previous commit: $PREVIOUS_COMMIT"
echo "Current commit:  $(git rev-parse HEAD)"
```

## 9. Diagnostics

```bash
systemctl status assetmanager --no-pager
journalctl -u assetmanager -n 100 --no-pager
curl --fail --head http://127.0.0.1:5003/login
curl --fail --head https://assetmanager.lamtoninvestments.com
```

Do not run global cleanup commands such as `pm2 delete all`, `docker system prune`, broad `/var/www` deletion, blanket Nginx-site removal, or termination of unknown processes as part of this deployment.
