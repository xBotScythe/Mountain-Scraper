const { SlashCommandBuilder, EmbedBuilder, Embed } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder().setName('embed').setDescription('create embed!').addStringOption(option =>
            option.setName('text').setDescription('The input to send back').setRequired(true)),
    async execute(interaction, client)
    {
        const text = interaction.options.getString('text');
        const embed = new EmbedBuilder()
            .setTitle("Embed!")
            .setDescription(text)
            .setColor(0xa37eec)
            .setImage(client.user.displayAvatarURL());
        await interaction.reply({
            embeds: [embed]
        });
    }
}