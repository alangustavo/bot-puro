import BinanceStreamManager from "./lib/binanceStreamManager";
import ChatManager from "./lib/chatManager";
import dotenv from 'dotenv';
dotenv.config();



console.log('Starting bot...');
console.log(`URL: ${process.env.BINANCE_STREAM_URL}`);
(async () => {
    const ws = BinanceStreamManager.getInstance();
    ws.subscribe('solusdt@kline_1m');
    const chatManager = await ChatManager.getInstance();
    chatManager.start();
    console.log('Bot started and running...');
})();