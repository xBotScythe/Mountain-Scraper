const { SlashCommandBuilder } = require('discord.js');
const manualScrape = require('../../auto/scrapeDaily.js');

module.exports = {
    data: new SlashCommandBuilder().setName('scrape').setDescription('forces a scrape!'),
    async execute(interaction, client)
    {
        console.log("Starting manual scrape...");
        await interaction.deferReply();
        console.time("scrape");
        await manualScrape.manualScrape(client);
        console.timeEnd("scrape");
        const newMessage = `Scrape complete!`;
        await interaction.editReply({content: newMessage});
        console.log("Manual scrape complete!");
    }
}