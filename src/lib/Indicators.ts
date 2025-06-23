import DataManager from "./DataManager";
import type { Interval, KlineData } from "./types";
import { RSI, SMA, EMA, OBV, StochasticRSI } from 'technicalindicators';

export default class Indicators {

    getSMA(symbol: string, interval: string, period: number): number {
        const klines = DataManager.getInstance().getKlines(symbol, interval as Interval);
        if (!klines) {
            throw new Error(`Klines not found for ${symbol} with interval ${interval}`);
        }
        const closePrices = klines.getClosePrices();
        if (closePrices.length < period) {
            throw new Error(`Not enough data to calculate SMA for ${symbol} with interval ${interval}`);
        }
        const sum = closePrices.slice(-period).reduce((acc, price) => acc + price, 0);
        return sum / period;
    }

    getMin(symbol: string, interval: string, window: number): number | null {
        const klines = DataManager.getInstance().getKlines(symbol, interval as Interval);
        if (!klines) {
            throw new Error(`Klines not found for ${symbol} with interval ${interval}`);
        }
        const closePrices = klines.getClosePrices();
        if (closePrices.length < window) {
            return null; // Not enough data
        }
        const recent = closePrices.slice(-window);
        return Math.min(...recent);
    }

    getMax(symbol: string, interval: string, window: number): number | null {
        const klines = DataManager.getInstance().getKlines(symbol, interval as Interval);
        if (!klines) {
            throw new Error(`Klines not found for ${symbol} with interval ${interval}`);
        }
        const closePrices = klines.getClosePrices();
        if (closePrices.length < window) {
            return null; // Not enough data
        }
        const recent = closePrices.slice(-window);
        return Math.max(...recent);
    }


    findPeaksAndValleys(symbol: string, interval: Interval, window: number): { peaks: number[]; valleys: number[]; } {
        const peaks: number[] = [];
        const valleys: number[] = [];
        const halfWindow = Math.floor(window / 2);
        const klines = DataManager.getInstance().getKlines(symbol, interval as Interval);
        if (!klines) {
            throw new Error(`Klines not found for ${symbol} with interval ${interval}`);
        }
        const ohlcvData = klines.getKlines();

        for (let i = halfWindow; i < ohlcvData.length - halfWindow; i++) {
            const currentHigh = ohlcvData[i].high;
            const currentLow = ohlcvData[i].low;
            const windowHighs = ohlcvData.slice(i - halfWindow, i + halfWindow + 1).map(d => d.high);
            const windowLows = ohlcvData.slice(i - halfWindow, i + halfWindow + 1).map(d => d.low);

            if (currentHigh === Math.max(...windowHighs)) peaks.push(currentHigh);
            if (currentLow === Math.min(...windowLows)) valleys.push(currentLow);
        }

        return { peaks, valleys };
    }

    calculateMovingAverages(symbol: string, interval: Interval, shortWindow: number, longWindow: number): { smaShort: number[]; smaLong: number[]; } {

        const smaShort: number[] = [];
        const smaLong: number[] = [];
        const klines = DataManager.getInstance().getKlines(symbol, interval as Interval);
        if (!klines) {
            throw new Error(`Klines not found for ${symbol} with interval ${interval}`);
        }
        const closes = klines.getClosePrices();

        for (let i = 0; i < closes.length; i++) {
            if (i >= shortWindow - 1) {
                const window = closes.slice(i - shortWindow + 1, i + 1);
                smaShort.push(window.reduce((a, b) => a + b, 0) / shortWindow);
            } else {
                smaShort.push(Number.NaN);
            }

            if (i >= longWindow - 1) {
                const window = closes.slice(i - longWindow + 1, i + 1);
                smaLong.push(window.reduce((a, b) => a + b, 0) / longWindow);
            } else {
                smaLong.push(Number.NaN);
            }
        }

        return { smaShort, smaLong };
    }

    calculateLinearGradient(symbol: string, interval: Interval, window: number): { slope: number; intercept: number; } {
        const klines = DataManager.getInstance().getKlines(symbol, interval);
        if (!klines) {
            throw new Error(`Klines not found for ${symbol} with interval ${interval}`);
        }
        const closePrices = klines.getClosePrices();
        if (closePrices.length < window) {
            throw new Error(`Not enough data to calculate linear gradient for ${symbol} with interval ${interval}`);
        }

        const recentPrices = closePrices.slice(-window);
        const n = recentPrices.length;
        const x = Array.from({ length: n }, (_, i) => i); // Índices: 0, 1, 2, ..., n-1
        const y = recentPrices;

        // Calcular somas para regressão linear
        const sumX = x.reduce((a, b) => a + b, 0);
        const sumY = y.reduce((a, b) => a + b, 0);
        const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
        const sumXX = x.reduce((acc, xi) => acc + xi * xi, 0);

        // Calcular coeficiente angular (slope) e intercepto
        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        return { slope, intercept };
    }

