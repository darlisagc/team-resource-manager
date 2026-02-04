#!/bin/bash
# =============================================================================
# Deployment Script for Team Resource Manager
# Deploys to remote server via SSH through jump server
# Builds Docker image on the server to avoid cross-compilation issues
# =============================================================================

set -e  # Exit on error

# Configuration
APP_NAME="team-resource-manager"
REMOTE_DIR="/opt/${APP_NAME}"
SSH_HOST="uat"  # Uses SSH config alias

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}"
echo "╔══════════════════════════════════════════════════════════╗"
echo "║     🚀 Team Resource Manager - Docker Deployment         ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check if required files exist
if [ ! -f "Dockerfile" ]; then
    echo -e "${RED}Error: Dockerfile not found. Run this script from the project root.${NC}"
    exit 1
fi

# Parse arguments
SKIP_BUILD=false
FIRST_TIME=false
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --skip-build) SKIP_BUILD=true ;;
        --first-time) FIRST_TIME=true ;;
        --help)
            echo "Usage: ./scripts/deploy.sh [options]"
            echo ""
            echo "Options:"
            echo "  --skip-build    Skip Docker build, only restart container"
            echo "  --first-time    First deployment (stops PM2, sets up nginx)"
            echo "  --help          Show this help message"
            exit 0
            ;;
        *) echo "Unknown parameter: $1"; exit 1 ;;
    esac
    shift
done

# Step 1: Create deployment archive (source code, not Docker image)
echo -e "${YELLOW}Step 1: Creating deployment archive...${NC}"

# Create a clean archive excluding node_modules, .git, etc.
tar --exclude='node_modules' \
    --exclude='.git' \
    --exclude='database.sqlite' \
    --exclude='.env' \
    --exclude='dist' \
    -czf /tmp/${APP_NAME}-source.tar.gz .

ARCHIVE_SIZE=$(du -h /tmp/${APP_NAME}-source.tar.gz | cut -f1)
echo -e "${GREEN}✓ Source archive created (${ARCHIVE_SIZE})${NC}"

# Step 2: Copy files to remote server
echo -e "${YELLOW}Step 2: Copying files to remote server...${NC}"

# Copy source archive
scp /tmp/${APP_NAME}-source.tar.gz ${SSH_HOST}:/tmp/
scp nginx/team-resource-manager.conf ${SSH_HOST}:/tmp/ 2>/dev/null || true

# Copy .env if exists
if [ -f ".env" ]; then
    scp .env ${SSH_HOST}:/tmp/${APP_NAME}.env
else
    echo -e "${YELLOW}Warning: No .env file found. Using defaults.${NC}"
fi

echo -e "${GREEN}✓ Files copied${NC}"

# Step 3: Build and deploy on remote server
echo -e "${YELLOW}Step 3: Building and deploying on remote server...${NC}"

ssh ${SSH_HOST} << 'ENDSSH'
set -e

APP_NAME="team-resource-manager"
REMOTE_DIR="/opt/${APP_NAME}"
BUILD_DIR="/tmp/${APP_NAME}-build"

echo "Creating directories..."
sudo mkdir -p ${REMOTE_DIR}
sudo chown -R $(whoami):$(whoami) ${REMOTE_DIR}
rm -rf ${BUILD_DIR}
mkdir -p ${BUILD_DIR}

# Extract source code
echo "Extracting source code..."
tar -xzf /tmp/${APP_NAME}-source.tar.gz -C ${BUILD_DIR}
rm /tmp/${APP_NAME}-source.tar.gz

# Copy docker-compose.yml to app directory
cp ${BUILD_DIR}/docker-compose.yml ${REMOTE_DIR}/docker-compose.yml

# Handle .env file
if [ -f "/tmp/${APP_NAME}.env" ]; then
    mv /tmp/${APP_NAME}.env ${REMOTE_DIR}/.env
fi

# Create .env if it doesn't exist
if [ ! -f "${REMOTE_DIR}/.env" ]; then
    echo "Creating default .env file..."
    cat > ${REMOTE_DIR}/.env << 'EOF'
NODE_ENV=production
PORT=3011
JWT_SECRET=change-this-secret-in-production
DATABASE_PATH=/app/data/database.sqlite
EOF
fi

# Build Docker image on the server (native architecture)
echo "Building Docker image (this may take a few minutes)..."
cd ${BUILD_DIR}
docker build -t ${APP_NAME}:latest .
echo "✓ Docker image built successfully"

# Clean up build directory
rm -rf ${BUILD_DIR}

cd ${REMOTE_DIR}

# Stop and remove existing container if running
echo "Stopping existing container..."
docker compose down 2>/dev/null || true

# Start new container
echo "Starting Docker container..."
docker compose up -d

# Wait for health check
echo "Waiting for application to start..."
sleep 8

# Verify deployment
if docker compose ps | grep -q "Up"; then
    echo ""
    echo "✅ Deployment successful!"
    docker compose ps
    echo ""
    echo "Health check:"
    curl -s http://localhost:3011/api/health || echo "Health check pending..."
else
    echo "❌ Deployment failed!"
    docker compose logs --tail=50
    exit 1
fi
ENDSSH

echo -e "${GREEN}"
echo "╔══════════════════════════════════════════════════════════╗"
echo "║     ✅ Deployment Complete!                              ║"
echo "║                                                          ║"
echo "║     App running at: http://uat.yaci.cf-app.org:3011     ║"
echo "║     Health: http://uat.yaci.cf-app.org:3011/api/health  ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Cleanup
rm -f /tmp/${APP_NAME}-source.tar.gz

echo -e "${BLUE}Tip: Run with --first-time flag to stop PM2 and configure nginx${NC}"
