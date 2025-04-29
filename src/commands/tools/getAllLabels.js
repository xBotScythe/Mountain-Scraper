const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, EmbedBuilder } = require('discord.js');
const productsFile = require("../../../mountain_dew/products.json");
const getColors = require('get-image-colors');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const convert = require('../../auto/scrapeDaily');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('labels')
    .setDescription('Shows labels of products based on search')
    .addStringOption(option =>
      option.setName('query')
        .setDescription('Product name to search for')
        .setRequired(true)
    ),
  async execute(interaction) {
    try {
      // Only defer if the interaction isn’t already replied or deferred.
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ flags: 64 });
        console.log("Interaction deferred successfully.");
      }

      // Ensure this command is used in a guild text channel.
      if (!interaction.isChatInputCommand() || !interaction.inGuild()) {
        return await interaction.editReply({ content: 'This command can only be used in a guild text channel.' });
      }

      const products = productsFile.results;
      let query = interaction.options.getString('query').toLowerCase();
      if (query.includes("all")) {
        query = "";
      }
      const filteredProducts = products.filter(product =>
        product.name.toLowerCase().includes(query)
      );

      if (filteredProducts.length === 0) {
        return await interaction.editReply('No products found matching that name.');
      }

      await sendRender(interaction, filteredProducts, 0);
    } catch (error) {
      console.error('Error in execute:', error);
      if (!interaction.deferred && !interaction.replied) {
        await interaction.followUp({ content: 'Failed to process the product render.', flags: 64 });
      } else {
        console.log('Interaction already replied or deferred.');
      }
    }
  },
};

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

async function sendRender(interaction, filteredProducts, startIndex) {
    let productIndex = startIndex;
    let imageIndex = 0;
    let generatedImages = []; // Store images for the embed
    let attachments = []; // Store images for Discord attachments

    const updateMessage = async () => {
        const product = filteredProducts[productIndex];

        // Reset generated images and attachments for every update
        generatedImages = [];
        attachments = [];

        if (product.pdfs && product.pdfs.length > 0) {
            for (const pdf of product.pdfs) {
                const image = await convert.convertPdfToImage(pdf.link, path.basename(pdf.link, '.pdf'));
                if (image && image.path) {
                    const fileName = path.basename(image.path);
                    generatedImages.push({ link: `attachment://${fileName}`, path: image.path });
                    attachments.push({ attachment: image.path, name: fileName });
                }
            }
        }

        // Create buttons (Always present, even if no images exist)
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
                .setDisabled(imageIndex === 0 || generatedImages.length === 0),
            new ButtonBuilder()
                .setCustomId('nextImage')
                .setLabel('📸 Next')
                .setStyle(2)
                .setDisabled(imageIndex >= generatedImages.length - 1 || generatedImages.length === 0),
            new ButtonBuilder()
                .setCustomId('nextProduct')
                .setLabel('Product ➡️')
                .setStyle(1)
                .setDisabled(productIndex >= filteredProducts.length - 1)
        );

        if (generatedImages.length === 0) {
            // No images found, but send buttons with a fallback embed
            const embed = new EmbedBuilder()
                .setTitle(product.name || "No Renderable Images Available")
                .setDescription(`Product ID: ${product.id}\nNo images were found for this product.`)
                .setColor(0xCBA0DF); // Default fallback color

            await interaction.editReply({
                embeds: [embed],
                components: [row] // Buttons still sent
            });
        } else {
            // Images exist, embed them properly
            let color = await getPrimaryColor(generatedImages[0].path) || 0xCBA0DF;

            const embed = new EmbedBuilder()
                .setTitle(product.name || "Unnamed Product")
                .setImage(generatedImages[imageIndex].link)
                .setDescription(
                    `Product ID: ${product.id}\n` +
                    `Image ${imageIndex + 1} of ${generatedImages.length}\n` +
                    `Product ${productIndex + 1} of ${filteredProducts.length}`
                )
                .setColor(color);

            await interaction.editReply({
                embeds: [embed],
                components: [row], // Always include buttons
                files: [{ attachment: generatedImages[imageIndex].path, name: path.basename(generatedImages[imageIndex].path) }] // Only send files referenced in embed
            });
        }
    };

    await updateMessage();

    // Fetch reply for button collector (ensures updates happen within the original interaction)
    const replyMessage = await interaction.fetchReply();
    const filter = i =>
        i.user.id === interaction.user.id &&
        ['prevProduct', 'nextProduct', 'prevImage', 'nextImage'].includes(i.customId);

    // Attach the collector to the reply message instead of the channel
    const collector = replyMessage.createMessageComponentCollector({ filter, time: 60000 });

    collector.on('collect', async (i) => {
        await i.deferUpdate();

        switch (i.customId) {
            case 'prevProduct':
                if (productIndex > 0) {
                    productIndex--;
                    imageIndex = 0; // Reset image index on product change
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
                if (imageIndex < generatedImages.length - 1) imageIndex++;
                break;
        }

        await updateMessage();
    });

    collector.on('end', async () => {
        try {
            const disabledRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('prevProduct').setLabel('⬅️ Product').setStyle(1).setDisabled(true),
                new ButtonBuilder().setCustomId('prevImage').setLabel('🖼️ Prev').setStyle(2).setDisabled(true),
                new ButtonBuilder().setCustomId('nextImage').setLabel('📸 Next').setStyle(2).setDisabled(true),
                new ButtonBuilder().setCustomId('nextProduct').setLabel('Product ➡️').setStyle(1).setDisabled(true)
            );
            await interaction.editReply({ components: [disabledRow] });
        } catch (error) {
            console.error("Error updating embed on collector end:", error);
        }
    });
}
