const fs = require('fs');
const os = require('os');
const path = require('path');
const { EmbedBuilder, ButtonBuilder, ButtonComponent, ActionRowBuilder, AttachmentBuilder } = require('discord.js');
const axios = require('axios');
const getColors = require('get-image-colors');
const PDFtoImage = require('pdf-to-png-converter');
const { spawn } = require('child_process');
const cron = require('node-cron');

const CHANNEL_ID = "1360804211708657867";
const REAL_IMAGE_DIR = "./mountain_dew/pdfs/pngs/"

function extractFilenames(entries = []) {
    return entries.map(entry => path.basename(entry.link)).sort();
}

function compareProducts(oldData, newData, client) {
    const oldMap = new Map();
    const changes = [];

    for (const product of oldData.results || []) {
        oldMap.set(product.id, {
            images: extractFilenames(product.images),
            pdfs: extractFilenames(product.pdfs),
            name: product.name
        });
    }

    for (const newProduct of newData.results || []) {
        const oldProduct = oldMap.get(newProduct.id);
        const newImages = extractFilenames(newProduct.images);
        const newPdfs = extractFilenames(newProduct.pdfs);

        if (!oldProduct) {
            changes.push({
                type: 'New Product',
                id: newProduct.id,
                name: newProduct.name,
                image: newProduct.images?.[0]?.link,
                pdf: newProduct.pdfs?.[0]?.link,
                size: newProduct.size
            });
        } else {
            const imageChanged = JSON.stringify(newImages) !== JSON.stringify(oldProduct.images);
            const pdfChanged = JSON.stringify(newPdfs) !== JSON.stringify(oldProduct.pdfs);

            if (imageChanged || pdfChanged) {
                changes.push({
                    type: 'Updated Product',
                    id: newProduct.id,
                    name: newProduct.name,
                    image: newProduct.images?.[0]?.link,
                    pdf: newProduct.pdfs?.[0]?.link,
                    size: newProduct.size
                });
            }
        }
    }

    if (changes.length > 0) {
        console.log("Change detected! Sending results to Discord...")
        sendResultsToDiscord(changes, client);
    } else {
        console.log('No product changes detected.');
    }
}

async function convertPdfToImage(pdfPath, filename) {
    const safeFilename = filename.replace(/[^\w.-]/g, '_');
    const finalImagePath = REAL_IMAGE_DIR + safeFilename + '.png';
    try {
        const response = await axios.get(pdfPath, { responseType: 'arraybuffer' });
        const pdfBuffer = response.data;
        const pngPage = await PDFtoImage.pdfToPng(pdfBuffer, { viewportScale: 1.5 });
        await fs.promises.writeFile(finalImagePath, pngPage[0].content);
        console.log(`file path:${finalImagePath}`)
        return {
            ...pngPage[0],
            path: finalImagePath, // Return the final path
        };
    } catch (error) {
        console.error('Error converting PDF to image:', error);
        return null;
    }
}

const messageAttachments = new Map(); // Store attachments globally

