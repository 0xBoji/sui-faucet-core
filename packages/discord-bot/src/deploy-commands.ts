import { REST, Routes } from 'discord.js';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';

// Import command data
import * as faucetCommand from './commands/faucet.js';
import * as statusCommand from './commands/status.js';
import * as helpCommand from './commands/help.js';
import * as adminCommand from './commands/admin.js';

const commands = [
  faucetCommand.data.toJSON(),
  statusCommand.data.toJSON(),
  helpCommand.data.toJSON(),
  adminCommand.data.toJSON(),
];

const rest = new REST().setToken(config.discord.token);

async function deployCommands() {
  try {
    logger.info('Started refreshing application (/) commands.');

    let data: any;

    if (config.discord.guildId) {
      // Deploy to specific guild (faster for development)
      data = await rest.put(
        Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId),
        { body: commands }
      );
      logger.info(`Successfully reloaded ${data.length} guild application (/) commands.`);
    } else {
      // Deploy globally (takes up to 1 hour to propagate)
      data = await rest.put(
        Routes.applicationCommands(config.discord.clientId),
        { body: commands }
      );
      logger.info(`Successfully reloaded ${data.length} global application (/) commands.`);
    }

    console.log('✅ Commands deployed successfully!');
    console.log(`📝 Deployed ${data.length} commands:`);
    commands.forEach((cmd, index) => {
      console.log(`   ${index + 1}. /${cmd.name} - ${cmd.description}`);
    });

  } catch (error) {
    logger.error('Failed to deploy commands', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    console.error('❌ Failed to deploy commands:', error);
    process.exit(1);
  }
}

// Run deployment
deployCommands();
