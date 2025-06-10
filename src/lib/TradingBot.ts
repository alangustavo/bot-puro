import { Bot, BotConfig } from "./Bot";
import DataManager from "./DataManager";
import Indicators from "./Indicators";
import { Interval, Signal, Status } from "./types";
import Operation from "./Operation";
import ChatManager from "./ChatManager";


class TradingBotConfig extends BotConfig {
    public symbol: string;
    public interval: Interval;
    public tolerance: number; // 0.1%
    public stopLossPercent: number; // 0.3%
    public takeProfitPercent: number; // 0.4%


    constructor(symbol: string, interval: Interval, tolerance: number = 0.001, stopLossPercent: number = 0.003, takeProfitPercent: number = 0.004) {
        super();
        this.symbol = symbol;
        this.interval = interval;
        this.tolerance = tolerance;
        this.stopLossPercent = stopLossPercent;
        this.takeProfitPercent = takeProfitPercent;
    }


    public toString(): string {
        return `
        CONFIGURATION:
        SYMBOL.......: ${this.symbol}
        INTERVAL.....: ${this.interval}
        TOLERANCE....: ${this.tolerance * 100}%
        STOP LOSS....: ${this.stopLossPercent * 100}%
        TAKE PROFIT..: ${this.takeProfitPercent * 100}%
        `;
    }
}

class TradingBot extends Bot {
    status: Status = "SOLD";
    botConfig: TradingBotConfig;
    indicators: Indicators;
    tolerance: number = 0.001; // 0.1%
    stopLossPercent: number = 0.003; // 0.3%
    takeProfitPercent: number = 0.004; // 0.4%
    operation: Operation | null = null;
    stopLoss: number | null = null;
    takeProfit: number | null = null;
    result: number = 1; // 1% initial result
    chatManager: ChatManager | undefined;
    currentPrice: number = 0;

    /**
     * 
     * @param chatId 
     * @param botConfig 
     */
    constructor(chatId: number, botConfig: TradingBotConfig) {
        super(chatId);
        this.botConfig = botConfig;
        this.indicators = new Indicators();
    }

    protected getBotName(): string {
        return `TradingBot-${this.botConfig.symbol}-${this.botConfig.interval}`;
    }

    protected getBotConfig(): string {
        return this.botConfig ? this.botConfig.toString() : '';
    }

