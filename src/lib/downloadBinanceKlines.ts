import fs from 'fs';
import path from 'path';
import https from 'https';
import unzipper from 'unzipper';

/**
 * Baixa e extrai arquivos de candles históricos da Binance.
 * @param symbol Ex: 'BTCUSDT'
 * @param interval Ex: '1m', '5m', '1h'
 * @param year Ex: '2024'
 * @param month Ex: '05'
 * @param day Ex: '01' (opcional)
 */
export async function downloadAndExtractBinanceKlines(symbol: string, interval: string, year: string, month: string, day?: string) {
    const baseUrl = 'https://data.binance.vision/data/spot/monthly/klines';
    const fileName = day
        ? `${symbol}-${interval}-${year}-${month}-${day}.zip`
        : `${symbol}-${interval}-${year}-${month}.zip`;
    const url = `${baseUrl}/${symbol}/${interval}/${fileName}`;
    const historicalDir = path.resolve(__dirname, '../../historical_data');
    if (!fs.existsSync(historicalDir)) fs.mkdirSync(historicalDir);
    const zipPath = path.join(historicalDir, fileName);

    // Remove arquivo zip corrompido se já existir
    if (fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
    }

    console.log('Baixando:', url);
    await new Promise<void>((resolve, reject) => {
        const file = fs.createWriteStream(zipPath);
        https.get(url, response => {
            if (response.statusCode !== 200) {
                file.close();
                fs.unlinkSync(zipPath); // Remove arquivo incompleto
                reject(new Error(`Erro ao baixar: ${url} (status ${response.statusCode})`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', err => {
            file.close();
            fs.unlinkSync(zipPath); // Remove arquivo incompleto
            reject(err);
        });
    });
    // Extrair
    console.log('Extraindo:', zipPath);
    await fs.createReadStream(zipPath)
        .pipe(unzipper.Extract({ path: historicalDir }))
        .promise();
    console.log('Extraído para:', historicalDir);
}

// Exemplo de uso:
// (async () => {
//   await downloadAndExtractBinanceKlines('BTCUSDT', '1m', '2024', '05', '01');
// })();
