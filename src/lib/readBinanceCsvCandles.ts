import fs from 'fs';
import path from 'path';

/**
 * Lê um arquivo CSV de candles da Binance e converte para um array de objetos candle.
 * @param csvFile Caminho do arquivo CSV extraído da Binance
 * @returns Array de candles no formato { openTime, open, high, low, close, volume, closeTime }
 */
export function readBinanceCsvCandles(csvFile: string) {
    const content = fs.readFileSync(csvFile, 'utf-8');
    const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
    return lines.map(line => {
        const [openTime, open, high, low, close, volume, closeTime] = line.split(',');
        return {
            openTime: Number(openTime),
            open: Number(open),
            high: Number(high),
            low: Number(low),
            close: Number(close),
            volume: Number(volume),
            closeTime: Number(closeTime)
        };
    });
}

// Exemplo de uso:
// const candles = readBinanceCsvCandles('historical_data/BTCUSDT-1m-2024-05-01.csv');
// console.log(candles[0]);
