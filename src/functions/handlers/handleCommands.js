const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const path = require('path');
const fs = require('fs');


module.exports = (client) => {
    client.handleCommands = async() => {
        const commandFolders = fs.readdirSync('./src/commands');
        for(const folder of commandFolders)
        {
            const files = fs.readdirSync(`./src/commands/${folder}`);
            const commandFiles = files.filter(file => {
                const ext = path.extname(file);
                return ext === '.js' || ext === '.cjs';
              });
              
            const { commands, commandArray } = client;
            for(const file of commandFiles)
            {
                const command = require(`../../commands/${folder}/${file}`);
                commands.set(command.data.name, command);
                commandArray.push(command.data.toJSON());
                console.log(`Command: ${command.data.name} has passed through!`)
            }
        }

        const clientID = "1360807382036250664";
        const guildID = "1360804208617459833";
        const rest = new REST({version: "9"}).setToken(process.env.token);
        try{
            console.log("Started refreshing commands...");
            await rest.put(Routes.applicationGuildCommands(clientID, guildID),
            {
                body: client.commandArray,
            });
            console.log("Successfully reloaded commands.");
        } catch (error)
        {
            console.error(error);
        }
    };
};