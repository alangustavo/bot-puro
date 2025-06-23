
import dotenv from 'dotenv';
import Database from "./lib/Database";
import { BotRSIEMA2, BotRSIMA2Config } from './lib/BotRSIEMA2';
dotenv.config();

console.log('Starting bot...');
console.log(`URL: ${process.env.BINANCE_STREAM_URL}`);
(async () => {
    await Database.getInstance();
    const config = new BotRSIMA2Config(
        'SOLUSDT',
        '1h', 7, 9, 11, 0.98, 0.005, 0.99 // Configuração do BotRSIEMA2
    );
    const bot = new BotRSIEMA2(Number(process.env.TELEGRAM_CHAT_ID), config);
    await bot.start();


    // const chatManager = await ChatManager.getInstance();
    // chatManager.start();
    // console.log('Bot started and running...');


    // const dataManager = DataManager.getInstance();
    // const klines = new Klines('SOLUSDT', '1m', 1000);
    // await klines.fetchKlines();
    // dataManager.setKlines(klines);

    // const op = new Operation(Number(process.env.TELEGRAM_CHAT_ID), 'SOLUSDT', 170, Date.now(), 'TESTE DE COMPRA');
    // await op.save();
    // await new Promise(resolve => setTimeout(resolve, 10000));
    // op.sell(180, Date.now(), 'TESTE DE VENDA');

    // const botConfig = new TradingBotConfig("SOLUSDT", "1m");


    // const bot3 = new TradingBot(
    //     Number(process.env.TELEGRAM_CHAT_ID),
    //     botConfig);

    /**
     *         chatId: number,
             symbol: string,
             interval: Interval,
             shortSMA: number,
             longSMA: number,
             stopLossPercent = 0.98,
             trailingStopLossPercent = 0.995,
             trailingStopLossActivePercent = 1.007,
             distanceResistance = 0.99,
             distanceSupport = 1.005,
             window = 50
     */

    // const bot2 = new BotSMASupportResistance(
    //     Number(process.env.TELEGRAM_CHAT_ID),
    //     'SOLUSDT',
    //     '1m',
    //     15,
    //     50,
    //     0.98,
    //     0.995,
    //     1.007,
    //     1.01,
    //     0.995,
    //     300
    // );

    // const bot = new BotSupportResistance(
    //     Number(process.env.TELEGRAM_CHAT_ID),
    //     'SOLUSDT',
    //     '1m',
    //     1000,
    //     0.98,
    //     0.995,
    //     1.007,

    // );
    // bot2.start();
    // bot.start();
    // const stopLossPercent = 0.98;
    // const trailingStopLossPercent = 0.995;
    // const trailingStopLossActivePercent = 1.007;


    // let status: Status = "SOLD";
    // let lastCross = true;
    // let buyPrice = 0;
    // let buyTime = 0;
    // let sellPrice = 0;
    // let sellTime = 0;
    // let stopLossPrice = 0;
    // let trailingStopLossActive = false;
    // let lastPrice = 0;
    // let sellCriteria = 'NONE';
    // let trailingStopLossPrice = 0;

    // setInterval(() => {
    //     lastPrice = klines.getClosePrices()[klines.getSize() - 1];
    //     const m015 = indicators.getSMA('SOLUSDT', '1m', 15);
    //     const m050 = indicators.getSMA('SOLUSDT', '1m', 50);
    //     // const m1000 = indicators.getSMA('SOLUSDT', '1m', 1000);
    //     if (status === "SOLD" && sellCriteria !== 'STOP LOSS') {
    //         if (m015 > m050 && !lastCross) {
    //             console.log('BUY');
    //             buyPrice = lastPrice;
    //             stopLossPrice = buyPrice * stopLossPercent;
    //             status = "BOUGHT";
    //             buyTime = Date.now();
    //         }

    //     } else if (status === "SOLD" && sellCriteria === 'STOP LOSS') {
    //         // Aqui o STOP LOSS foi atingido. É melhor esperar 10 minutos ou que o preço baixe mais um pouco.
    //         if (lastPrice < sellPrice * 0.99 || sellTime + 600000 < Date.now()) {
    //             sellCriteria = 'NONE';
    //         }
    //     }

    //     else {
    //         lastPrice = klines.getClosePrices()[klines.getSize() - 1];
    //         if (lastPrice / buyPrice > trailingStopLossActivePercent) {
    //             trailingStopLossActive = true;
    //             trailingStopLossPrice = lastPrice * trailingStopLossPercent;
    //         }

    //         if (trailingStopLossActive) {
    //             if (lastPrice < trailingStopLossPrice) {
    //                 console.log('TRAILING STOP LOSS');
    //                 sellPrice = lastPrice;
    //                 sellCriteria = 'TRAILING STOP LOSS';
    //                 sellTime = Date.now();
    //                 status = "SOLD";
    //                 trailingStopLossActive = false;
    //                 trailingStopLossPrice = 0;
    //             } else {
    //                 trailingStopLossPrice = Math.max(trailingStopLossPrice, lastPrice * trailingStopLossPercent);
    //             }
    //         }


    //         if (lastPrice < stopLossPrice) {
    //             console.log('STOP LOSS');
    //             sellPrice = lastPrice;
    //             sellCriteria = 'STOP LOSS';
    //             sellTime = Date.now();
    //             status = "SOLD";
    //             trailingStopLossActive = false;
    //             trailingStopLossPrice = 0;
    //         } else {
    //             if (m015 < m050 && lastPrice / buyPrice > 1.005) {
    //                 console.log('SELL');
    //                 sellPrice = lastPrice;
    //                 sellCriteria = 'SMA CROSS';
    //                 sellTime = Date.now();
    //                 trailingStopLossActive = false;
    //                 trailingStopLossPrice = 0;
    //                 status = "SOLD";

    //             }
    //         }
    //     };

    //     lastCross = m015 > m050;
    //     if (status === "BOUGHT") {

    //         console.log(`BUY: ${buyPrice} (${new Date(buyTime).toLocaleString()})`);
    //         console.log(`STOP LOSS: ${stopLossPrice}`);
    //         if (trailingStopLossActive) {
    //             console.log(`TRAILING STOP LOSS: ${trailingStopLossPrice}`);
    //         }
    //         console.log(`LAST PRICE: ${lastPrice}`);
    //         console.log(`P/L: ${((lastPrice - buyPrice) / buyPrice * 100).toFixed(2)}%`);
    //     }
    //     // console.log(`Klines size: ${klines.getSize()}`);
    //     // console.log(`Klines: ${JSON.stringify(klines.getClosePrices())}`);
    // }, 10000);
})();