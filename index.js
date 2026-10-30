'use strict';
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {
    Client,
    GatewayIntentBits,
    AttachmentBuilder,
    EmbedBuilder,
    SlashCommandBuilder,
    PermissionFlagsBits,
    ActivityType,
    REST,
    Routes
} = require('discord.js');

// ==========================================
// 🛡️ نظام الحماية من التوقف والانهيار (Anti-Crash)
// ==========================================
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ [Anti-Crash] Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err, origin) => {
    console.error('⚠️ [Anti-Crash] Uncaught Exception:', err);
});
process.on('uncaughtExceptionMonitor', (err, origin) => {
    console.error('⚠️ [Anti-Crash] Exception Monitor:', err);
});

// ==========================================
// 🌐 خادم ويب مدمج للحفاظ على عمل البوت في Railway
// (Railway Keep-Alive Server)
// ==========================================
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
            <meta charset="UTF-8">
            <title>Discord Separator & Auto-Reaction Bot</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, sans-serif; background: #0f172a; color: #f8fafc; text-align: center; padding: 40px; }
                .card { background: #1e293b; max-width: 500px; margin: 0 auto; padding: 30px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.5); }
                .badge { display: inline-block; padding: 6px 14px; border-radius: 20px; background: #22c55e; color: white; font-weight: bold; }
                h1 { margin-top: 15px; color: #38bdf8; }
                p { color: #94a3b8; line-height: 1.6; }
            </style>
        </head>
        <body>
            <div class="card">
                <span class="badge">شغال بنجاح ✅</span>
                <h1>🤖 بوت الفواصل والرياكشن</h1>
                <p>البوت يعمل بشكل متصل ومستقر على منصة Railway 24/7.</p>
                <p>الحالة: <strong>${client.isReady() ? 'متصل بديسكورد (' + client.user.tag + ')' : 'جاري الاتصال...'}</strong></p>
            </div>
        </body>
        </html>
    `);
});

server.listen(PORT, () => {
    console.log(`🌐 [Web Server] خادم الويب يعمل على المنفذ ${PORT} للحفاظ على استقرار واستمرار الخدمة في Railway.`);
});

// ==========================================
// ⚙️ إعدادات البوت والبيئة
// ==========================================
const token = (process.env.DISCORD_TOKEN || process.env.TOKEN || '').trim();

if (!token || token === 'توكنك') {
    console.error('❌ [خطأ أساسي]: لم يتم تحديد DISCORD_TOKEN في ملف .env أو في متغيرات Railway!');
    console.error('📌 يرجى إضافة توكن البوت لتشغيله بنجاح.');
}

const config = {
    // 1. روم التقييمات (يضع رياكشن + يرسل الفاصل) - الافتراضي: 1447978433178239211
    reviewChannel: (process.env.REVIEW_CHANNEL_ID || '1447978433178239211').trim(),
    reviewEmojis: parseEmojiList(process.env.REVIEW_EMOJIS || '⭐'),
    
    // 2. روم الإثباتات (يضع رياكشن فقط بدون فاصل) - الافتراضي: 1551213877717639181
    proofsChannel: (process.env.PROOFS_CHANNEL_ID || '1551213877717639181').trim(),
    proofsEmojis: parseEmojiList(process.env.PROOFS_EMOJIS || '✅'),

    // روم الفاصل الحصري (يرسل الفاصل في هذا الروم فقط)
    separatorChannel: (process.env.SEPARATOR_CHANNEL_ID || process.env.REVIEW_CHANNEL_ID || '1447978433178239211').trim(),

    // رومات إضافية (رياكشن فقط)
    extraChannels: (process.env.EXTRA_CHANNELS || '')
        .split(',')
        .map(c => c.trim())
        .filter(Boolean),
    extraEmojis: parseEmojiList(process.env.EXTRA_EMOJIS || '❤️'),

    // الفاصل
    enableSeparator: process.env.ENABLE_SEPARATOR !== 'false',
    separatorInterval: Math.max(1, parseInt(process.env.SEPARATOR_INTERVAL || '1', 10)),
    separatorFile: process.env.SEPARATOR_FILE || 'separator.gif',
    separatorUrl: (process.env.SEPARATOR_URL || '').trim(),

    // التفاعل مع البوتات الأخرى (افتراضياً لا يتفاعل لمنع التكرار)
    ignoreBots: process.env.IGNORE_BOTS !== 'false'
};

// عدادات الإحصائيات
const stats = {
    messagesCount: 0,
    reactionsCount: 0,
    separatorsCount: 0,
    errorsCount: 0
};

// عداد الفواصل لكل روم (لخاصية إرسال الفاصل كل X رسائل)
const channelCounters = new Map();

// طابور الرسائل لكل روم (Queue) لمنع تضارب الطلبات والـ Rate Limit
const channelQueues = new Map();

// دالة مساعدة لتحويل قائمة الإيموجيات المكتوبة بفاصلة إلى مصفوفة
function parseEmojiList(str) {
    if (!str) return [];
    return str
        .split(',')
        .map(e => e.trim())
        .filter(Boolean);
}

// استخراج المعرف أو الإيموجي المناسب لـ Discord.js
function extractEmoji(emojiStr) {
    if (!emojiStr) return null;
    const trimmed = emojiStr.trim();
    // إذا كان بصيغة <a:name:id> أو <:name:id>
    const match = trimmed.match(/<a?:\w+:(\d+)>/);
    if (match) return match[1];
    // إذا كان ID فقط
    if (/^\d{17,21}$/.test(trimmed)) return trimmed;
    // إذا كان إيموجي يونيكود عادي (مثل ⭐ أو ✅)
    return trimmed;
}

// دالة تجهيز ملف أو رابط الفاصل
function getSeparatorPayload() {
    // 1. إذا كان رابط مباشر متوفر
    if (config.separatorUrl && config.separatorUrl.startsWith('http')) {
        return { files: [config.separatorUrl] };
    }

    // 2. البحث عن الملف محلياً (separator.gif)
    const filePath = path.resolve(__dirname, config.separatorFile || 'separator.gif');
    if (fs.existsSync(filePath)) {
        return {
            files: [new AttachmentBuilder(filePath, { name: 'separator.gif' })]
        };
    }

    return null;
}

// ==========================================
// 🤖 إنشاء عميل ديسكورد (Discord Client)
// ==========================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ==========================================
// ⚡ أوامر السلاش (Slash Commands)
// ==========================================
const slashCommands = [
    new SlashCommandBuilder()
        .setName('test-separator')
        .setDescription('إرسال تجربة لصورة أو GIF الفاصل في الروم الحالي للتأكد من ظهوره')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    new SlashCommandBuilder()
        .setName('stats')
        .setDescription('عرض إحصائيات البوت (عدد الرسائل والرياكشنات والفواصل)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    new SlashCommandBuilder()
        .setName('ping')
        .setDescription('فحص سرعة استجابة واتصال البوت')
];

// تسجيل أوامر السلاش عند جاهزية البوت
async function registerSlashCommands() {
    try {
        const rest = new REST({ version: '10' }).setToken(token);
        console.log('🔄 [Slash Commands] جاري تسجيل وتحديث أوامر السلاش...');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: slashCommands.map(cmd => cmd.toJSON()) }
        );
        console.log('✅ [Slash Commands] تم تسجيل أوامر السلاش بنجاح!');
    } catch (err) {
        console.error('⚠️ [Slash Commands] تعذر تسجيل أوامر السلاش:', err.message);
    }
}

// ==========================================
// 🚀 عند تشغيل البوت
// ==========================================
client.once('ready', async () => {
    console.log(`===============================================`);
    console.log(`✅ تم تسجيل الدخول بنجاح كـ: ${client.user.tag}`);
    console.log(`🆔 معرف البوت: ${client.user.id}`);
    console.log(`📁 الفاصل المستخدم: ${config.separatorUrl ? 'رابط مباشر: ' + config.separatorUrl : config.separatorFile}`);
    console.log(`⏱️ معدل الفاصل: كل ${config.separatorInterval} رسالة`);
    console.log(`📢 روم التقييمات (رياكشن + فاصل): ${config.reviewChannel} | الإيموجي: ${config.reviewEmojis.join(' ')}`);
    console.log(`📢 روم الإثباتات (رياكشن فقط): ${config.proofsChannel} | الإيموجي: ${config.proofsEmojis.join(' ')}`);
    console.log(`➖ روم الفاصل الحصري: ${config.separatorChannel}`);
    if (config.extraChannels.length > 0) {
        console.log(`📢 رومات إضافية (${config.extraChannels.length}): ${config.extraChannels.join(', ')} | الإيموجي: ${config.extraEmojis.join(' ')}`);
    }
    console.log(`===============================================`);

    // تعيين حالة البوت
    client.user.setPresence({
        status: 'online',
        activities: [{
            name: 'الفواصل والرياكشنات ⭐',
            type: ActivityType.Custom
        }]
    });

    // تسجيل الأوامر
    await registerSlashCommands();
});

// ==========================================
// 📨 معالجة أوامر السلاش (Interactions)
// ==========================================
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    try {
        if (interaction.commandName === 'ping') {
            const ping = client.ws.ping;
            return interaction.reply({
                content: `🏓 **بونج!** سرعة الاتصال: \`${ping}ms\``,
                ephemeral: true
            });
        }

        if (interaction.commandName === 'test-separator') {
            await interaction.deferReply({ ephemeral: false });
            const payload = getSeparatorPayload();
            if (!payload) {
                return interaction.editReply('❌ لم يتم العثور على ملف أو رابط الفاصل! تأكد من وجود ملف `separator.gif` داخل مجلد البوت.');
            }
            await interaction.channel.send(payload);
            return interaction.editReply('✅ تم إرسال الفاصل بنجاح كمعاينة!');
        }

        if (interaction.commandName === 'stats') {
            const embed = new EmbedBuilder()
                .setColor(0x38bdf8)
                .setTitle('📊 إحصائيات بوت الفواصل والرياكشن')
                .addFields(
                    { name: '📩 الرسائل المعالجة', value: `${stats.messagesCount}`, inline: true },
                    { name: '✨ الرياكشنات المضافة', value: `${stats.reactionsCount}`, inline: true },
                    { name: '➖ الفواصل المرسلة', value: `${stats.separatorsCount}`, inline: true },
                    { name: '🏓 سرعة الاتصال (Ping)', value: `${client.ws.ping}ms`, inline: true },
                    { name: '⏱️ وقت التشغيل (Uptime)', value: `${Math.floor(process.uptime() / 60)} دقيقة`, inline: true },
                    { name: '⚠️ الأخطاء', value: `${stats.errorsCount}`, inline: true }
                )
                .setFooter({ text: 'Discord Separator Bot • يعمل 24/7' })
                .setTimestamp();

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
    } catch (err) {
        console.error('❌ خطأ في تنفيذ أمر السلاش:', err);
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: '⚠️ حدث خطأ أثناء تنفيذ الأمر.' }).catch(() => {});
        } else {
            await interaction.reply({ content: '⚠️ حدث خطأ أثناء تنفيذ الأمر.', ephemeral: true }).catch(() => {});
        }
    }
});

