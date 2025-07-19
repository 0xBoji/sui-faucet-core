import {
  Client,
  GatewayIntentBits,
  Collection,
  Events,
  ActivityType,
  EmbedBuilder,
  Colors
} from 'discord.js';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { faucetApi } from './services/faucetApi.js';
import cron from 'node-cron';

// Import commands
import * as faucetCommand from './commands/faucet.js';
import * as statusCommand from './commands/status.js';
import * as helpCommand from './commands/help.js';
import * as adminCommand from './commands/admin.js';

// Create Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ],
});

// Create commands collection
client.commands = new Collection();
client.commands.set(faucetCommand.data.name, faucetCommand);
client.commands.set(statusCommand.data.name, statusCommand);
client.commands.set(helpCommand.data.name, helpCommand);
client.commands.set(adminCommand.data.name, adminCommand);

// Bot ready event
client.once(Events.ClientReady, async (readyClient) => {
  logger.info('Discord bot is ready!', {
    botTag: readyClient.user.tag,
    botId: readyClient.user.id,
    guildCount: readyClient.guilds.cache.size,
  });

  // Set bot activity
  await updateBotActivity();

  // Schedule periodic activity updates
  cron.schedule('*/5 * * * *', updateBotActivity); // Every 5 minutes

  // Schedule health checks
  cron.schedule('*/10 * * * *', performHealthCheck); // Every 10 minutes

  console.log(`🤖 ${readyClient.user.tag} is online and ready!`);
});

// Handle slash command interactions
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) {
    logger.warn('Unknown command executed', {
      commandName: interaction.commandName,
      userId: interaction.user.id,
      username: interaction.user.username,
    });
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    logger.error('Command execution error', {
      commandName: interaction.commandName,
      userId: interaction.user.id,
      username: interaction.user.username,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    const errorEmbed = new EmbedBuilder()
      .setColor(Colors.Red)
      .setTitle('💥 Command Error')
      .setDescription('An error occurred while executing this command.')
      .setTimestamp();

    const replyOptions = { embeds: [errorEmbed], ephemeral: true };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(replyOptions);
    } else {
      await interaction.reply(replyOptions);
    }
  }
});

// Update bot activity status
async function updateBotActivity() {
  try {
    const [faucetStatus, isHealthy] = await Promise.all([
      faucetApi.getFaucetStatus(),
      faucetApi.getHealth(),
    ]);

    let activityName = 'Sui Faucet';
    let activityType = ActivityType.Watching;

    if (isHealthy && faucetStatus) {
      const balance = faucetStatus.balanceInSui.toFixed(1);
      activityName = `${balance} SUI available`;
      activityType = ActivityType.Custom;
    } else {
      activityName = 'Faucet offline';
      activityType = ActivityType.Custom;
    }

    await client.user?.setActivity(activityName, { type: activityType });

    logger.debug('Bot activity updated', {
      activityName,
      activityType,
      isHealthy,
      balance: faucetStatus?.balanceInSui,
    });

  } catch (error) {
    logger.error('Failed to update bot activity', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

// Perform periodic health checks
async function performHealthCheck() {
  try {
    const isHealthy = await faucetApi.getHealth();

    if (!isHealthy) {
      logger.warn('Health check failed - faucet API is unhealthy');

      // Optionally send alert to log channel
      if (config.discord.logChannelId) {
        try {
          const channel = await client.channels.fetch(config.discord.logChannelId);
          if (channel?.isTextBased() && 'send' in channel) {
            const alertEmbed = new EmbedBuilder()
              .setColor(Colors.Red)
              .setTitle('🚨 Health Check Alert')
              .setDescription('Faucet API health check failed')
              .setTimestamp();

            await channel.send({ embeds: [alertEmbed] });
          }
        } catch (channelError) {
          logger.error('Failed to send alert to log channel', {
            error: channelError instanceof Error ? channelError.message : 'Unknown error',
          });
        }
      }
    }

  } catch (error) {
    logger.error('Health check error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  await client.destroy();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  await client.destroy();
  process.exit(0);
});

// Handle unhandled errors
process.on('unhandledRejection', (error) => {
  logger.error('Unhandled promise rejection', {
    error: error instanceof Error ? error.message : 'Unknown error',
    stack: error instanceof Error ? error.stack : undefined,
  });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

// Login to Discord
client.login(config.discord.token).catch((error) => {
  logger.error('Failed to login to Discord', {
    error: error.message,
  });
  process.exit(1);
});

// Extend Discord.js types
declare module 'discord.js' {
  export interface Client {
    commands: Collection<string, any>;
  }
}