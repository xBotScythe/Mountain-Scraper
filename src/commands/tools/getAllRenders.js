const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, EmbedBuilder } = require('discord.js');
const productsFile = require("../../../mountain_dew/products.json");
const getColors = require('get-image-colors');
const axios = require('axios');


module.exports = {
    data: new SlashCommandBuilder()
        .setName('render')
        .setDescription('Shows renders of products based on search')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('Product name to search for')
                .setRequired(true)
        ),
    async execute(interaction) {
        if (!interaction.isChatInputCommand() || !interaction.inGuild()) {
            return interaction.reply({ content: 'This command can only be used in a guild text channel.', ephemeral: true });
        }

        const products = productsFile.results;
        let query = interaction.options.getString('query').toLowerCase();
        if(query.toLowerCase().includes("all"))
        {
            query = "";
        }
        const filteredProducts = products.filter(product =>
            product.name.toLowerCase().includes(query)
        );

        if (filteredProducts.length === 0) {
            return interaction.reply('No products found matching that name.');
        }

        await interaction.deferReply();

        try {
            await sendRender(interaction, filteredProducts, 0);
        } catch (error) {
            console.error('Error in execute:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.followUp({ content: 'Failed to process the product render.', ephemeral: true });
            } else {
                console.log('Interaction already replied or deferred during execute error.');
            }
        }
    },
};

async function getPrimaryColor(imageUrl) {
    try {
        const response = await axios.get(imageUrl, {responseType: 'arraybuffer'});
        const colors = await getColors(response.data, 'image/jpeg'); // or 'image/png' if needed
        for (const color of colors) {
            const [r, g, b] = color.rgb();

            // Skip near-white colors (you can tweak the threshold)
            if (!(r > 230 && g > 230 && b > 230)) {
                return parseInt(color.hex().replace('#', ''), 16);
            }
        }
        return 0xCBA0DF;
    } catch (error) {
        console.error('❌ Failed to extract color:', error);
        return null;
    }
}
async function sendRender(interaction, filteredProducts, startIndex) {
    let productIndex = startIndex;
    let imageIndex = 0;

    let channel = interaction.channel;
    if (!channel && interaction.guild && interaction.channelId) {
        try {
            channel = await interaction.guild.channels.fetch(interaction.channelId);
        } catch (error) {
            console.error('❌ Failed to fetch channel:', error);
            return await interaction.followUp({
                content: 'Could not access the channel to paginate.',
                ephemeral: true,
            });
        }
    }

    if (!channel) {
        console.error('❌ Channel is still null.');
        return await interaction.followUp({
            content: 'Something went wrong. Channel could not be found.',
            ephemeral: true,
        });
    }

    const updateMessage = async () => {
        const product = filteredProducts[productIndex];
        const images = product.images || [];

        // Clamp image index if needed
        if (imageIndex >= images.length) imageIndex = images.length - 1;
        if (imageIndex < 0) imageIndex = 0;

        // Extract embed color from first non-white image
        let color = 0xCBA0DF;
        for (const img of images) {
            if (img?.link) {
                const extractedColor = await getPrimaryColor(img.link);
                if (extractedColor) {
                    color = extractedColor;
                    break;
                }
            }
        }

        if(product.name.includes("Mtn"))
        {
            product.name = product.name.replace("Mtn", "Mountain")
        }
        const embed = new EmbedBuilder()
            .setTitle(product.name || "Unnamed Product")
            .setImage(images[imageIndex]?.link || null)
            .setDescription(
                `Product ID: ${product.id}\n` +
                `Image ${imageIndex + 1} of ${images.length}\n` +
                `Product ${productIndex + 1} of ${filteredProducts.length}`
            )
            .setColor(color);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('prevProduct')
                .setLabel('⬅️ Product')
                .setStyle(1)
                .setDisabled(productIndex === 0),
            new ButtonBuilder()
                .setCustomId('prevImage')
                .setLabel('🖼️ Prev')
                .setStyle(2)
                .setDisabled(imageIndex === 0),
            new ButtonBuilder()
                .setCustomId('nextImage')
                .setLabel('📸 Next')
                .setStyle(2)
                .setDisabled(imageIndex >= images.length - 1),
            new ButtonBuilder()
                .setCustomId('nextProduct')
                .setLabel('Product ➡️')
                .setStyle(1)
                .setDisabled(productIndex >= filteredProducts.length - 1)
        );

        await interaction.editReply({ embeds: [embed], components: [row] });
    };

    await updateMessage();

    const filter = i =>
        i.user.id === interaction.user.id &&
        ['prevProduct', 'nextProduct', 'prevImage', 'nextImage'].includes(i.customId);

    const collector = channel.createMessageComponentCollector({ filter, time: 60000 });

    collector.on('collect', async (i) => {
        await i.deferUpdate();

        switch (i.customId) {
            case 'prevProduct':
                if (productIndex > 0) {
                    productIndex--;
                    imageIndex = 0;
                }
                break;
            case 'nextProduct':
                if (productIndex < filteredProducts.length - 1) {
                    productIndex++;
                    imageIndex = 0;
                }
                break;
            case 'prevImage':
                if (imageIndex > 0) imageIndex--;
                break;
            case 'nextImage':
                if (imageIndex < (filteredProducts[productIndex].images?.length || 1) - 1) imageIndex++;
                break;
        }

        await updateMessage();
    });

    collector.on('end', async () => {
        const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('prevProduct').setLabel('⬅️ Product').setStyle(1).setDisabled(true),
            new ButtonBuilder().setCustomId('prevImage').setLabel('🖼️ Prev').setStyle(2).setDisabled(true),
            new ButtonBuilder().setCustomId('nextImage').setLabel('📸 Next').setStyle(2).setDisabled(true),
            new ButtonBuilder().setCustomId('nextProduct').setLabel('Product ➡️').setStyle(1).setDisabled(true)
        );
        await interaction.editReply({ components: [disabledRow] });
    });
}