    calculatePivotPoints(symbol: string, interval: Interval): { pivot: number; s1: number; r1: number; } {
        const klines = DataManager.getInstance().getKlines(symbol, interval as Interval);
        if (!klines) {
            throw new Error(`Klines not found for ${symbol} with interval ${interval}`);
        }
        const high = Math.max(...klines.getHighPrices());
        const low = Math.min(...klines.getLowPrices());
        const close = klines.getClosePrices().slice(-1)[0];
        const pivot = (high + low + close) / 3;
        const s1 = (2 * pivot) - high;
        const r1 = (2 * pivot) - low;

        return { pivot, s1, r1 };
    }

    identifyZonesWithVolume(symbol: string, interval: Interval, tolerance: number): { supports: number[]; resistances: number[]; } {
        const klines = DataManager.getInstance().getKlines(symbol, interval as Interval);
        const supports: number[] = [];
        const resistances: number[] = [];
        const priceLevels: { [key: number]: number; } = {};
        const ohlcvData: KlineData[] = klines.getKlines();
        if (!ohlcvData || (Array.isArray(ohlcvData) && ohlcvData.length === 0)) return { supports, resistances };

        // Agrupar preços por nível aproximado com base no close
        for (const data of Array.isArray(ohlcvData) ? ohlcvData : Object.values(ohlcvData)) {
            const ohlcv = data as KlineData;
            const roundedPrice = Math.round(ohlcv.close / tolerance) * tolerance;
            priceLevels[roundedPrice] = (priceLevels[roundedPrice] || 0) + ohlcv.volume;
        }

        // Ordenar níveis por volume e identificar os mais significativos
        const sortedLevels = Object.entries(priceLevels).sort((a, b) => b[1] - a[1]);
        const topLevels = sortedLevels.slice(0, 10); // Top 10 níveis com maior volume

        for (const [price] of topLevels) {
            const numericPrice = Number.parseFloat(price);
            if (ohlcvData.some(d => d.low <= numericPrice && d.high >= numericPrice)) {
                // Verifica se o nível foi testado como suporte ou resistência
                const tests = ohlcvData.filter(d => Math.abs(d.low - numericPrice) < tolerance || Math.abs(d.high - numericPrice) < tolerance);
                if (tests.some(t => t.close < numericPrice)) resistances.push(numericPrice);
                if (tests.some(t => t.close > numericPrice)) supports.push(numericPrice);
            }
        }

        return { supports, resistances };
    }

    /**
     * Calcula o indicador Supertrend para o ativo e intervalo informados.
     * @param symbol
     * @param interval
     * @param atrPeriod
     * @param multiplier
     * @returns { supertrend: number[], direction: ("bullish"|"bearish")[] }
     */
    public calculateSupertrend(symbol: string, interval: Interval, atrPeriod = 10, multiplier = 3): { supertrend: number[], direction: ("bullish" | "bearish")[]; } {
        const klines = DataManager.getInstance().getKlines(symbol, interval);
        if (!klines) throw new Error(`Klines not found for ${symbol} with interval ${interval}`);
        const ohlcv = klines.getKlines();
        if (ohlcv.length < atrPeriod + 1) throw new Error("Not enough data for Supertrend");

        // Calcular True Range (TR)
        const tr: number[] = [];
        for (let i = 1; i < ohlcv.length; i++) {
            const high = ohlcv[i].high;
            const low = ohlcv[i].low;
            const prevClose = ohlcv[i - 1].close;
            tr.push(Math.max(
                high - low,
                Math.abs(high - prevClose),
                Math.abs(low - prevClose)
            ));
        }
        // Calcular ATR (SMA)
        const atr: number[] = [];
        for (let i = 0; i < tr.length; i++) {
            if (i < atrPeriod - 1) {
                atr.push(NaN);
            } else if (i === atrPeriod - 1) {
                atr.push(tr.slice(0, atrPeriod).reduce((a, b) => a + b, 0) / atrPeriod);
            } else {
                atr.push((atr[i - 1] * (atrPeriod - 1) + tr[i]) / atrPeriod);
            }
        }
        // Calcular bandas usando o candle atual (NÃO o próximo!)
        const upperBand: number[] = [];
        const lowerBand: number[] = [];
        for (let i = 0; i < atr.length; i++) {
            const idx = i + 1; // tr e atr começam em 1
            if (!ohlcv[idx]) {
                upperBand.push(NaN);
                lowerBand.push(NaN);
                continue;
            }
            const hl2 = (ohlcv[idx].high + ohlcv[idx].low) / 2;
            upperBand.push(hl2 + multiplier * atr[i]);
            lowerBand.push(hl2 - multiplier * atr[i]);
        }
        // Calcular Supertrend
        const supertrend: number[] = [];
        const direction: ("bullish" | "bearish")[] = [];
        let prevSupertrend = 0;
        let prevDirection: "bullish" | "bearish" = "bullish";
        for (let i = 0; i < atr.length; i++) {
            const idx = i + 1;
            if (!ohlcv[idx]) {
                supertrend.push(NaN);
                direction.push(prevDirection);
                continue;
            }
            const close = ohlcv[idx].close;
            let currSupertrend = prevSupertrend;
            let currDirection: "bullish" | "bearish" = prevDirection;
            if (i === 0) {
                // Inicialização
                if (close > upperBand[i]) {
                    currSupertrend = lowerBand[i];
                    currDirection = "bullish";
                } else {
                    currSupertrend = upperBand[i];
                    currDirection = "bearish";
                }
            } else {
                if (close > upperBand[i - 1]) {
                    currSupertrend = lowerBand[i];
                    currDirection = "bullish";
                } else if (close < lowerBand[i - 1]) {
                    currSupertrend = upperBand[i];
                    currDirection = "bearish";
                } else {
                    currSupertrend = prevSupertrend;
                    currDirection = prevDirection;
                    if (currDirection === "bullish" && lowerBand[i] > currSupertrend) {
                        currSupertrend = lowerBand[i];
                    }
                    if (currDirection === "bearish" && upperBand[i] < currSupertrend) {
                        currSupertrend = upperBand[i];
                    }
                }
            }
            supertrend.push(currSupertrend);
            direction.push(currDirection);
            prevSupertrend = currSupertrend;
            prevDirection = currDirection;
        }
        return { supertrend, direction };
    }

