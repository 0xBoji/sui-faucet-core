import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  EmbedBuilder,
  Colors,
  PermissionFlagsBits 
} from 'discord.js';
import { faucetApi } from '../services/faucetApi.js';
import { rateLimiter } from '../services/rateLimiter.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

export const data = new SlashCommandBuilder()
  .setName('admin')
  .setDescription('Admin commands for managing the faucet bot')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(subcommand =>
    subcommand
      .setName('stats')
      .setDescription('View detailed faucet and bot statistics')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('clear-limits')
      .setDescription('Clear rate limits for a user')
      .addUserOption(option =>
        option
          .setName('user')
          .setDescription('User to clear rate limits for')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('clear-all-limits')
      .setDescription('Clear all rate limits (use with caution)')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('health')
      .setDescription('Check detailed health status of faucet services')
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  // Check if user has admin role
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    const noPermEmbed = new EmbedBuilder()
      .setColor(Colors.Red)
      .setTitle('❌ Access Denied')
      .setDescription('You need Administrator permissions to use admin commands.')
      .setTimestamp();

    await interaction.reply({ embeds: [noPermEmbed], flags: 64 }); // 64 = EPHEMERAL
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  const userId = interaction.user.id;
  const username = interaction.user.username;

  logger.info('Admin command executed', {
    userId,
    username,
    subcommand,
    guildId: interaction.guildId,
  });

  await interaction.deferReply({ flags: 64 }); // 64 = EPHEMERAL

  try {
    switch (subcommand) {
      case 'stats':
        await handleStats(interaction);
        break;
      case 'clear-limits':
        await handleClearLimits(interaction);
        break;
      case 'clear-all-limits':
        await handleClearAllLimits(interaction);
        break;
      case 'health':
        await handleHealth(interaction);
        break;
      default:
        throw new Error(`Unknown subcommand: ${subcommand}`);
    }
  } catch (error) {
    const errorEmbed = new EmbedBuilder()
      .setColor(Colors.Red)
      .setTitle('💥 Admin Command Error')
      .setDescription('An error occurred while executing the admin command.')
      .addFields({
        name: 'Error',
        value: error instanceof Error ? error.message : 'Unknown error',
        inline: false,
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [errorEmbed] });

    logger.error('Admin command error', {
      userId,
      username,
      subcommand,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
}

async function handleStats(interaction: ChatInputCommandInteraction) {
  const [faucetStatus, isHealthy] = await Promise.all([
    faucetApi.getFaucetStatus(),
    faucetApi.getHealth(),
  ]);

  // Try to get admin stats, but don't fail if it doesn't work
  let adminStats = null;
  try {
    adminStats = await faucetApi.getAdminStats(7);
  } catch (error) {
    logger.warn('Failed to get admin stats', { error });
  }

  const rateLimitStats = rateLimiter.getStats();

  const statsEmbed = new EmbedBuilder()
    .setColor(Colors.Blue)
    .setTitle('📊 Admin Statistics')
    .setDescription('Detailed statistics for the Sui Faucet bot')
    .setTimestamp();

  // Faucet stats
  if (faucetStatus && faucetStatus.success) {
    const balance = faucetStatus.balanceSui || 0;
    const network = faucetStatus.network || 'unknown';
    const defaultAmount = faucetStatus.defaultAmountSui || 0;

    statsEmbed.addFields(
      {
        name: '🚰 Faucet Information',
        value: `**Balance:** ${balance.toFixed(4)} SUI\n` +
               `**Network:** ${network.toUpperCase()}\n` +
               `**Default Amount:** ${defaultAmount} SUI\n` +
               `**Health:** ${isHealthy ? '🟢 Healthy' : '🔴 Unhealthy'}`,
        inline: true,
      }
    );
  } else {
    statsEmbed.addFields(
      {
        name: '🚰 Faucet Information',
        value: `**Status:** ❌ Unable to fetch faucet data\n` +
               `**Health:** ${isHealthy ? '🟢 Healthy' : '🔴 Unhealthy'}`,
        inline: true,
      }
    );
  }

  // Rate limiter stats
  statsEmbed.addFields(
    {
      name: '🛡️ Rate Limiter',
      value: `**Status:** ${rateLimitStats.enabled ? '✅ Enabled' : '❌ Disabled'}\n` +
             `**Active Users:** ${rateLimitStats.totalUsers}\n` +
             `**Window:** ${rateLimitStats.windowMinutes} minutes\n` +
             `**Max Requests:** ${rateLimitStats.maxRequests}`,
      inline: true,
    }
  );

  // Admin stats from backend
  if (adminStats && adminStats.success) {
    const stats = adminStats.data;
    statsEmbed.addFields(
      {
        name: '📈 Usage Statistics (7 days)',
        value: `**Total Requests:** ${stats.totalRequests || 0}\n` +
               `**Successful:** ${stats.successfulRequests || 0}\n` +
               `**Failed:** ${stats.failedRequests || 0}\n` +
               `**Unique Users:** ${stats.uniqueUsers || 0}`,
        inline: true,
      }
    );
  }

  // Bot configuration
  statsEmbed.addFields(
    {
      name: '⚙️ Bot Configuration',
      value: `**Cooldown:** ${config.bot.cooldownMinutes} minutes\n` +
             `**Max Requests/User:** ${config.bot.maxRequestsPerUser}\n` +
             `**Admin Role:** ${config.bot.adminRoleName}`,
      inline: true,
    }
  );

  await interaction.editReply({ embeds: [statsEmbed] });
}

async function handleClearLimits(interaction: ChatInputCommandInteraction) {
  const targetUser = interaction.options.getUser('user', true);
  const cleared = rateLimiter.clearUserLimit(targetUser.id);

  const embed = new EmbedBuilder()
    .setTimestamp();

  if (cleared) {
    embed
      .setColor(Colors.Green)
      .setTitle('✅ Rate Limits Cleared')
      .setDescription(`Successfully cleared rate limits for ${targetUser.username}`)
      .addFields({
        name: 'User',
        value: `<@${targetUser.id}> (${targetUser.username})`,
        inline: false,
      });
  } else {
    embed
      .setColor(Colors.Orange)
      .setTitle('ℹ️ No Limits Found')
      .setDescription(`No active rate limits found for ${targetUser.username}`)
      .addFields({
        name: 'User',
        value: `<@${targetUser.id}> (${targetUser.username})`,
        inline: false,
      });
  }

  await interaction.editReply({ embeds: [embed] });

  logger.info('Admin cleared user rate limits', {
    adminId: interaction.user.id,
    adminUsername: interaction.user.username,
    targetUserId: targetUser.id,
    targetUsername: targetUser.username,
    cleared,
  });
}

async function handleClearAllLimits(interaction: ChatInputCommandInteraction) {
  const statsBefore = rateLimiter.getStats();
  rateLimiter.clearAllLimits();

  const embed = new EmbedBuilder()
    .setColor(Colors.Green)
    .setTitle('🧹 All Rate Limits Cleared')
    .setDescription('Successfully cleared all user rate limits')
    .addFields({
      name: 'Users Affected',
      value: `${statsBefore.totalUsers}`,
      inline: true,
    })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });

  logger.warn('Admin cleared all rate limits', {
    adminId: interaction.user.id,
    adminUsername: interaction.user.username,
    usersAffected: statsBefore.totalUsers,
  });
}

async function handleHealth(interaction: ChatInputCommandInteraction) {
  const [faucetStatus, isHealthy] = await Promise.all([
    faucetApi.getFaucetStatus(),
    faucetApi.getHealth(),
  ]);

  const healthEmbed = new EmbedBuilder()
    .setTitle('🏥 Health Check')
    .setTimestamp();

  if (isHealthy && faucetStatus) {
    healthEmbed
      .setColor(Colors.Green)
      .setDescription('✅ All systems operational')
      .addFields(
        {
          name: '🌐 API Health',
          value: '🟢 Online',
          inline: true,
        },
        {
          name: '🚰 Faucet Status',
          value: faucetStatus.isHealthy ? '🟢 Healthy' : '🔴 Unhealthy',
          inline: true,
        },
        {
          name: '💰 Balance Status',
          value: faucetStatus.balanceInSui > 1 ? '🟢 Sufficient' : '🟡 Low',
          inline: true,
        }
      );
  } else {
    healthEmbed
      .setColor(Colors.Red)
      .setDescription('❌ System issues detected')
      .addFields(
        {
          name: '🌐 API Health',
          value: isHealthy ? '🟢 Online' : '🔴 Offline',
          inline: true,
        },
        {
          name: '🚰 Faucet Status',
          value: faucetStatus ? '🟢 Reachable' : '🔴 Unreachable',
          inline: true,
        }
      );
  }

  await interaction.editReply({ embeds: [healthEmbed] });
}
