import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  EmbedBuilder,
  Colors 
} from 'discord.js';
import { faucetApi } from '../services/faucetApi.js';
import { rateLimiter } from '../services/rateLimiter.js';
import { logger } from '../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('status')
  .setDescription('Check faucet status and your request limits');

export async function execute(interaction: ChatInputCommandInteraction) {
  const userId = interaction.user.id;
  const username = interaction.user.username;

  logger.info('Status command executed', {
    userId,
    username,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
  });

  await interaction.deferReply();

  try {
    // Get faucet status and health
    const [faucetStatus, isHealthy] = await Promise.all([
      faucetApi.getFaucetStatus(),
      faucetApi.getHealth(),
    ]);

    // Get user rate limit info
    const remainingRequests = rateLimiter.getRemainingRequests(userId);
    const resetTime = rateLimiter.getResetTime(userId);
    const rateLimitStats = rateLimiter.getStats();

    const statusEmbed = new EmbedBuilder()
      .setTitle('🚰 Sui Faucet Status')
      .setTimestamp();

    // Set color based on health
    if (isHealthy && faucetStatus) {
      statusEmbed.setColor(Colors.Green);
      statusEmbed.setDescription('✅ Faucet is online and operational');
    } else {
      statusEmbed.setColor(Colors.Red);
      statusEmbed.setDescription('❌ Faucet is currently unavailable');
    }

    // Add faucet information
    if (faucetStatus) {
      statusEmbed.addFields(
        {
          name: '💰 Faucet Balance',
          value: `${faucetStatus.balanceSui.toFixed(4)} SUI`,
          inline: true,
        },
        {
          name: '🎁 Default Amount',
          value: `${faucetStatus.defaultAmountSui} SUI`,
          inline: true,
        },
        {
          name: '🌐 Network',
          value: faucetStatus.network.toUpperCase(),
          inline: true,
        },
        {
          name: '📍 Faucet Address',
          value: `\`${faucetStatus.faucetAddress.slice(0, 20)}...\``,
          inline: false,
        }
      );
    }

    // Add user rate limit information
    statusEmbed.addFields(
      {
        name: '📊 Your Remaining Requests',
        value: `${remainingRequests}/${rateLimitStats.maxRequests}`,
        inline: true,
      },
      {
        name: '⏰ Rate Limit Window',
        value: `${rateLimitStats.windowMinutes} minutes`,
        inline: true,
      }
    );

    if (resetTime) {
      statusEmbed.addFields({
        name: '🔄 Limit Resets',
        value: `<t:${Math.floor(resetTime.getTime() / 1000)}:R>`,
        inline: true,
      });
    }

    // Add rate limiter stats
    statusEmbed.addFields(
      {
        name: '👥 Active Users',
        value: `${rateLimitStats.totalUsers}`,
        inline: true,
      },
      {
        name: '🛡️ Rate Limiting',
        value: rateLimitStats.enabled ? '✅ Enabled' : '❌ Disabled',
        inline: true,
      }
    );

    // Add health indicator
    const healthIndicator = isHealthy ? '🟢 Online' : '🔴 Offline';
    statusEmbed.addFields({
      name: '🏥 Health Status',
      value: healthIndicator,
      inline: true,
    });

    await interaction.editReply({ embeds: [statusEmbed] });

    logger.info('Status command completed', {
      userId,
      username,
      isHealthy,
      remainingRequests,
      faucetBalance: faucetStatus?.balanceInSui,
    });

  } catch (error) {
    const errorEmbed = new EmbedBuilder()
      .setColor(Colors.Red)
      .setTitle('💥 Error')
      .setDescription('Failed to retrieve faucet status. Please try again later.')
      .setTimestamp();

    await interaction.editReply({ embeds: [errorEmbed] });

    logger.error('Error in status command', {
      userId,
      username,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
}
