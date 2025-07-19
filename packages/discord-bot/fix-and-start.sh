#!/bin/bash

echo "🔧 Fixing Discord Bot Dependencies and Starting..."
echo "================================================"

# Install missing dependencies
echo "📦 Installing dependencies..."
npm install discord.js axios node-cron
npm install --save-dev @types/node @types/node-cron

# Create logs directory
mkdir -p logs

# Build the bot
echo "🔨 Building Discord bot..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed!"
    exit 1
fi

# Deploy commands
echo "📤 Deploying slash commands..."
npm run deploy-commands

if [ $? -ne 0 ]; then
    echo "⚠️  Command deployment failed, but continuing..."
fi

# Start with PM2
echo "🚀 Starting bot with PM2..."
npm run start:pm2

echo "✅ Done! Check status with: pm2 status"
