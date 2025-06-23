import { readBinanceCsvCandles } from './lib/readBinanceCsvCandles';
import { BotRSIEMA2, BotRSIMA2Config } from './lib/BotRSIEMA2';
import DataManager from './lib/DataManager';
import BacktestKlines from './lib/BacktestKlines';
import path from 'path';
import { downloadAndExtractBinanceKlines } from './lib/downloadBinanceKlines';
import Kline from './lib/Kline';
import Database from './lib/Database';
import { createKlineEventFrom1mBuffer } from './lib/EventFactory';


// === CONFIGURAÇÕES DO BACKTEST ===
const symbol = 'SOLUSDT';
const interval = '1h';
const minutes = 60; // Intervalo de 1 hora
const chatId = 999999; // Qualquer número, não envia mensagens reais

// Defina o período desejado para download e backtest
const startYear = 2024;
const startMonth = 10; // Janeiro

const endYear = 2025;
const endMonth = 5; // Maio


// === INICIALIZAÇÃO DO BOT ===
const config = new BotRSIMA2Config(symbol, interval, 7, 9, 11, 0.01, 0.005);
const bot = new BotRSIEMA2(chatId, config);
bot.backTest = true; // Habilita modo backtest

// Função utilitária para gerar meses no formato {year, month}
function* monthRange(y1: number, m1: number, y2: number, m2: number) {
    let year = y1;
    let month = m1;
    while (year < y2 || (year === y2 && month <= m2)) {
        console.log(`Gerando mês: ${year}-${month.toString().padStart(2, '0')}`);
        yield {
            year,
            month: month.toString().padStart(2, '0')
        };
        month++;
        if (month > 12) {
            month = 1;
            year++;
        }
    }
}

// 1. Baixar e extrair todos os arquivos mensais necessários antes do backtest
(async () => {
    await Database.getInstance();
    const csvFiles: string[] = [];
    for (const { year, month } of monthRange(startYear, startMonth, endYear, endMonth)) {
        const fileName = `${symbol}-1m-${year}-${month}.csv`;
        const zipName = `${symbol}-1m-${year}-${month}.zip`;
        const csvPath = path.resolve(__dirname, `../historical_data/${fileName}`);
        const zipPath = path.resolve(__dirname, `../historical_data/${zipName}`);
        // Se o CSV não existe, tenta baixar e extrair
        if (!require('fs').existsSync(csvPath)) {
            if (!require('fs').existsSync(zipPath)) {
                await downloadAndExtractBinanceKlines(symbol, interval, year.toString(), month);
            } else {
                // Se o zip existe mas o csv não, extrai novamente
                await require('fs').createReadStream(zipPath)
                    .pipe(require('unzipper').Extract({ path: path.dirname(zipPath) }))
                    .promise();
            }
        }
        if (require('fs').existsSync(csvPath)) {
            csvFiles.push(csvPath);
        }
    }

    // 2. Ler todos os candles históricos dos arquivos baixados. Candles são de 1m
    let candles: any[] = [];
    for (const file of csvFiles) {
        candles = candles.concat(readBinanceCsvCandles(file));
    }
    console.log(`Total de candles lidos: ${candles.length}`);

    const klinesLimit = 1000;
    const klines1h = new BacktestKlines(symbol, interval, klinesLimit);
    DataManager.getInstance().setKlines(klines1h);


    // 5. Simular avanço do tempo

    const minCandles = Math.max(config.rsiPeriod, config.slowEMA, 100);
    let buySignals = 0;
    let sellSignals = 0;
    let operations = 0;
    let lastStatus = (bot as any).status;
    let openTime = 0;
    let closeTime = 0;
    let volume = 0;
    let high = 0;
    let low = 0;

    for (let i = 0; i < candles.length; i++) {
        let kline: Kline | undefined;
        const candle = candles[i];
        if (i % minutes === 0) {
            closeTime = candle.openTime + (minutes * 60 * 1000); // Define o closeTime como openTime + 1 hora
            openTime = candle.openTime; // Mantém o openTime do primeiro candle do intervalo
            volume = 0;
        }
        high = Math.max(high, candle.high);
        low = Math.min(low, candle.low);
        volume += candle.volume; // Soma o volume dos candles do intervalo
        candle.openTime = openTime;
        candle.closeTime = closeTime;
        candle.high = high;
        candle.low = low;
        candle.volume = volume; // Soma os volumes dos candles do intervalo
        kline = Kline.fromObject(candle);
        klines1h.addKline(kline);

        // console.log(`${i} - ${klines1h.getClosePrices().length}`);


        if (klines1h.getClosePrices().length >= minCandles) {
            const prevStatus = (bot as any).status;
            await (bot as any).analyzeMarket();
            if ((bot as any).status === 'BOUGHT' && prevStatus === 'SOLD') {
                buySignals++;
                operations++;
            }
            if ((bot as any).status === 'SOLD' && prevStatus === 'BOUGHT') {
                sellSignals++;
                const op = bot.getLastOperation();
            }
        }
    }
    console.log('Backtest finalizado!');
    console.log(`Total de candles lidos: ${candles.length}`);
    console.log(`Total de operações: ${operations}`);
    console.log(`Total de BUY signals: ${buySignals}`);
    console.log(`Total de SELL signals: ${sellSignals}`);
})();
