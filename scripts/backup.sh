#!/bin/bash
# =============================================================================
# Backup Script for Team Resource Manager
# Creates backup of SQLite database from Docker volume
# =============================================================================

set -e

# Configuration
APP_NAME="team-resource-manager"
BACKUP_DIR="${HOME}/backups/${APP_NAME}"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/database_${DATE}.sqlite"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}Creating backup of ${APP_NAME} database...${NC}"

# Create backup directory if it doesn't exist
mkdir -p ${BACKUP_DIR}

# Copy database from Docker volume
docker cp ${APP_NAME}:/app/data/database.sqlite ${BACKUP_FILE}

# Compress backup
gzip ${BACKUP_FILE}

echo -e "${GREEN}✓ Backup created: ${BACKUP_FILE}.gz${NC}"

# Clean up old backups (keep last 7 days)
echo -e "${YELLOW}Cleaning up old backups...${NC}"
find ${BACKUP_DIR} -name "*.gz" -mtime +7 -delete

echo -e "${GREEN}✓ Backup complete!${NC}"

# List recent backups
echo ""
echo "Recent backups:"
ls -lh ${BACKUP_DIR}/*.gz 2>/dev/null | tail -5
