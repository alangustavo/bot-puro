import { readBinanceCsvCandles } from './lib/readBinanceCsvCandles';
import DataManager from './lib/DataManager';
import Klines from './lib/Klines';
import path from 'path';
import { downloadAndExtractBinanceKlines } from './lib/downloadBinanceKlines';
import Kline from './lib/Kline';
import Database from './lib/Database';
import { BotStochRSIShortLong, BotStochRSIShortLongConfig } from './lib/BotStochRSIShortLong';
import { formatAllDate } from './lib/utils';



// === CONFIGURAÇÕES DO BACKTEST ===
const symbol = 'SOLUSDT';
const interval = '1d';
const dayinterval = 60 * 24;
const chatId = 999999; // Qualquer número, não envia mensagens reais

// Defina o período desejado para download e backtest
const startYear = 2024;
const startMonth = 10; // Janeiro

const endYear = 2025;
const endMonth = 5; // Maio

// === INICIALIZAÇÃO DO BOT ===
const config = new BotStochRSIShortLongConfig(symbol, '1m', '1d');
const bot = new BotStochRSIShortLong(chatId, config);
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
                await downloadAndExtractBinanceKlines(symbol, "1m", year.toString(), month);
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
    const klinesLimit = 500;
    const dayKlines = new Klines(symbol, '1d', klinesLimit);
    const minuteKlines = new Klines(symbol, '1m', klinesLimit);
    DataManager.getInstance().setKlines(dayKlines);
    DataManager.getInstance().setKlines(minuteKlines);



    // 5. Simular avanço do tempo

    const minCandles = Math.max(config.stochRsiPeriod, config.emaLong, 30);
    let buySignals = 0;
    let sellSignals = 0;
    let operations = 0;

    // 
    let dayOpenTime = 0;
    let dayCloseTime = 0;
    let dayVolume = 0;
    let dayHigh = 0;
    let dayLow = 0;
    let dayOpenPrice = 0;
    let dayKline: Kline;


    // let longOpenTime = 0;
    // let longCloseTime = 0;
    // let longVolume = 0;
    // let longHigh = 0;
    // let longLow = 0;
    // let longOpenPrice = 0;
    // let longKline: Kline;

    for (let i = 0; i < candles.length; i++) {
        const actualTime = candles[i].closeTime;
        const candle = candles[i];


        const minuteKline = Kline.fromObject(candle);
        minuteKlines.addKline(minuteKline); // Adiciona o candle de 1 minuto
        // Clona o candle para evitar referência ao objeto original
        const dayCandle = { ...candle };


        if (i % dayinterval === 0) {
            dayCloseTime = dayCandle.openTime + (dayinterval); // Define o closeTime como openTime + 1 d
            dayOpenTime = dayCandle.openTime; // Mantém o openTime do primeiro dayCandle do intervalo
            dayVolume = 0;
            dayHigh = dayCandle.high;
            dayLow = dayCandle.low;
            dayOpenPrice = dayCandle.open; // Mantém o openPrice do primeiro dayCandle do intervalo

        }

        dayHigh = Math.max(dayHigh, dayCandle.high);
        dayLow = Math.min(dayLow, dayCandle.low);
        dayVolume += dayCandle.volume; // Soma o volume dos dayCandles do intervalo
        dayCandle.openTime = dayOpenTime;
        dayCandle.closeTime = dayCloseTime;
        dayCandle.open = dayOpenPrice; // Mantém o openPrice do primeiro dayCandle do intervalo
        dayCandle.high = dayHigh;
        dayCandle.low = dayLow;
        dayCandle.volume += dayVolume; // Soma os volumes dos dayCandles do intervalo
        dayKline = Kline.fromObject(dayCandle);
        dayKlines.addKline(dayKline);

        const d = DataManager.getInstance().getKlines(symbol, '1d').getLastKline();
        const m = DataManager.getInstance().getKlines(symbol, '1m').getLastKline();
        // console.log(`Minute.: ${formatAllDate(candle.openTime)} - ${candle.close} - ${formatAllDate(minuteKline.startTime)} - ${minuteKline.close} ${m?.startTime !== undefined ? formatAllDate(m.startTime) : 'Invalid date'}`);
        // console.log(`Day....: ${formatAllDate(dayCandle.openTime)} - ${dayCandle.close} - ${formatAllDate(dayKline.startTime)} - ${dayKline.close} ${d?.startTime !== undefined ? formatAllDate(d.startTime) : 'Invalid date'}`);



        //console.log(`${minuteKlines.getLastKline()}`);

        // console.log(`${formatAllDate(actualTime)} - ${minuteKline.high}/${dayKline.high} Processando dayCandle ${i + 1}/${dayCandles.length} - Timestamp: ${actualTime} `);
        // if (i % longMinutesInterval === 0) {
        //     longCloseTime = longCandle.openTime + (longMinutesInterval * 60 * 1000); // Define o closeTime como openTime + 1 hora
        //     longOpenTime = longCandle.openTime; // Mantém o openTime do primeiro longCandle do intervalo
        //     longVolume = 0;
        //     longLow = longCandle.low;
        //     longHigh = longCandle.high;
        //     longOpenPrice = longCandle.open; // Mantém o openPrice do primeiro longCandle do intervalo
        // }

        // longHigh = Math.max(longHigh, longCandle.high);
        // longLow = Math.min(longLow, longCandle.low);
        // longVolume += longCandle.volume; // Soma o volume dos candles do intervalo
        // longCandle.openTime = longOpenTime;
        // longCandle.closeTime = longCloseTime;
        // longCandle.high = longHigh;
        // longCandle.low = longLow;
        // longCandle.open = longOpenPrice; // Mantém o openPrice do primeiro longCandle do intervalo
        // longCandle.volume += longVolume; // Soma os volumes dos candles do intervalo
        // longKline = Kline.fromObject(longCandle);
        // klinesLong.addKline(longKline);


        // console.log(klines.getClosePrices().length, klinesLong.getClosePrices().length);
        // console.log(klines.getClosePrices().length);
        // if (klines.getClosePrices().length >= minCandles && klinesLong.getClosePrices().length >= minCandles) {
        if (dayKlines.getClosePrices().length >= minCandles) {
            const prevStatus = (bot as any).status;
            await (bot as any).analyzeMarket(actualTime);

            // Contabiliza operações
            if ((bot as any).status === 'BOUGHT' && prevStatus === 'SOLD') {
                buySignals++;
                operations++;

            }
            if ((bot as any).status === 'SOLD' && prevStatus === 'BOUGHT') {
                sellSignals++;
                const op = bot.getLastOperation();

            }

        } else {

        }
    }
    console.log('Backtest finalizado!');
    console.log(`Total de candles lidos: ${candles.length}`);
    console.log(`Total de operações: ${operations}`);
    console.log(`Total de BUY signals: ${buySignals}`);
    console.log(`Total de SELL signals: ${sellSignals}`);
    // bot.writeCsv();
})();


