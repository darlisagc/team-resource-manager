# =============================================================================
# Multi-stage Dockerfile for Team Resource Manager
# Stage 1: Build frontend
# Stage 2: Production runtime
# Using node:20-slim (Debian) instead of Alpine for better native module compatibility
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Build the frontend
# -----------------------------------------------------------------------------
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build the frontend
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 2: Production runtime
# -----------------------------------------------------------------------------
FROM node:20-slim AS production

# Install build essentials for native modules
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN groupadd -g 1001 nodejs && \
    useradd -u 1001 -g nodejs -s /bin/bash -m nodejs

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy built frontend from builder stage
COPY --from=builder /app/dist ./dist

# Copy server code
COPY server ./server

# Copy any other necessary files
COPY vite.config.js ./
COPY tailwind.config.js ./
COPY postcss.config.js ./

# Create data directory for SQLite database with proper permissions
RUN mkdir -p /app/data && chown -R nodejs:nodejs /app/data

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3011
ENV DATABASE_PATH=/app/data/database.sqlite

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3011

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3011/api/health || exit 1

# Start the server
CMD ["node", "server/index.js"]
