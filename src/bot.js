const {Client, Collection} = require('discord.js') // requires discord.js
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
    for(const file of functionFiles) require(`./functions/${folder}/${file}`)(client)
}

// sets up handlers for events and commands
client.handleEvents();
client.handleCommands();

// logs in with token!
client.login(token);