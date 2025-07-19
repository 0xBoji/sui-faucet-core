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
  .setName('faucet')
  .setDescription('Request SUI testnet tokens from the faucet')
  .addStringOption(option =>
    option
      .setName('address')
      .setDescription('Your SUI wallet address (0x...)')
      .setRequired(true)
      .setMinLength(66)
      .setMaxLength(66)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const walletAddress = interaction.options.getString('address', true);
  const userId = interaction.user.id;
  const username = interaction.user.username;

  logger.info('Faucet request received', {
    userId,
    username,
    walletAddress,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
  });

  // Validate wallet address format
  if (!walletAddress.startsWith('0x') || walletAddress.length !== 66) {
    const errorEmbed = new EmbedBuilder()
      .setColor(Colors.Red)
      .setTitle('❌ Invalid Wallet Address')
      .setDescription('Please provide a valid SUI wallet address starting with `0x` and 66 characters long.')
      .addFields({
        name: 'Example',
        value: '`0x1234567890abcdef1234567890abcdef12345678901234567890abcdef123456`',
        inline: false,
      })
      .setTimestamp();

    await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    return;
  }

  // Check rate limiting
  const rateLimitResult = rateLimiter.checkRateLimit(userId);
  if (!rateLimitResult.allowed) {
    const retryAfter = rateLimitResult.retryAfter || 0;
    const retryMinutes = Math.ceil(retryAfter / 60);

    const rateLimitEmbed = new EmbedBuilder()
      .setColor(Colors.Orange)
      .setTitle('⏰ Rate Limited')
      .setDescription(`You've reached the request limit. Please wait before requesting again.`)
      .addFields(
        {
          name: 'Retry After',
          value: `${retryMinutes} minute(s)`,
          inline: true,
        },
        {
          name: 'Remaining Requests',
          value: '0',
          inline: true,
        }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [rateLimitEmbed], ephemeral: true });
    return;
  }

  // Defer reply as faucet request might take time
  await interaction.deferReply();

  try {
    // Make faucet request
    const result = await faucetApi.requestTokens(walletAddress);

    if (result.success) {
      // Success response
      const successEmbed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle('✅ Tokens Sent Successfully!')
        .setDescription(`Successfully sent **${Number(result.amount || 0) / 1_000_000_000} SUI** to your wallet.`)
        .addFields(
          {
            name: '💰 Amount',
            value: `${Number(result.amount || 0) / 1_000_000_000} SUI`,
            inline: true,
          },
          {
            name: '📝 Transaction Hash',
            value: `\`${result.transactionHash}\``,
            inline: false,
          },
          {
            name: '🔗 Explorer',
            value: `[View on SuiScan](https://suiscan.xyz/testnet/tx/${result.transactionHash})`,
            inline: false,
          },
          {
            name: '📊 Remaining Requests',
            value: `${rateLimiter.getRemainingRequests(userId)}`,
            inline: true,
          }
        )
        .setFooter({
          text: `Requested by ${username}`,
          iconURL: interaction.user.displayAvatarURL(),
        })
        .setTimestamp();

      await interaction.editReply({ embeds: [successEmbed] });

      logger.info('Faucet request successful', {
        userId,
        username,
        walletAddress,
        transactionHash: result.transactionHash,
        amount: result.amount,
      });

    } else {
      // Error response
      let errorColor: number = Colors.Red;
      let errorTitle = '❌ Request Failed';

      if (result.error?.code === 'RATE_LIMIT_EXCEEDED') {
        errorColor = Colors.Yellow; // Yellow for rate limit
        errorTitle = '⏰ Rate Limited';
      }

      const errorEmbed = new EmbedBuilder()
        .setColor(errorColor)
        .setTitle(errorTitle)
        .setDescription(result.message)
        .setTimestamp();

      if (result.retryAfter) {
        const retryMinutes = Math.ceil(result.retryAfter / 60);
        errorEmbed.addFields({
          name: 'Retry After',
          value: `${retryMinutes} minute(s)`,
          inline: true,
        });
      }

      if (result.error?.details) {
        errorEmbed.addFields({
          name: 'Details',
          value: result.error.details,
          inline: false,
        });
      }

      await interaction.editReply({ embeds: [errorEmbed] });

      logger.warn('Faucet request failed', {
        userId,
        username,
        walletAddress,
        error: result.error,
        message: result.message,
      });
    }

  } catch (error) {
    // Unexpected error
    const errorEmbed = new EmbedBuilder()
      .setColor(Colors.Red)
      .setTitle('💥 Unexpected Error')
      .setDescription('An unexpected error occurred while processing your request. Please try again later.')
      .addFields({
        name: 'Support',
        value: 'If this issue persists, please contact the administrators.',
        inline: false,
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [errorEmbed] });

    logger.error('Unexpected error in faucet command', {
      userId,
      username,
      walletAddress,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
}