    checkBuySignal(): { entryPrice: number, stopLoss: number, takeProfit: number; } | null {
        const klines = DataManager.getInstance().getKlines(this.botConfig.symbol, this.botConfig.interval);
        this.currentPrice = klines.getClosePrices().slice(-1)[0];
        const currentVolume = klines.getOhlcv().slice(-1)[0].volume;
        const avgVolume = klines.getOhlcv().slice(-10).reduce((sum, k) => sum + k.volume, 0) / 10;

        const { supports } = this.indicators.identifyZonesWithVolume(this.botConfig.symbol, this.botConfig.interval, 0.1);
        const { valleys } = this.indicators.findPeaksAndValleys(this.botConfig.symbol, this.botConfig.interval, 5);
        const { smaShort, smaLong } = this.indicators.calculateMovingAverages(this.botConfig.symbol, this.botConfig.interval, 10, 20);
        const { slope } = this.indicators.calculateLinearGradient(this.botConfig.symbol, this.botConfig.interval, 10);

        const tolerance = 0.015; // 1.5% para suportes, mais flexível
        const valleyTolerance = 0.001; // 0.1% para vales, como original

        // Calcular volatilidade
        const prices = klines.getClosePrices().slice(-10);
        const mean = prices.reduce((sum, p) => sum + p, 0) / prices.length;
        const stdDev = Math.sqrt(prices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / prices.length);
        const volatility = stdDev / mean;

        // Condições do sinal de compra
        const nearSupport = supports.some(s => Math.abs(this.currentPrice - s) / s <= tolerance);
        const nearValley = valleys.slice(-3).some(v => Math.abs(this.currentPrice - v) / v <= valleyTolerance);
        const smaBullish = smaShort.slice(-1)[0] > smaLong.slice(-1)[0] || slope > 0.01;
        const highVolume = currentVolume > avgVolume;

        // Logs detalhados
        console.log(`=== Análise de Sinal de Compra para ${this.botConfig.symbol} às ${new Date().toLocaleTimeString('en-US', { timeZone: 'America/Sao_Paulo' })} ===`);
        console.log(`Preço Atual: ${this.currentPrice.toFixed(2)}`);
        console.log(`Suportes: [${supports.map(s => s.toFixed(2)).join(', ')}]`);
        console.log(`Vales (últimos 3): [${valleys.slice(-3).map(v => v.toFixed(2)).join(', ')}]`);
        console.log(`SMA Curta (10): ${smaShort.slice(-1)[0].toFixed(3)}, SMA Longa (20): ${smaLong.slice(-1)[0].toFixed(3)}`);
        console.log(`Gradiente Linear: ${slope.toFixed(4)}`);
        console.log(`Volume Atual: ${currentVolume.toFixed(3)}, Média Volume (10 candles): ${avgVolume.toFixed(3)}`);
        console.log(`Volatilidade (stdDev/mean): ${(volatility * 100).toFixed(2)}%`);
        console.log('\nCondições:');
        console.log(`1. Próximo de Suporte (tolerância ${tolerance * 100}%): ${nearSupport}`);
        if (!nearSupport && supports.length > 0) {
            const closestSupport = supports.reduce((prev, curr) =>
                Math.abs(this.currentPrice - curr) / curr < Math.abs(this.currentPrice - prev) / prev ? curr : prev, supports[0]);
            console.log(`   - Motivo: Preço está a ${(Math.abs(this.currentPrice - closestSupport) / closestSupport * 100).toFixed(2)}% do suporte mais próximo (${closestSupport.toFixed(2)})`);
        }
        console.log(`2. Próximo de Vale (tolerância ${valleyTolerance * 100}%): ${nearValley}`);
        if (!nearValley && valleys.length > 0) {
            const closestValley = valleys.slice(-3).reduce((prev, curr) =>
                Math.abs(this.currentPrice - curr) / curr < Math.abs(this.currentPrice - prev) / prev ? curr : prev, valleys.slice(-3)[0]);
            console.log(`   - Motivo: Preço está a ${(Math.abs(this.currentPrice - closestValley) / closestValley * 100).toFixed(2)}% do vale mais próximo (${closestValley.toFixed(2)})`);
        }
        console.log(`3. SMA Curta > SMA Longa ou Gradiente > 0.01: ${smaBullish}`);
        if (!smaBullish) {
            console.log(`   - Motivo: SMA Curta (${smaShort.slice(-1)[0].toFixed(3)}) <= SMA Longa (${smaLong.slice(-1)[0].toFixed(3)}) e Gradiente (${slope.toFixed(4)}) <= 0.01`);
        }
        console.log(`4. Volume > Média: ${highVolume}`);
        if (!highVolume) {
            console.log(`   - Motivo: Volume atual (${currentVolume.toFixed(3)}) <= Média (${avgVolume.toFixed(3)})`);
        }
        console.log(`Volatilidade Suficiente (>0.1%): ${volatility > 0.001}`);
        if (volatility <= 0.001) {
            console.log(`   - Motivo: Volatilidade baixa (${(volatility * 100).toFixed(2)}%), mercado em consolidação`);
        }

        // Verificar sinal de compra
        const buySignal = nearSupport && nearValley && smaBullish && highVolume && volatility > 0.001;

        console.log(`\nSinal de Compra: ${buySignal ? 'GERADO' : 'NÃO GERADO'}`);
        if (!buySignal) {
            console.log('Resumo: Sinal não gerado devido a uma ou mais condições não atendidas.');
        }

        if (buySignal) {
            const support = supports[0];
            const stopLoss = support * (1 - this.stopLossPercent);
            const takeProfit = Math.min(this.currentPrice * (1 + this.takeProfitPercent), support * 0.999);
            console.log(`Entrada: ${this.currentPrice.toFixed(2)}, Stop Loss: ${stopLoss.toFixed(2)}, Take Profit: ${takeProfit.toFixed(2)}`);
            return { entryPrice: this.currentPrice, stopLoss, takeProfit };
        }
        return null;
    }

