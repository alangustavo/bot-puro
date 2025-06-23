import { ema } from "technicalindicators";
import DataManager from "./lib/DataManager";
import Indicators from "./lib/Indicators";
import { formatAllDate } from "./lib/utils";

const symbol = 'SOLUSDT';
const interval = '1d'; // ou '15m', '1h', etc.
const rsiPeriod = 14;
const fastEma = 9;
const slowEma = 21;
const indicators = new Indicators();



(async () => {
    console.log('Starting RSI + EMA Bot...');
    const klines = DataManager.getInstance().getKlines(symbol, interval, 500);
    console.log(`Fetching klines for ${symbol} at interval ${interval}...`);
    await klines.fetchKlines();
    setInterval(async () => {
        if (!klines || klines.getSize() === 0) return;
        const closes = klines.getClosePrices();
        const times = klines.getStartTimes();
        const rsiIndicator = indicators.calculateRSI(symbol, interval, rsiPeriod);
        const emaFastIndicator = indicators.calculateEMA(symbol, interval, fastEma);
        const emaSlowIndicator = indicators.calculateEMA(symbol, interval, slowEma);
        const obvIndicator = indicators.calculateOBV(symbol, interval);
        const stochRSIIndicator = indicators.calculateStochRSI(symbol, interval);
        const rsi = rsiIndicator[rsiIndicator.length - 1];
        const emaFast = emaFastIndicator[emaFastIndicator.length - 1];
        const emaSlow = emaSlowIndicator[emaSlowIndicator.length - 1];
        const obv = obvIndicator[obvIndicator.length - 1];
        const stochRSI = stochRSIIndicator.stochRSI[stochRSIIndicator.stochRSI.length - 1];
        const K = stochRSIIndicator.k[stochRSIIndicator.k.length - 1];
        const D = stochRSIIndicator.d[stochRSIIndicator.d.length - 1];

        if (rsiIndicator.length > 0 && emaFastIndicator.length > 0 && emaSlowIndicator.length > 0) {
            const idx = closes.length - 1;
            console.log(
                `[${formatAllDate(times[idx])}] ${symbol}-${interval} \nClose: ${closes[idx].toFixed(4)}\nRSI${rsiPeriod}: ${rsi.toFixed(4)}\nEMA${fastEma}: ${emaFast.toFixed(4)}\nEMA${slowEma}: ${emaSlow.toFixed(4)}\nOBV: ${obv.toFixed(2)}\nStochRSI K:${K.toFixed(2)} D:${D.toFixed(2)} ${stochRSI.toFixed(2)} \n`
            );
        }
    }, 10000); // a cada 10 segundos
})();