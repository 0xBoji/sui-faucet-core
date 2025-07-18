# Multi-stage build for Sui Faucet Backend
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/backend/package*.json ./packages/backend/

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/backend/package*.json ./packages/backend/

# Install all dependencies (including devDependencies)
RUN npm ci

# Copy source code
COPY packages/backend ./packages/backend
COPY tsconfig.json ./

# Build the application
WORKDIR /app/packages/backend
RUN npm run build

# Production image, copy all the files and run the app
FROM base AS runner
WORKDIR /app

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 suifaucet

# Copy the built application
COPY --from=builder --chown=suifaucet:nodejs /app/packages/backend/dist ./dist
COPY --from=deps --chown=suifaucet:nodejs /app/node_modules ./node_modules
COPY --from=deps --chown=suifaucet:nodejs /app/packages/backend/node_modules ./packages/backend/node_modules

# Copy package.json for runtime
COPY --chown=suifaucet:nodejs packages/backend/package*.json ./

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3001

# Expose port
EXPOSE 3001

# Switch to non-root user
USER suifaucet

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/v1/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["node", "dist/index.js"]
