module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {
        if (interaction.isChatInputCommand()) {
            const { commands } = client;
            const { commandName } = interaction;
            const command = commands.get(commandName);
            if (!command) return;

            try {
                await command.execute(interaction, client);
            } catch (error) {
                console.error(error);
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.editReply({
                        content: 'Something went wrong while executing the command...',
                        ephemeral: true
                    });
                } else {
                    console.log('Interaction already replied or deferred.');
                }
            }
        } else if (interaction.isButton()) {
            // Button interactions are handled within the message component collector
            // in your command's sendRender function.
            // No specific action is needed here in interactionCreate
            // UNLESS you have global button handlers.
            return; // Important: Stop further execution for button clicks
        }
    }
};