import ChatManager from "./lib/ChatManager";
import DataManager from "./lib/DataManager";
import Klines from "./lib/Klines";
import Operation from "./lib/Operation";
import { Status } from "./lib/types";

// Definição do tipo para dados OHLCV
type OhlcvData = {
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
};

// Função para calcular a média móvel de volume
function calculateVolumeSma(ohlcvData: OhlcvData[], window: number): number[] {
    const volumes = ohlcvData.map(d => d.volume);
    const smaVolume: number[] = [];

    for (let i = 0; i < volumes.length; i++) {
        if (i >= window - 1) {
            const windowVolumes = volumes.slice(i - window + 1, i + 1);
            smaVolume.push(windowVolumes.reduce((a, b) => a + b, 0) / window);
        } else {
            smaVolume.push(NaN);
        }
    }

    return smaVolume;
}

// Função para identificar picos e valas
function findPeaksAndValleys(ohlcvData: OhlcvData[], window: number): { peaks: number[]; valleys: number[]; } {
    const peaks: number[] = [];
    const valleys: number[] = [];
    const halfWindow = Math.floor(window / 2);

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

// Função para calcular médias móveis
function calculateMovingAverages(ohlcvData: OhlcvData[], shortWindow: number, longWindow: number): { smaShort: number[]; smaLong: number[]; } {
    const closes = ohlcvData.map(d => d.close);
    const smaShort: number[] = [];
    const smaLong: number[] = [];

    for (let i = 0; i < closes.length; i++) {
        if (i >= shortWindow - 1) {
            const window = closes.slice(i - shortWindow + 1, i + 1);
            smaShort.push(window.reduce((a, b) => a + b, 0) / shortWindow);
        } else {
            smaShort.push(NaN);
        }

        if (i >= longWindow - 1) {
            const window = closes.slice(i - longWindow + 1, i + 1);
            smaLong.push(window.reduce((a, b) => a + b, 0) / longWindow);
        } else {
            smaLong.push(NaN);
        }
    }

    return { smaShort, smaLong };
}

// Função para calcular pontos de pivô
function calculatePivotPoints(ohlcvData: OhlcvData[]): { pivot: number; s1: number; r1: number; } {
    const high = Math.max(...ohlcvData.map(d => d.high));
    const low = Math.min(...ohlcvData.map(d => d.low));
    const close = ohlcvData[ohlcvData.length - 1].close;
    const pivot = (high + low + close) / 3;
    const s1 = (2 * pivot) - high;
    const r1 = (2 * pivot) - low;

    return { pivot, s1, r1 };
}

// Função para identificar zonas de suporte/resistência com volume
function identifyZonesWithVolume(ohlcvData: OhlcvData[], tolerance: number): { supports: number[]; resistances: number[]; } {
    const supports: number[] = [];
    const resistances: number[] = [];
    const priceLevels: { [key: number]: number; } = {};

    // Ajuste: tolerância dinâmica baseada em % do preço médio
    const avgPrice = ohlcvData.reduce((acc, d) => acc + d.close, 0) / ohlcvData.length;
    const dynamicTolerance = Math.max(tolerance, avgPrice * 0.002); // 0.2% do preço médio ou tolerance, o que for maior

    ohlcvData.forEach(data => {
        // Agrupamento por faixa dinâmica
        const roundedPrice = Math.round(data.close / dynamicTolerance) * dynamicTolerance;
        priceLevels[roundedPrice] = (priceLevels[roundedPrice] || 0) + data.volume;
    });

    const sortedLevels = Object.entries(priceLevels).sort((a, b) => b[1] - a[1]);
    const topLevels = sortedLevels.slice(0, 10);

    topLevels.forEach(([price]) => {
        const numericPrice = parseFloat(price);
        // Ajuste: tolerância de teste também dinâmica
        const tests = ohlcvData.filter(d => Math.abs(d.low - numericPrice) < dynamicTolerance || Math.abs(d.high - numericPrice) < dynamicTolerance);
        if (tests.length > 0) {
            if (tests.some(t => t.close < numericPrice)) resistances.push(numericPrice);
            if (tests.some(t => t.close > numericPrice)) supports.push(numericPrice);
        }
    });

    return { supports, resistances };
}

// Função para gerar sinal de compra/venda/espera com filtros
function generateTradingSignal(ohlcvData: OhlcvData[]): "buy" | "sell" | "hold" {
    const window = 10;
    const shortWindow = 20;
    const longWindow = 100;
    const tolerance = 0.5;
    const currentPrice = ohlcvData[ohlcvData.length - 1].close;
    const currentVolume = ohlcvData[ohlcvData.length - 1].volume;
    const smaVolume50 = calculateVolumeSma(ohlcvData, 50)[ohlcvData.length - 1] || 0;

    const { peaks, valleys } = findPeaksAndValleys(ohlcvData, window);
    const { smaShort, smaLong } = calculateMovingAverages(ohlcvData, shortWindow, longWindow);
    const lastSmaShort = smaShort[smaShort.length - 1];
    const lastSmaLong = smaLong[smaLong.length - 1];
    const prevSmaShort = smaShort[smaShort.length - 2] || NaN;
    const prevSmaLong = smaLong[smaLong.length - 2] || NaN;
    const { pivot, s1, r1 } = calculatePivotPoints(ohlcvData);
    const { supports, resistances } = identifyZonesWithVolume(ohlcvData, tolerance);
    console.log(`Current Price: ${currentPrice}, SMA Short: ${lastSmaShort}, SMA Long: ${lastSmaLong}`);
    console.log(`Pivot: ${pivot}, S1: ${s1}, R1: ${r1}`);
    console.log(`Supports: ${supports}, Resistances: ${resistances}`);
    console.log(`Peaks: ${peaks}, Valleys: ${valleys}`);
    // Verificar confirmação de tendência (3 candles)
    const trendConfirm = 3;
    const isUptrend = smaShort.slice(-trendConfirm).every((s, i) => i === 0 || s > smaLong[smaLong.length - trendConfirm + i]);
    const isDowntrend = smaShort.slice(-trendConfirm).every((s, i) => i === 0 || s < smaLong[smaLong.length - trendConfirm + i]);

    const goldenCross = !isNaN(prevSmaShort) && !isNaN(prevSmaLong) && lastSmaShort > lastSmaLong && prevSmaShort <= prevSmaLong;
    const deathCross = !isNaN(prevSmaShort) && !isNaN(prevSmaLong) && lastSmaShort < lastSmaLong && prevSmaShort >= prevSmaLong;
    const nearSupport = supports.some(s => Math.abs(currentPrice - s) / currentPrice < 0.01);
    const nearResistance = resistances.some(r => Math.abs(currentPrice - r) / currentPrice < 0.01);

    // Filtros de volume e tendência
    if (currentVolume <= smaVolume50) return "hold"; // Filtro de volume

    if (
        (goldenCross && isUptrend || currentPrice > pivot || nearSupport || Math.abs(currentPrice - s1) / currentPrice < 0.01) &&
        !deathCross
    ) {
        return "buy";
    } else if (
        (deathCross && isDowntrend || currentPrice < pivot || nearResistance || Math.abs(currentPrice - r1) / currentPrice < 0.01) &&
        !goldenCross
    ) {
        return "sell";
    } else {
        return "hold";
    }
}

// Função para simular o desempenho do robô
function simulateBot(ohlcvData: OhlcvData[]): { trades: any[], balance: number; } {
    let balance = 1000; // Saldo inicial em USDT
    const trades: any[] = [];
    let position: "long" | "short" | null = null;
    let entryPrice: number | null = null;
    let stopLoss: number | null = null;
    let takeProfit: number | null = null;

    for (let i = 100; i < ohlcvData.length; i++) { // Começa após 100 para as médias móveis
        const dataSlice = ohlcvData.slice(0, i + 1);
        const signal = generateTradingSignal(dataSlice);
        const currentPrice = ohlcvData[i].close;

        // Fechar posição se atingir stop-loss ou take-profit
        if (position === "long" && entryPrice !== null) {
            if (currentPrice <= stopLoss!) {
                const profit = ((currentPrice - entryPrice) / entryPrice) * balance;
                balance += profit;
                trades.push({ type: "close", price: currentPrice, profit, balance, timestamp: ohlcvData[i].timestamp, reason: "stop-loss" });
                position = null;
            } else if (currentPrice >= takeProfit!) {
                const profit = ((currentPrice - entryPrice) / entryPrice) * balance;
                balance += profit;
                trades.push({ type: "close", price: currentPrice, profit, balance, timestamp: ohlcvData[i].timestamp, reason: "take-profit" });
                position = null;
            }
        } else if (position === "short" && entryPrice !== null) {
            if (currentPrice >= stopLoss!) {
                const profit = ((entryPrice - currentPrice) / entryPrice) * balance;
                balance += profit;
                trades.push({ type: "close", price: currentPrice, profit, balance, timestamp: ohlcvData[i].timestamp, reason: "stop-loss" });
                position = null;
            } else if (currentPrice <= takeProfit!) {
                const profit = ((entryPrice - currentPrice) / entryPrice) * balance;
                balance += profit;
                trades.push({ type: "close", price: currentPrice, profit, balance, timestamp: ohlcvData[i].timestamp, reason: "take-profit" });
                position = null;
            }
        }

        // Abrir nova posição com base no sinal
        if (!position) {
            if (signal === "buy") {
                position = "long";
                entryPrice = currentPrice;
                stopLoss = currentPrice * 0.995; // 0.5% abaixo
                takeProfit = currentPrice * 1.015; // 1.5% acima
                trades.push({ type: "buy", price: currentPrice, balance, timestamp: ohlcvData[i].timestamp });
            } else if (signal === "sell") {
                position = "short";
                entryPrice = currentPrice;
                stopLoss = currentPrice * 1.005; // 0.5% acima
                takeProfit = currentPrice * 0.985; // 1.5% abaixo
                trades.push({ type: "sell", price: currentPrice, balance, timestamp: ohlcvData[i].timestamp });
            }
        }
    }

    return { trades, balance };
}

(async () => {

    const chatManager = await ChatManager.getInstance();
    chatManager.start();
    console.log('Bot started and running...');


    const dataManager = DataManager.getInstance();
    const klines = new Klines('SOLUSDT', '1m', 1000);
    await klines.fetchKlines();
    dataManager.setKlines(klines);
    let operation: Operation;
    let status: Status = "SOLD";


    // Parse dos dados CSV e simulação
    const ohlcvData = klines.getOhlcv().filter(d => d.timestamp && d.close); // csvData.filter(d => d.timestamp && d.close);
    const last1000Data = ohlcvData.slice(-1000);
    setInterval(() => {

        const signal = generateTradingSignal(last1000Data);
        console.log(`Sinal gerado: ${signal} | Status atual: ${status}`);
        if (status === "SOLD" && signal === "buy") {
            console.log(`Sinal de compra gerado: ${signal}`);
            operation = new Operation(
                Number(process.env.TELEGRAM_CHAT_ID),
                'SOLUSDT',
                last1000Data[last1000Data.length - 1].close,
                Date.now(),
                'SINAL DE COMPRA'
            );
            status = "BOUGHT";
        } else if (status === "BOUGHT" && signal === "sell") {
            console.log(`Sinal de venda gerado: ${signal}`);
            if (operation) {
                operation.sell(last1000Data[last1000Data.length - 1].close, Date.now(), 'SINAL DE VENDA');
                const msg = operation.toString();
                chatManager.sendMessage(Number(process.env.TELEGRAM_CHAT_ID), msg);
                status = "SOLD";
                operation.save();
            }
        }

    }, 10000);
})().catch(console.error);