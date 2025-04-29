const {Client, Collection} = require('discord.js'); // requires discord.js
const cron = require('node-cron'); // used for scheduling scrape

require('dotenv').config(); // imports token
const {token} = process.env;
const fs = require('fs');

const client = new Client({intents: []});
client.commands = new Collection();
client.commandArray = [];

const functionFolders = fs.readdirSync('./src/functions');
for(const folder of functionFolders)
{
    const functionFiles = fs.readdirSync(`./src/functions/${folder}`).filter((file) => file.endsWith(".js"));
    for(const file of functionFiles) require(`./functions/${folder}/${file}`)(client);
}

function getDate()
{
    const today = new Date();
    // Get individual date components
    const month = String(today.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
    const day = String(today.getDate()).padStart(2, '0');
    const year = String(today.getFullYear()).slice(-2); // Get last 2 digits of the year

    // Get time components
    const hours = String(today.getHours()).padStart(2, '0'); // 24-hour format
    const minutes = String(today.getMinutes()).padStart(2, '0');

    // Format the date and time
    const formattedDateTime = `${month}-${day}-${year} ${hours}:${minutes}`;
    return formattedDateTime;
}

client.login(token).then(() => {
    console.log('Bot logged in successfully!');

    // Once the bot is logged in, listen for when the bot is ready
    client.once('ready', async () => {
        
        console.log('Bot is online!');
        // Call other handlers after the bot is online
        cron.schedule('0 0 * * *', async () => 
        {
            const dailyScrape = require('./auto/scrapeDaily');
            const runDate = getDate();
            console.log("Running scrape!");
            await dailyScrape.dailyScrape(client);
    });
        const dailyScrape = require('./auto/scrapeDaily');
        await dailyScrape.dailyScrape(client);
        client.handleEvents();
        client.handleCommands();
    });
});