require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// ثابت الإيموجي
const EMOJI_ID = 'كوبي ايدي الايموجي';
const EMOJI_NAME = 'emoji_2 اسم الايموجي مثال ';

// ثابت القناة
const CHANNEL_ID = 'كوبي ايدي الروم';
// ثابت الرسالة
const MESSAGE_ID = 'كوبي ايدي الرسالة ';
// ثابت السيرفر والرول
const GUILD_ID = 'ايدي السيرفر ';
const ROLE_ID = 'ايدي الرتبه العضو';

client.once('ready', async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);

    try {
        const channel = await client.channels.fetch(CHANNEL_ID);
        if (!channel) {
            console.error(`❌ لم أجد القناة بالـ ID ${CHANNEL_ID}`);
            return;
        }

        const message = await channel.messages.fetch(MESSAGE_ID);
        if (!message) {
            console.error(`❌ لم أجد الرسالة بالـ ID ${MESSAGE_ID}`);
            return;
        }

        await message.react(`${EMOJI_NAME}:${EMOJI_ID}`);
        console.log(`✅ تم إضافة الريأكشن على الرسالة ${MESSAGE_ID}`);
    } catch (error) {
        console.error('⚠️ حدث خطأ أثناء جلب القناة أو الرسالة أو إضافة الريأكشن:', error);
    }
});

client.on('messageReactionAdd', async (reaction, user) => {
    try {
        if (reaction.partial) await reaction.fetch();
        if (user.bot) return;

        console.log(`📥 تم الريأكشن بـ ${reaction.emoji.name}:${reaction.emoji.id}`);

        if (reaction.emoji.id !== EMOJI_ID) return;

        const guild = await client.guilds.fetch(GUILD_ID);
        const member = await guild.members.fetch(user.id);

        await member.roles.add(ROLE_ID);
        console.log(`🎉 تم إعطاء الرول لـ ${user.username}`);
    } catch (error) {
        console.error('❌ خطأ في إعطاء الرول:', error);
    }
});

client.on('messageReactionRemove', async (reaction, user) => {
    try {
        if (reaction.partial) await reaction.fetch();
        if (user.bot) return;

        if (reaction.emoji.id !== EMOJI_ID) return;

        const guild = await client.guilds.fetch(GUILD_ID);
        const member = await guild.members.fetch(user.id);

        await member.roles.remove(ROLE_ID);
        console.log(`❌ تم إزالة الرول من ${user.username}`);
    } catch (error) {
        console.error('❌ خطأ في إزالة الرول:', error);
    }
});

client.login(process.env.TOKEN);
