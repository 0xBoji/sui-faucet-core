import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Discord Configuration
  discord: {
    token: process.env['DISCORD_TOKEN']!,
    clientId: process.env['DISCORD_CLIENT_ID']!,
    guildId: process.env['DISCORD_GUILD_ID'],
    logChannelId: process.env['LOG_CHANNEL_ID'],
  },

  // Faucet API Configuration
  faucet: {
    apiUrl: process.env['FAUCET_API_URL'] || 'http://localhost:3001/api/v1',
    apiKey: process.env['FAUCET_API_KEY'] || 'suisuisui',
  },

  // Bot Configuration
  bot: {
    prefix: process.env['BOT_PREFIX'] || '/',
    cooldownMinutes: parseInt(process.env['COOLDOWN_MINUTES'] || '60'),
    maxRequestsPerUser: parseInt(process.env['MAX_REQUESTS_PER_USER'] || '1'),
    adminRoleName: process.env['ADMIN_ROLE_NAME'] || 'Faucet Admin',
  },

  // Rate Limiting
  rateLimit: {
    enabled: process.env['RATE_LIMIT_ENABLED'] === 'true',
    windowMinutes: parseInt(process.env['RATE_LIMIT_WINDOW_MINUTES'] || '60'),
    maxRequests: parseInt(process.env['RATE_LIMIT_MAX_REQUESTS'] || '5'),
  },

  // Features
  features: {
    enableStatsCommand: process.env['ENABLE_STATS_COMMAND'] !== 'false',
    enableHelpCommand: process.env['ENABLE_HELP_COMMAND'] !== 'false',
    enableAdminCommands: process.env['ENABLE_ADMIN_COMMANDS'] !== 'false',
  },

  // Logging
  logging: {
    level: process.env['LOG_LEVEL'] || 'info',
  },
};

// Validation
const requiredEnvVars = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}
