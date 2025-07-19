#!/bin/bash

# 🤖 Start Sui Faucet Discord Bot in Production
echo "🚀 Starting Sui Faucet Discord Bot (Production)"
echo "=============================================="

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${RED}❌ .env file not found!${NC}"
    echo "📝 Please create .env file with Discord bot credentials"
    exit 1
fi

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}⚠️  PM2 not found. Installing PM2...${NC}"
    npm install -g pm2
fi

# Create logs directory
mkdir -p logs

# Build the bot
echo "🔨 Building Discord bot..."
npm run build

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Build failed!${NC}"
    exit 1
fi

# Deploy commands (only if needed)
echo "📤 Deploying slash commands..."
npm run deploy-commands

if [ $? -ne 0 ]; then
    echo -e "${YELLOW}⚠️  Command deployment failed, but continuing...${NC}"
fi

# Check if bot is already running
if pm2 list | grep -q "sui-faucet-discord-bot"; then
    echo "🔄 Bot is already running. Restarting..."
    npm run restart:pm2
else
    echo "🚀 Starting bot with PM2..."
    npm run start:pm2
fi

# Show status
echo ""
echo "📊 Bot Status:"
pm2 status sui-faucet-discord-bot

echo ""
echo -e "${GREEN}✅ Discord bot started successfully!${NC}"
echo ""
echo "📋 Useful commands:"
echo "  npm run logs:pm2     - View bot logs"
echo "  npm run restart:pm2  - Restart bot"
echo "  npm run stop:pm2     - Stop bot"
echo "  pm2 monit           - Monitor all PM2 processes"
echo ""
echo "🔗 Bot should now be online in Discord!"