    /**
     * Calcula o sinal Supertrend atual para o ativo e intervalo informados.
     * @returns "bullish" | "bearish"
     */
    public getSupertrendSignal(symbol: string, interval: Interval, atrPeriod = 10, multiplier = 3): "bullish" | "bearish" {
        const { direction } = this.calculateSupertrend(symbol, interval, atrPeriod, multiplier);
        // Retorna o último valor do vetor de direção
        return direction[direction.length - 1];
    }

    /**
     * Calcula o RSI (Relative Strength Index) usando a biblioteca technicalindicators.
     * @param symbol
     * @param interval
     * @param period
     * @returns vetor de valores RSI (último valor é o mais recente)
     */
    public calculateRSI(symbol: string, interval: Interval, period = 14): number[] {
        const klines = DataManager.getInstance().getKlines(symbol, interval);
        if (!klines) throw new Error(`Klines not found for ${symbol} with interval ${interval}`);
        const closes = klines.getClosePrices();
        if (closes.length < period + 1) throw new Error(`Not enough data for RSI ${period}  for ${symbol} with interval ${interval}`);
        return RSI.calculate({ period, values: closes });
    }

    /**
     * Calcula a SMA (Simple Moving Average) usando a biblioteca technicalindicators.
     */
    public calculateSMA(symbol: string, interval: Interval, period = 14): number[] {
        const klines = DataManager.getInstance().getKlines(symbol, interval);
        if (!klines) throw new Error(`Klines not found for ${symbol} with interval ${interval}`);
        const closes = klines.getClosePrices();
        if (closes.length < period) throw new Error("Not enough data for SMA");
        return SMA.calculate({ period, values: closes });
    }

    /**
     * Calcula a EMA (Exponential Moving Average) usando a biblioteca technicalindicators.
     */
    public calculateEMA(symbol: string, interval: Interval, period = 14): number[] {
        const klines = DataManager.getInstance().getKlines(symbol, interval);
        if (!klines) throw new Error(`Klines not found for ${symbol} with interval ${interval}`);
        const closes = klines.getClosePrices();
        if (closes.length < period) throw new Error("Not enough data for EMA");
        return EMA.calculate({ period, values: closes });
    }

    /**
     * Calcula o OBV (On Balance Volume) usando a biblioteca technicalindicators.
     */
    public calculateOBV(symbol: string, interval: Interval): number[] {
        const klines = DataManager.getInstance().getKlines(symbol, interval);
        if (!klines) throw new Error(`Klines not found for ${symbol} with interval ${interval}`);
        const closes = klines.getClosePrices();
        const volumes = klines.getVolumes();
        if (closes.length < 2) throw new Error("Not enough data for OBV");
        return OBV.calculate({ close: closes, volume: volumes });
    }

    /**
     * Calcula o Stochastic RSI usando a biblioteca technicalindicators.
     */
    public calculateStochRSI(symbol: string, interval: Interval, rsiPeriod = 14, stochasticPeriod = 14, kPeriod = 3, dPeriod = 3): { stochRSI: number[], k: number[], d: number[]; } {
        const klines = DataManager.getInstance().getKlines(symbol, interval);
        if (!klines) throw new Error(`Klines not found for ${symbol} with interval ${interval}`);
        const closes = klines.getClosePrices();
        if (closes.length < rsiPeriod + stochasticPeriod) throw new Error("Not enough data for StochRSI");
        const result = StochasticRSI.calculate({
            values: closes,
            rsiPeriod,
            stochasticPeriod,
            kPeriod,
            dPeriod
        });
        // O resultado é um array de objetos { stochRSI, k, d }
        return {
            stochRSI: result.map(r => r.stochRSI),
            k: result.map(r => r.k),
            d: result.map(r => r.d)
        };
    }

}