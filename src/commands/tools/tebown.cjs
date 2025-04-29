const { SlashCommandBuilder, ActionRowBuilder, MessageAttachment, ComponentType, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, AttachmentBuilder } = require('discord.js');
const productsFile = require("../../../mountain_dew/products.json");
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const getColors = require('get-image-colors');
let typingInterval;

async function getPrimaryColor(imagePath) {
  try {
    // Read the file as a buffer if needed:
    const buffer = fs.readFileSync(imagePath);
    // Use the buffer for getColors if the library supports buffers;
    // otherwise, we can still pass the path.
    const colors = await getColors(imagePath, 'image/png');
    for (const color of colors) {
      const [r, g, b] = color.rgb();
      if (!(r > 230 && g > 230 && b > 230)) {
        return parseInt(color.hex().replace('#', ''), 16);
      }
    }
    return 0xCBA0DF;
  } catch (error) {
    console.error('❌ Failed to extract color, but program still running! Fallback color returned.:', error);
    return 0xCBA0DF;
  }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tebown')
        .setDescription('team supernova it')
        .addStringOption(option =>
            option.setName('inputflavor')
                .setDescription('Select the flavor to team supernovaify')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('size')
                .setDescription("Select a size")
                .setRequired(true)),
    async execute(interaction, client) {
        // Ensure this command is used in a guild text channel.
        if (!interaction.isChatInputCommand() || !interaction.inGuild()) {
            return await interaction.reply({ content: 'This command can only be used in a guild text channel.' });
        }
        await interaction.deferReply();

        const products = productsFile.results;
        let flavor = interaction.options.getString('inputflavor').toLowerCase();
        let size = interaction.options.getInteger("size").toString();
        const pythonScript = "src/auto/tebown.py";
        const filteredProducts = products
        .filter(product =>
            product.name.toLowerCase().includes(flavor) &&
            product.images.some(imgP =>
                imgP?.size?.toLowerCase().replace(/\s+/g, '').includes(size)
            )
        )
        .map(product => ({
            ...product,
            images: product.images.filter(imgP =>
                imgP?.size?.toLowerCase().replace(/\s+/g, '').includes(size)
            )
        }));
        if (filteredProducts.length === 0) {
            return await interaction.editReply('No products found matching that name.');
        }
        const select = new StringSelectMenuBuilder()
            .setPlaceholder('Choose a flavor!')
            .setMaxValues(1)
            .setCustomId('flavor_select');
        const usedLinks = new Set();
        const options = [];

        for (const product of filteredProducts) {
            for (const imgProduct of product.images) {
                if (product.name && imgProduct && imgProduct.link && !usedLinks.has(imgProduct.link)) {
                    const option = new StringSelectMenuOptionBuilder()
                        .setLabel(`${product.name} - ${imgProduct.size}`)
                        .setValue(imgProduct.link);
                    options.push(option);
                    usedLinks.add(imgProduct.link);
                } else {
                    console.warn('Skipping...');
                }
            }
        }
        select.addOptions(options);
        const row = new ActionRowBuilder()
            .addComponents(select);

        const reply = await interaction.editReply({
            content: 'Choose your flavor and size!',
            components: [row],
        });

        try {
            const selectedLink = await handleFlavorSelection(reply, interaction.user.id, client); // Await selection
            console.log("Selected link:", selectedLink);
            // Now, selectedLink contains the user's choice, and you can use it to run your Python script.

            const { stdout, stderr } = await runPythonScript(pythonScript, selectedLink, 'tebowned.png'); // Await python execution
            console.log('Python stdout:', stdout);
            if (stderr) {
                console.error('Python stderr:', stderr);
                await interaction.followUp({ content: `Error processing image: ${stderr}`, ephemeral: true }); // Use followUp
                return;
            }
            const attachment = new AttachmentBuilder('mountain_dew/output/tebowned.png');
            if(typingInterval)
            {
                clearInterval(typingInterval);
            }
            interaction.followUp({content: "Image processed successfully!", files: [attachment]});
           // return stdout; // Or any other relevant data -  handled by  interaction.followUp
        } catch (error) {
            console.error("Error during flavor selection or processing:", error);
            await interaction.followUp({ content: `An error occurred`, ephemeral: true}); // Use followUp
            return; // IMPORTANT:  Return after handling the error!
        }


        // const text = interaction.options.getString('text');
        // const embed = new EmbedBuilder()
        //     .setTitle("Embed!")
        //     .setDescription(text)
        //     .setColor(0xa37eec)
        //     .setImage(client.user.displayAvatarURL());
        // await interaction.editReply({
        //     embeds: [embed]
        // });
    }
};

/**
 * Handles the StringSelectMenu interaction and returns the selected value.
 * @param {Message} reply The message containing the select menu.
 * @param {string} userId The ID of the user who initiated the command.
 * @returns {Promise<string>} A Promise that resolves with the selected link, or rejects on error.
 */
async function handleFlavorSelection(reply, userId, client) {
    return new Promise(async (resolve, reject) => {
        const collector = reply.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            filter: (i) => i.user.id === userId,
            time: 60_000,
        });

        collector.on('collect', async (i) => {
            if (!i.values.length) {
                await i.update({ content: "Empty selection.", components: [] });
                reject("Empty selection.");
                return;
            }
            const selectedLink = i.values[0];
            await i.update({ content: `You have now selected: ${i.values.join(', ')}`, components: [] }); //remove the select menu
            resolve(selectedLink);
            const channel = await client.channels.fetch(i.channelId)
            await channel.sendTyping()
            typingInterval = setInterval(async () =>
            {
                await channel.sendTyping();
            }, 8000);
        });

        collector.on('end', collected => {
            console.log(`Collected ${collected.size} interactions.`);
            if (collected.size === 0) {
                reject("No selection made within 60 seconds.");
            }
        });
    });
}

/**
 * Executes the Python script.
 * @param {string} scriptPath The path to the Python script.
 * @param {string} imagePath The path to the image to process.
 * @param {string} outputPath The desired output path.
 * @returns {Promise<{ stdout: string, stderr: string }>}  A Promise that resolves with the stdout and stderr.
 */
function runPythonScript(scriptPath, imagePath, outputPath) {
    return new Promise((resolve, reject) => {
        const pythonProcess = spawn('python3', [scriptPath, imagePath, outputPath]);
        let stdoutData = '';
        let stderrData = '';

        pythonProcess.stdout.on('data', (data) => {
            stdoutData += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
            stderrData += data.toString();
        });

        pythonProcess.on('close', (code) => {
            console.log(`Python script exited with code ${code}`);
            if (code === 0) {
                resolve({ stdout: stdoutData, stderr: stderrData });
            } else {
                reject(stderrData || `Python script exited with code ${code}`); //reject with error
            }
        });
    });
}
