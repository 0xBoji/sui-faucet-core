#!/bin/bash

echo "🤖 Starting Sui Faucet Discord Bot"
echo "=================================="

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ .env file not found!"
    echo "📝 Please create .env file with:"
    echo "   DISCORD_TOKEN=your_bot_token"
    echo "   DISCORD_CLIENT_ID=your_client_id"
    exit 1
fi

# Check if backend is running
echo "🔍 Checking backend health..."
if curl -s http://localhost:3001/api/v1/health > /dev/null; then
    echo "✅ Backend is running"
else
    echo "❌ Backend not running!"
    echo "💡 Please start backend first:"
    echo "   cd packages/backend && npm run dev"
    exit 1
fi

# Build the bot
echo "🔨 Building Discord bot..."
npm run build

# Deploy commands
echo "📤 Deploying slash commands..."
npm run deploy-commands

# Start the bot
echo "🚀 Starting Discord bot..."
npm start
