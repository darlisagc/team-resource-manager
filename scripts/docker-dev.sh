#!/bin/bash
# =============================================================================
# Docker Development Script
# Run the application in development mode with Docker
# =============================================================================

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}Starting Team Resource Manager in development mode...${NC}"

# Build and start with docker-compose dev configuration
docker-compose -f docker-compose.dev.yml up --build

echo -e "${GREEN}Development server stopped.${NC}"
