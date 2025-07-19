import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  EmbedBuilder,
  Colors 
} from 'discord.js';
import { config } from '../config/index.js';

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('Show help information about the Sui Faucet bot');

export async function execute(interaction: ChatInputCommandInteraction) {
  const helpEmbed = new EmbedBuilder()
    .setColor(Colors.Blue)
    .setTitle('🤖 Sui Faucet Bot Help')
    .setDescription('Welcome to the Sui Faucet Discord Bot! Here\'s how to use it:')
    .addFields(
      {
        name: '🚰 `/faucet <address>`',
        value: 'Request SUI testnet tokens for your wallet address.\n' +
               '**Example:** `/faucet 0x1234567890abcdef1234567890abcdef12345678901234567890abcdef123456`',
        inline: false,
      },
      {
        name: '📊 `/status`',
        value: 'Check the faucet status, your remaining requests, and rate limits.',
        inline: false,
      },
      {
        name: '❓ `/help`',
        value: 'Show this help message.',
        inline: false,
      }
    )
    .addFields(
      {
        name: '⚡ Rate Limits',
        value: `• **${config.rateLimit.maxRequests} requests** per user every **${config.rateLimit.windowMinutes} minutes**\n` +
               `• Cooldown period: **${config.bot.cooldownMinutes} minutes** between requests`,
        inline: false,
      },
      {
        name: '💡 Tips',
        value: '• Make sure your wallet address is exactly 66 characters long\n' +
               '• Wallet addresses must start with `0x`\n' +
               '• Use `/status` to check your remaining requests\n' +
               '• Tokens are sent to Sui testnet only',
        inline: false,
      },
      {
        name: '🔗 Useful Links',
        value: '[Sui Explorer](https://suiscan.xyz/testnet) • ' +
               '[Sui Wallet](https://chrome.google.com/webstore/detail/sui-wallet/opcgpfmipidbgpenhmajoajpbobppdil) • ' +
               '[Sui Documentation](https://docs.sui.io/)',
        inline: false,
      }
    )
    .setFooter({
      text: 'Sui Faucet Bot • Made with ❤️ for the Sui community',
      iconURL: interaction.client.user?.displayAvatarURL(),
    })
    .setTimestamp();

  await interaction.reply({ embeds: [helpEmbed] });
}
