# 🤖 Sui Faucet Discord Bot

A Discord bot that allows users to request SUI testnet tokens directly from Discord using slash commands.

## ✨ Features

- 🚰 **Request SUI tokens** via `/faucet` command
- 📊 **Check faucet status** with `/status` command
- ❓ **Get help** with `/help` command
- 🛡️ **Rate limiting** to prevent abuse
- 👑 **Admin commands** for bot management
- 🔄 **Auto health monitoring** with alerts
- 📝 **Comprehensive logging**

## 🚀 Commands

### User Commands
- `/faucet <address>` - Request SUI testnet tokens
- `/status` - Check faucet status and your limits
- `/help` - Show help information

### Admin Commands (Requires Administrator permission)
- `/admin stats` - View detailed statistics
- `/admin clear-limits <user>` - Clear rate limits for a user
- `/admin clear-all-limits` - Clear all rate limits
- `/admin health` - Check detailed health status

## 📋 Prerequisites

1. **Discord Bot Setup:**
   - Create a Discord application at [Discord Developer Portal](https://discord.com/developers/applications)
   - Create a bot and get the token
   - Get the Client ID
   - Invite bot to your server with appropriate permissions

2. **Faucet API:**
   - Running Sui Faucet backend API
   - API key for authentication

## ⚙️ Setup

### 1. Environment Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Required environment variables:
```env
# Discord Bot Configuration
DISCORD_TOKEN=your_discord_bot_token_here
DISCORD_CLIENT_ID=your_discord_client_id_here
DISCORD_GUILD_ID=your_discord_guild_id_here  # Optional: for faster command deployment

# Faucet API Configuration
FAUCET_API_URL=http://localhost:3001/api/v1
FAUCET_API_KEY=your_faucet_api_key

# Optional: Logging channel for alerts
LOG_CHANNEL_ID=your_log_channel_id_here
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Build the Bot

```bash
npm run build
```

### 4. Deploy Commands

Deploy slash commands to Discord:

```bash
npm run deploy-commands
```

### 5. Start the Bot

```bash
# Development
npm run dev

# Production
npm start
```

## 🔧 Configuration Options

### Rate Limiting
```env
RATE_LIMIT_ENABLED=true
RATE_LIMIT_WINDOW_MINUTES=60
RATE_LIMIT_MAX_REQUESTS=5
```

### Bot Behavior
```env
COOLDOWN_MINUTES=60
MAX_REQUESTS_PER_USER=1
ADMIN_ROLE_NAME=Faucet Admin
```

### Features
```env
ENABLE_STATS_COMMAND=true
ENABLE_HELP_COMMAND=true
ENABLE_ADMIN_COMMANDS=true
```

## 🛡️ Permissions

The bot requires the following Discord permissions:
- `Send Messages`
- `Use Slash Commands`
- `Embed Links`
- `Read Message History`

## 📊 Monitoring

The bot includes:
- **Health checks** every 10 minutes
- **Activity status** updates every 5 minutes
- **Comprehensive logging** with Winston
- **Error handling** with graceful degradation

## 🔒 Security Features

- **Rate limiting** per user and globally
- **Input validation** for wallet addresses
- **Error sanitization** in responses
- **Admin-only commands** with permission checks

## 🐛 Troubleshooting

### Common Issues

1. **Commands not appearing:**
   - Run `npm run deploy-commands`
   - Check bot permissions in Discord server

2. **Bot offline:**
   - Verify `DISCORD_TOKEN` is correct
   - Check bot permissions and intents

3. **Faucet requests failing:**
   - Verify `FAUCET_API_URL` and `FAUCET_API_KEY`
   - Check if faucet backend is running

### Logs

Check logs in the `logs/` directory:
- `error.log` - Error messages only
- `combined.log` - All log messages

## 📝 Development

### Project Structure
```
src/
├── commands/          # Slash command implementations
├── config/           # Configuration management
├── services/         # External service integrations
├── utils/           # Utility functions
└── index.ts         # Main bot entry point
```

### Adding New Commands

1. Create command file in `src/commands/`
2. Import and register in `src/index.ts`
3. Run `npm run deploy-commands`

## 🚀 Deployment

### Docker (Recommended)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist/ ./dist/
CMD ["npm", "start"]
```

### PM2

```bash
npm install -g pm2
pm2 start dist/index.js --name sui-faucet-bot
```

## 📄 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📞 Support

For support and questions:
- Create an issue on GitHub
- Join our Discord server
- Check the documentation
