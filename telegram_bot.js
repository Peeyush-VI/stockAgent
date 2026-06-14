require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();

// Retrieve credentials from .env
const token = process.env.BOT_TOKEN;
const chatId = process.env.CHAT_ID;

if (!token || token === 'your_telegram_bot_token_here') {
  console.error('ERROR: Please set BOT_TOKEN in your .env file.');
  process.exit(1);
}

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(token, { polling: true });

console.log('Telegram bot is running...');

// Helper command to get Chat ID when you send a message to the bot
bot.onText(/\/start/, (msg) => {
  const currentChatId = msg.chat.id;
  bot.sendMessage(currentChatId, `Hello! Your Chat ID is: ${currentChatId}\n\nPlease copy this and put it in your .env file as CHAT_ID=${currentChatId}`);
  console.log(`Received /start from chat ID: ${currentChatId}`);
});

// Command to instantly test the morning message
bot.onText(/\/test/, (msg) => {
  const currentChatId = msg.chat.id;
  bot.sendMessage(currentChatId, "✅ TEST MESSAGE: Good morning! ☀️ Have a wonderful day ahead!");
  console.log(`Sent test message to chat ID: ${currentChatId}`);
});

// Helper to format dates in IST timezone
function formatISTDate(date) {
  if (!date) return 'N/A';
  return new Date(date).toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

// Function to fetch NIFTY data and send alert
async function fetchNiftyAndSend(targetChatId) {
  try {
    console.log('Fetching NIFTY 50 data...');
    const result = await yahooFinance.quote('^NSEI');
    
    // Fallback logic if market open data is missing
    const currentPrice = result.regularMarketPrice;
    const previousClose = result.regularMarketPreviousClose;
    const openPrice = result.regularMarketOpen || currentPrice;
    
    if (!openPrice || !previousClose) {
        throw new Error('Incomplete market data received from Yahoo Finance.');
    }

    // Determine the dates for today's open and previous close
    let todayDateStr = '';
    let prevCloseDateStr = '';
    
    try {
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      const chartData = await yahooFinance.chart('^NSEI', { period1: tenDaysAgo, interval: '1d' });
      if (chartData && chartData.quotes && chartData.quotes.length >= 2) {
        const quotes = chartData.quotes;
        const lastBar = quotes[quotes.length - 1];
        const prevBar = quotes[quotes.length - 2];
        
        const lastBarDate = new Date(lastBar.date);
        const quoteTime = result.regularMarketTime ? new Date(result.regularMarketTime) : new Date();
        
        // If the last bar in the chart represents today's date
        if (lastBarDate.toDateString() === quoteTime.toDateString()) {
          todayDateStr = formatISTDate(lastBar.date);
          prevCloseDateStr = formatISTDate(prevBar.date);
        } else {
          // If chart is not updated yet, lastBar is actually the previous close day
          todayDateStr = formatISTDate(quoteTime);
          prevCloseDateStr = formatISTDate(lastBar.date);
        }
      }
    } catch (chartError) {
      console.error('Error fetching chart for dates, falling back to heuristics:', chartError);
    }
    
    // Heuristic fallbacks if chart query failed
    if (!todayDateStr) {
      const quoteTime = result.regularMarketTime ? new Date(result.regularMarketTime) : new Date();
      todayDateStr = formatISTDate(quoteTime);
    }
    if (!prevCloseDateStr) {
      const quoteTime = result.regularMarketTime ? new Date(result.regularMarketTime) : new Date();
      const tempDate = new Date(quoteTime);
      const day = tempDate.getDay();
      if (day === 1) { // Monday
        tempDate.setDate(tempDate.getDate() - 3);
      } else if (day === 0) { // Sunday
        tempDate.setDate(tempDate.getDate() - 2);
      } else {
        tempDate.setDate(tempDate.getDate() - 1);
      }
      prevCloseDateStr = formatISTDate(tempDate);
    }

    const difference = openPrice - previousClose;
    const roundedDiff = Math.round(difference * 100) / 100;

    let message = '';
    
    if (difference > 100) {
      message = `📈 *NIFTY GAP UP!*\n\nNIFTY opened at **${openPrice}** (on ${todayDateStr}), which is a Gap Up of **+${roundedDiff} points** from the previous close of **${previousClose}** (on ${prevCloseDateStr}).`;
    } else if (difference < -100) {
      message = `📉 *NIFTY GAP DOWN!*\n\nNIFTY opened at **${openPrice}** (on ${todayDateStr}), which is a Gap Down of **${roundedDiff} points** from the previous close of **${previousClose}** (on ${prevCloseDateStr}).`;
    } else {
      message = `📊 *NIFTY OPENED FLAT*\n\nNIFTY opened at **${openPrice}** (on ${todayDateStr}). The difference from the previous close of **${previousClose}** (on ${prevCloseDateStr}) is **${roundedDiff > 0 ? '+' : ''}${roundedDiff} points** (No significant gap).`;
    }

    bot.sendMessage(targetChatId, message, { parse_mode: 'Markdown' }).then(() => {
        console.log('NIFTY alert sent successfully.');
    }).catch((error) => {
        console.error('Failed to send NIFTY alert:', error);
    });

  } catch (error) {
    console.error('Error fetching NIFTY data:', error);
    bot.sendMessage(targetChatId, `⚠️ Failed to fetch NIFTY data: ${error.message}`);
  }
}

// Command to manually test the NIFTY fetcher
bot.onText(/\/nifty/, (msg) => {
  const currentChatId = msg.chat.id;
  bot.sendMessage(currentChatId, "Fetching latest NIFTY 50 data...");
  fetchNiftyAndSend(currentChatId);
});

// If CHAT_ID is provided, set up the morning cron job
if (chatId && chatId !== 'your_chat_id_here') {
  console.log(`Cron job scheduled for Chat ID: ${chatId}`);
  
  // Schedule a task to run Monday-Friday at 9:17 AM.
  // The format is: 'minute hour day month dayOfWeek' (1-5 = Monday-Friday)
  cron.schedule('17 9 * * 1-5', () => {
    console.log('Running scheduled NIFTY alert...');
    fetchNiftyAndSend(chatId);
  });
} else {
  console.log('\n--- NOTICE ---');
  console.log('CHAT_ID is not set in the .env file yet.');
  console.log('Message your bot on Telegram with "/start" to get your Chat ID.');
  console.log('----------------\n');
}

// Dummy web server for Render's health checks
const http = require('http');
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.write('Bot is running!');
  res.end();
}).listen(PORT, () => {
  console.log(`Web server listening on port ${PORT}`);
});