    checkSellSignal(): { entryPrice: number, stopLoss: number, takeProfit: number; } | null {
        const klines = DataManager.getInstance().getKlines(this.botConfig.symbol, this.botConfig.interval);
        this.currentPrice = klines.getClosePrices().slice(-1)[0];
        console.log(`Current Price: ${this.currentPrice}`);
        const currentVolume = klines.getOhlcv().slice(-1)[0].volume;
        const avgVolume = klines.getOhlcv().slice(-10).reduce((sum, k) => sum + k.volume, 0) / 10;

        const { resistances } = this.indicators.identifyZonesWithVolume(this.botConfig.symbol, this.botConfig.interval, 0.1);
        const { peaks } = this.indicators.findPeaksAndValleys(this.botConfig.symbol, this.botConfig.interval, 5);
        const { smaShort, smaLong } = this.indicators.calculateMovingAverages(this.botConfig.symbol, this.botConfig.interval, 10, 20);

        const sellSignal = resistances.some(r => Math.abs(this.currentPrice - r) / r <= this.tolerance) &&
            peaks.slice(-3).some(p => Math.abs(this.currentPrice - p) / p <= this.tolerance) &&
            smaShort.slice(-1)[0] < smaLong.slice(-1)[0] &&
            currentVolume > avgVolume;

        if (sellSignal) {
            const resistance = resistances[0];
            const stopLoss = resistance * (1 + this.stopLossPercent);
            const takeProfit = Math.max(this.currentPrice * (1 - this.takeProfitPercent), resistances[0] * 1.001);
            return { entryPrice: this.currentPrice, stopLoss, takeProfit };
        }
        return null;
    }

    protected async analyzeMarket() {
        this.chatManager = await ChatManager.getInstance();
        if (this.status === "SOLD") {
            const buySignal = this.checkBuySignal();
            console.log(buySignal ? `Buy Signal: ${JSON.stringify(buySignal)}` : "No Buy Signal");
            if (buySignal) {
                this.status = "BOUGHT";
                this.operation = new Operation(this.chatId, this.botConfig.symbol, buySignal.entryPrice, Date.now(), "Trading Bot Buy Signal");
                this.stopLoss = buySignal.stopLoss;
                this.takeProfit = buySignal.takeProfit;
                this.operation.save();
                this.chatManager.sendMessage(this.chatId, this.operation.getMessage(buySignal.entryPrice));
            }
        } else if (this.status === "BOUGHT") {

            const sellSignal = this.checkSellSignal();
            console.log(sellSignal ? `Sell Signal: ${JSON.stringify(sellSignal)}` : "No Sell Signal");
            console.log(`Price: ${this.currentPrice} Current Stop Loss: ${this.stopLoss}, Take Profit: ${this.takeProfit}`);
            if (sellSignal && this.stopLoss !== null && sellSignal.entryPrice < this.stopLoss) {
                this.closeOperation(sellSignal.entryPrice, Date.now(), "Stop Loss Triggered");
            } else if (sellSignal && this.takeProfit !== null && sellSignal.entryPrice > this.takeProfit) {
                this.closeOperation(sellSignal.entryPrice, Date.now(), "Take Profit Triggered");

            }
        }
        console.log(`Status: ${this.status} for ${this.botConfig.symbol} at ${new Date().toLocaleTimeString()}`);

    }

    closeOperation(sellPrice: number, sellDate: number, sellCriteria: string) {
        if (this.operation) {
            this.operation.sell(sellPrice, sellDate, sellCriteria);
            this.status = "SOLD";
            this.operation.save();
            this.result *= sellPrice / this.operation.buyPrice;
            const message = this.operation.toString();
            this.operation = null;
            this.stopLoss = null;
            this.takeProfit = null;
            const resultMessage = `
            RESULT.......: ${this.result.toFixed(4)}%`;
            if (this.chatManager) {
                this.chatManager.sendFormattedMessage(this.chatId, message + resultMessage);
            }
            console.log(`Operation closed: ${message}`);
        }
    }

}

export { TradingBot, TradingBotConfig };