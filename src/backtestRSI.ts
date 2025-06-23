import { readBinanceCsvCandles } from './lib/readBinanceCsvCandles';
import { BotRSI, BotRSIConfig } from './lib/BotRSI';
import DataManager from './lib/DataManager';
import BacktestKlines from './lib/BacktestKlines';
import path from 'path';
import { downloadAndExtractBinanceKlines } from './lib/downloadBinanceKlines';
import Kline from './lib/Kline';
import Database from './lib/Database';


// === CONFIGURAÇÕES DO BACKTEST ===
const symbol = 'SOLUSDT';
const interval = '1h';
const shortMinutesInterval = 60; // Intervalo de 1 hora
const longInterval = '1d';
const longMinutesInterval = 60 * 24;
const chatId = 999999; // Qualquer número, não envia mensagens reais

// Defina o período desejado para download e backtest
const startYear = 2024;
const startMonth = 10; // Janeiro

const endYear = 2025;
const endMonth = 5; // Maio

// === INICIALIZAÇÃO DO BOT ===
const config = new BotRSIConfig(symbol, interval, longInterval);
const bot = new BotRSI(chatId, config);
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

    // 2. Ler todos os candles históricos dos arquivos baixados
    let candles: any[] = [];
    for (const file of csvFiles) {
        candles = candles.concat(readBinanceCsvCandles(file));
    }
    console.log(`Total de candles lidos: ${candles.length}`);

    // 3. Preparar Klines e DataManager para 1m e 15m
    const klinesLimit = 1000;
    const klines = new BacktestKlines(symbol, interval, klinesLimit);
    const klinesLong = new BacktestKlines(symbol, longInterval, klinesLimit);
    DataManager.getInstance().setKlines(klines);
    DataManager.getInstance().setKlines(klinesLong);



    // 5. Simular avanço do tempo

    const minCandles = Math.max(config.rsiLongInterval, config.rsiShortInterval, 10);
    let buySignals = 0;
    let sellSignals = 0;
    let operations = 0;

    // 
    let shortOpenTime = 0;
    let shortCloseTime = 0;
    let shortVolume = 0;
    let shortHigh = 0;
    let shortLow = 0;
    let shortOpenPrice = 0;
    let shortKline: Kline;


    let longOpenTime = 0;
    let longCloseTime = 0;
    let longVolume = 0;
    let longHigh = 0;
    let longLow = 0;
    let longOpenPrice = 0;
    let longKline: Kline;

    for (let i = 0; i < candles.length; i++) {
        const candle = candles[i];
        const longCandle = candles[i];

        if (i % shortMinutesInterval === 0) {
            shortCloseTime = candle.openTime + (shortMinutesInterval * 60 * 1000); // Define o closeTime como openTime + 1 hora
            shortOpenTime = candle.openTime; // Mantém o openTime do primeiro candle do intervalo
            shortVolume = 0;
            shortHigh = candle.high;
            shortLow = candle.low;
            shortOpenPrice = candle.open; // Mantém o openPrice do primeiro candle do intervalo

        }

        shortHigh = Math.max(shortHigh, candle.high);
        shortLow = Math.min(shortLow, candle.low);
        shortVolume += candle.volume; // Soma o volume dos candles do intervalo
        candle.openTime = shortOpenTime;
        candle.closeTime = shortCloseTime;
        candle.open = shortOpenPrice; // Mantém o openPrice do primeiro candle do intervalo
        candle.high = shortHigh;
        candle.low = shortLow;
        candle.volume += shortVolume; // Soma os volumes dos candles do intervalo
        shortKline = Kline.fromObject(candle);
        klines.addKline(shortKline);

        if (i % longMinutesInterval === 0) {
            longCloseTime = longCandle.openTime + (longMinutesInterval * 60 * 1000); // Define o closeTime como openTime + 1 hora
            longOpenTime = longCandle.openTime; // Mantém o openTime do primeiro longCandle do intervalo
            longVolume = 0;
            longLow = longCandle.low;
            longHigh = longCandle.high;
            longOpenPrice = longCandle.open; // Mantém o openPrice do primeiro longCandle do intervalo
        }

        longHigh = Math.max(longHigh, longCandle.high);
        longLow = Math.min(longLow, longCandle.low);
        longVolume += longCandle.volume; // Soma o volume dos candles do intervalo
        longCandle.openTime = longOpenTime;
        longCandle.closeTime = longCloseTime;
        longCandle.high = longHigh;
        longCandle.low = longLow;
        longCandle.open = longOpenPrice; // Mantém o openPrice do primeiro longCandle do intervalo
        longCandle.volume += longVolume; // Soma os volumes dos candles do intervalo
        longKline = Kline.fromObject(longCandle);
        klinesLong.addKline(longKline);


        // console.log(klines.getClosePrices().length, klinesLong.getClosePrices().length);

        if (klines.getClosePrices().length >= minCandles && klinesLong.getClosePrices().length >= minCandles) {
            const prevStatus = (bot as any).status;
            await (bot as any).analyzeMarket();

            // Contabiliza operações
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