// ==========================================
// 💬 استقبال الرسائل وإضافة الرياكشن والفاصل
// ==========================================
client.on('messageCreate', async message => {
    // تجاهل رسائل البوتات لتجنب التكرار واللوب غير المنتهي
    if (config.ignoreBots && message.author.bot) return;

    // تجاهل الرسائل في الخاص
    if (!message.guild) return;

    const channelId = message.channelId;
    let emojisToReact = [];
    let isTargetChannel = false;
    let allowSeparator = false;

    // 1. فحص إذا كانت القناة هي روم التقييمات (1447978433178239211) -> يضع رياكشن + يرسل الفاصل
    if (channelId === config.reviewChannel || channelId === '1447978433178239211') {
        isTargetChannel = true;
        emojisToReact = config.reviewEmojis;
        allowSeparator = true; // ✅ الفاصل مسموح به هنا فقط
    }
    // 2. فحص إذا كانت القناة هي روم الإثباتات (1551213877717639181) -> يضع رياكشن فقط بدون فاصل
    else if (channelId === config.proofsChannel || channelId === '1551213877717639181') {
        isTargetChannel = true;
        emojisToReact = config.proofsEmojis;
        allowSeparator = false; // ❌ ممنوع الفاصل نهائياً في هذا الروم
    }
    // 3. فحص إذا كانت القناة ضمن الرومات الإضافية -> رياكشن فقط بدون فاصل
    else if (config.extraChannels.includes(channelId)) {
        isTargetChannel = true;
        emojisToReact = config.extraEmojis;
        allowSeparator = false;
    }

    if (!isTargetChannel) return;

    stats.messagesCount++;

    // إدارة الطابور (Queue) لضمان الترتيب وعدم تصادم العمليات المتزامنة
    const previousTask = channelQueues.get(channelId) || Promise.resolve();

    const currentTask = previousTask.then(async () => {
        // --- 1. إضافة الرياكشنات ---
        for (const rawEmoji of emojisToReact) {
            const formatted = extractEmoji(rawEmoji);
            if (!formatted) continue;

            try {
                await message.react(formatted);
                stats.reactionsCount++;
                // تأخير بسيط جداً (250ms) بين كل رياكشن لتفادي Rate-Limit
                await new Promise(r => setTimeout(r, 250));
            } catch (err) {
                stats.errorsCount++;
                console.error(`⚠️ تعذر وضع الرياكشن (${rawEmoji}) في القناة <#${channelId}>: ${err.message}`);
            }
        }

        // --- 2. إرسال الفاصل إذا كان مفعّلاً ومسموحاً في هذا الروم فقط (1447978433178239211) ---
        if (config.enableSeparator && allowSeparator && channelId !== '1551213877717639181') {
            let currentCount = (channelCounters.get(channelId) || 0) + 1;

            if (currentCount >= config.separatorInterval) {
                channelCounters.set(channelId, 0); // تصفير العداد

                const payload = getSeparatorPayload();
                if (payload) {
                    try {
                        await message.channel.send(payload);
                        stats.separatorsCount++;
                        console.log(`➖ [تم إرسال الفاصل] في روم #${message.channel.name} بعد رسالة من ${message.author.username}`);
                    } catch (err) {
                        stats.errorsCount++;
                        if (err.code === 50013) {
                            console.error(`❌ نقص صلاحيات: البوت لا يملك صلاحية إرسال رسائل أو مرفقات (Send Messages / Attach Files) في روم <#${channelId}>.`);
                        } else {
                            console.error(`❌ خطأ أثناء إرسال الفاصل في روم <#${channelId}>: ${err.message}`);
                        }
                    }
                } else {
                    console.warn('⚠️ لم يتم العثور على صورة الفاصل لإرسالها.');
                }
            } else {
                channelCounters.set(channelId, currentCount);
            }
        }
    }).catch(err => {
        stats.errorsCount++;
        console.error('❌ خطأ في معالجة رسالة القناة:', err);
    }).finally(() => {
        if (channelQueues.get(channelId) === currentTask) {
            channelQueues.delete(channelId);
        }
    });

    channelQueues.set(channelId, currentTask);
});

// ==========================================
// 🔑 تشغيل وتسجيل دخول البوت
// ==========================================
if (token && token !== 'توكنك') {
    client.login(token).catch(err => {
        stats.errorsCount++;
        if (err.message && err.message.includes('disallowed intents')) {
            console.error('❌ [خطأ الصلاحيات Intents]: تأكد من تفعيل Message Content Intent من Discord Developer Portal -> Bot');
        } else {
            console.error('❌ فشل تسجيل الدخول إلى ديسكورد:', err.message);
        }
    });
}
