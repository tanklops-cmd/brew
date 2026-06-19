# Hopsession Brewing LXC Deployment

## Requirements

- Node.js 22 or newer
- npm
- A writable `data/` directory beside the app

## Install

```bash
git clone <repository-url> hopsession-brewing
cd hopsession-brewing
npm ci
npm run build
PORT=4173 npm start
```

## Persistent Data

The SQLite database is created at:

```bash
data/brewers-companion.sqlite
```

Keep `data/` on persistent LXC storage and back it up. The app also writes startup and scheduled backups to `data/backups/`.

## systemd Service Example

```ini
[Unit]
Description=Hopsession Brewing App
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/hopsession-brewing
Environment=PORT=4173
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=5
User=hopsession
Group=hopsession

[Install]
WantedBy=multi-user.target
```

After creating the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now hopsession-brewing
```
