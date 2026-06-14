require('dotenv').config({ override: true });

// Clean token to match constructor fix
if (process.env.TELEGRAM_BOT_TOKEN) {
  process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN.replace(/^["']|["']$/g, '').trim();
}

const axios = require('axios');

// Mock axios.post to intercept Telegram outbound messages
axios.post = async (url, data) => {
    console.log('\n======================================');
    console.log('📤 MOCKED TELEGRAM OUTBOX:');
    console.log('URL:', url);
    console.log('Chat ID:', data.chat_id);
    console.log('Message Body:\n', data.text);
    console.log('Reply Markup:', data.reply_markup ? JSON.stringify(data.reply_markup) : 'None');
    console.log('======================================\n');
    return { data: { ok: true } };
};

const telegramService = require('./src/services/telegramService');

async function runTests() {
    const mockChatId = '123456789';

    console.log('Testing /start...');
    await telegramService.handleMessage({ chat: { id: mockChatId }, text: '/start' });

    console.log('Testing /help...');
    await telegramService.handleMessage({ chat: { id: mockChatId }, text: '/help' });

    console.log('Testing Smart AI query (Hindi): "Ramesh ka balance"...');
    await telegramService.handleMessage({ chat: { id: mockChatId }, text: 'Ramesh ka balance' });

    console.log('Testing Smart AI query (English): "aaj ki sale"...');
    await telegramService.handleMessage({ chat: { id: mockChatId }, text: 'aaj ki sale' });

    console.log('Testing Smart AI query: "profit dikhao"...');
    await telegramService.handleMessage({ chat: { id: mockChatId }, text: 'profit dikhao' });
    
    console.log('Done testing!');
    process.exit(0);
}

runTests().catch(err => {
    console.error('Test error:', err);
    process.exit(1);
});
