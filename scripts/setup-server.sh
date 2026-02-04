#!/bin/bash
# =============================================================================
# First-time Server Setup Script
# Prepares the remote server for Docker deployment
# Run this ONCE before first deployment
# =============================================================================

set -e

SSH_HOST="uat"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}"
echo "╔══════════════════════════════════════════════════════════╗"
echo "║     🔧 Server Setup for Team Resource Manager            ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

echo -e "${YELLOW}This script will:${NC}"
echo "  1. Stop the existing PM2 team-tracker process"
echo "  2. Install nginx configuration"
echo "  3. Prepare Docker directories"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi

# Copy nginx config
echo -e "${YELLOW}Copying nginx configuration...${NC}"
scp nginx/team-resource-manager.conf ${SSH_HOST}:/tmp/

# Run setup on remote server
echo -e "${YELLOW}Running setup on remote server...${NC}"

ssh ${SSH_HOST} << 'ENDSSH'
set -e

echo "=== Stopping PM2 team-tracker ==="
pm2 stop team-tracker 2>/dev/null || echo "team-tracker not running"
pm2 delete team-tracker 2>/dev/null || echo "team-tracker not in PM2"
pm2 save

echo "=== Setting up nginx ==="
sudo mv /tmp/team-resource-manager.conf /etc/nginx/sites-available/
sudo ln -sf /etc/nginx/sites-available/team-resource-manager.conf /etc/nginx/sites-enabled/

# Remove default site if it conflicts
sudo rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true

# Test nginx config
echo "Testing nginx configuration..."
sudo nginx -t

# Reload nginx
echo "Reloading nginx..."
sudo systemctl reload nginx

echo "=== Creating app directory ==="
sudo mkdir -p /opt/team-resource-manager
sudo chown -R $(whoami):$(whoami) /opt/team-resource-manager

echo ""
echo "✅ Server setup complete!"
echo ""
echo "Next steps:"
echo "  1. Run: npm run deploy"
echo "  2. Access: https://uat.yaci.cf-app.org"
ENDSSH

echo -e "${GREEN}"
echo "╔══════════════════════════════════════════════════════════╗"
echo "║     ✅ Server Setup Complete!                            ║"
echo "║                                                          ║"
echo "║     Now run: npm run deploy                              ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo -e "${NC}"