async function sendResultsToDiscord(results, client) {
    try {
        const channel = await client.channels.fetch(CHANNEL_ID);
        console.log('Channel fetched successfully!');
        for (const result of results) {
            let image;
            let attachments = [];
            let imageUrl = null;
            let embedColor = '#cba0df';
            const embed = new EmbedBuilder()
                .setTitle(`Product ID: ${result.id}`)
                .setDescription(`Product Name: ${result.name}`)
                .setTimestamp()
                .setFooter({ text: 'Product Comparison' });
                const imageResult = await convertPdfToImage(result.pdf, `${result.name} ${result.size}`);
                if (imageResult && imageResult.url) {
                    console.log("Image URL to embed:", imageResult.url);
                    embed.setImage(imageResult.url);
                    // Store the URL for the send button
                    result.imageUrlForSend = imageResult.url;
                } 
                else if(imageResult && imageResult.path)
                {
                    console.log("Attachment to embed:", imageResult.path);
                    const fileName = path.basename(imageResult.path);
                    image = { link: `attachment://${fileName}` };
                    attachments.push({attachment: imageResult.path, name: fileName});                        
                }
                else {
                    console.warn("Failed to convert PDF to image or get URL for:", result.name);
                }
            messageAttachments.set(result.id, attachments);
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`send-${result.id}`) // Unique custom ID for each send button
                    .setLabel('✅ Send')
                    .setStyle("Success"),
                new ButtonBuilder()
                    .setCustomId(`ignore-${result.id}`) // Unique custom ID for each ignore button
                    .setLabel('❌ Ignore')
                    .setStyle("Danger")
            );

            await channel.send({ embeds: [embed], components: [row], files: attachments});
            console.log(`Embed with buttons sent for Product ID: ${result.id}`);
        }

        // Create a global component collector to listen for button interactions in the channel
        const collector = channel.createMessageComponentCollector({
            filter: i => i.customId.startsWith('send-') || i.customId.startsWith('ignore-'),
            time: 60000, // Adjust the time limit as needed
        });

        collector.on('collect', async (i) => {
            try {
                await i.deferReply({ ephemeral: true }); // Acknowledge the interaction immediately

                const productId = i.customId.split('-')[1];
                const selectedResult = results.find(res => res.id.toString() === productId);

                if (i.customId.startsWith('send-')) {
                    const destinationChannel = await client.channels.fetch("1361334054728765461");
                    if (destinationChannel) {
                        const productId = i.customId.split('-')[1];
                        const storedAttachments = messageAttachments.get(productId);
                        const embedToSend = new EmbedBuilder()
                            .setColor(i.message.embeds[0]?.color || '#cba0df')
                            .setTitle(i.message.embeds[0]?.title)
                            .setDescription(i.message.embeds[0]?.description)
                            .setImage(i.message.embeds[0]?.image?.url)
                            .setTimestamp()
                            .setFooter({ text: 'Product Comparison' });

                        await destinationChannel.send({content: "New Render!", embeds: [embedToSend], files: storedAttachments});
                        await i.editReply({ content: `✅ Product ID ${productId} sent!`, ephemeral: true });
                    } else {
                        await i.editReply({ content: '❌ Destination channel not found.', ephemeral: true });
                    }   
                } else if (i.customId.startsWith('ignore-')) {
                    await i.editReply({ content: `🗑️ Product ID ${productId} ignored.`, ephemeral: true });
                }

                // Optionally, do NOT remove the buttons if you want them to be usable multiple times.
                // await i.update({ components: [] });

            } catch (error) {
                console.error('Error handling button interaction:', error);
                // Optionally, inform the user of an error
                if (!i.replied && !i.deferred) {
                    await i.followUp({ content: '⚠️ An error occurred during this action.', ephemeral: true });
                }
            }
        });

    } catch (error) {
        console.error('Error sending results to Discord:', error);
    }
}

    

async function dailyScrape(client) {
    if(!client)
    {
        return;
    }
    cron.schedule('0 0 * * *', () => {
        console.log('Running daily scraper!');

        const oldPath = path.resolve(__dirname, '../../mountain_dew/products_old.json');
        const newPath = path.resolve(__dirname, '../../mountain_dew/products.json');
        const pythonScript = path.resolve(__dirname, '../auto/scraper.py');
        const pyProcess = spawn('python3', [pythonScript]);

        pyProcess.stdout.on('data', (data) => {
            console.log(`Python stdout: ${data}`);
        });

        pyProcess.stderr.on('data', (data) => {
            console.error(`Python stderr: ${data}`);
        });

        pyProcess.on('close', () => {
            console.log(`Python script finished.`);

            try {
                const newData = JSON.parse(fs.readFileSync(newPath));
                const oldData = fs.existsSync(oldPath)
                    ? JSON.parse(fs.readFileSync(oldPath))
                    : [];
                compareProducts(oldData, newData, client);
            } catch (e) {
                console.error('Failed to compare data:', e);
            }
        });
    });
}
module.exports = {
     dailyScrape: dailyScrape,
     convertPdfToImage: convertPdfToImage,
     sendResultsToDiscord: sendResultsToDiscord,
     TEMP_IMAGE_DIR: REAL_IMAGE_DIR
};


async function manualScrape(client) {
    if(!client)
    {
        return;
    }
    console.log('Running daily scraper!');

    const oldPath = path.resolve(__dirname, '../../mountain_dew/products_old.json');
    const newPath = path.resolve(__dirname, '../../mountain_dew/products.json');
    const pythonScript = path.resolve(__dirname, '../auto/scraper.py');
    try {
        if (fs.existsSync(oldPath)) {
            fs.unlinkSync(oldPath);
            console.log('Old product file deleted!');
        }
    } catch (err) {
        console.error(`Error deleting old file: ${err.message}`);
    }

    const pyProcess = spawn('python3', [pythonScript]);

    pyProcess.stdout.on('data', (data) => {
        console.log(`Python stdout: ${data}`);
    });

    pyProcess.stderr.on('data', (data) => {
        console.error(`Python stderr: ${data}`);
    });

    pyProcess.on('close', () => {
        console.log(`Python script finished.`);

        try {
            const newData = JSON.parse(fs.readFileSync(newPath));
            const oldData = fs.existsSync(oldPath)
                ? JSON.parse(fs.readFileSync(oldPath))
                : [];
            compareProducts(oldData, newData, client);
        } catch (e) {
            console.error('Failed to compare data:', e);
        }
    });
}
module.exports = {
     dailyScrape: dailyScrape,
     convertPdfToImage: convertPdfToImage,
     sendResultsToDiscord: sendResultsToDiscord,
     TEMP_IMAGE_DIR: REAL_IMAGE_DIR,
     manualScrape: manualScrape
};
