import { Bot, BotConfig } from './Bot'; // Ajuste o caminho conforme necessário
import DataManager from './DataManager';
import Indicators from './Indicators';
import Operation from './Operation';
import { Interval } from './types';



class BotSupperTrendConfig extends BotConfig {

    /**
     * 
     * @param symbol Symbol to trade
     * @param shortInterval Short interval for fast signals
     * @param longInterval Long interval for trend confirmation
     * @param stopGainPercent Stop Gain percentage
     * @param stopLossPercent Stop Loss percentage
     * @param minimumProfitPercent Minimum Profit percentage
     * @param rsiPeriod RSI period
     * @param supertrendAtrPeriod 
     * @param supertrendMultiplier 
     * @param sellPriceHoldHours 
     */
    constructor(
        public symbol: string,
        public shortInterval: Interval = '1m', // Short interval for fast signals
        public longInterval: Interval = '15m', // Long interval for trend confirmation
        public stopGainPercent: number = 0.05, // 5% Stop Gain
        public stopLossPercent: number = 0.01, // 1% Stop Loss
        public minimumProfitPercent: number = 0.005, // 0.5% Minimum Profit
        public rsiPeriod: number = 7, // RSI period
        public supertrendAtrPeriod: number = 10, // Supertrend ATR period
        public supertrendMultiplier: number = 3, // Supertrend multiplier        
    ) {
        super();
    }

    public toString(): string {
        return `
        CONFIGURATION:
        SYMBOL.........: ${this.symbol}
        INTERVAL.......: ${this.shortInterval}
        LONG INTERVAL..: ${this.longInterval}
        STOP GAIN......: ${this.stopGainPercent * 100}%
        STOP LOSS......: ${this.stopLossPercent * 100}%
        MINIMUM PROFIT.: ${this.minimumProfitPercent * 100}%
        RSI PERIOD.....: ${this.rsiPeriod}
        STREND ATR.....: ${this.supertrendAtrPeriod}
        STREND MULTIP..: ${this.supertrendMultiplier}
        `;
    }


}



class BotSupperTrend extends Bot {
    constructor(chatId: number, public config: BotSupperTrendConfig) {
        super(chatId);
        this.config = config;
    }

    protected getBotName(): string {
        return 'SuperTrend Bot';
    }

    protected async configKlines(): Promise<void> {

        const shortKlines = DataManager.getInstance().getKlines(this.config.symbol, this.config.shortInterval, 500);
        await shortKlines.fetchKlines();

        const longLines = DataManager.getInstance().getKlines(this.config.symbol, this.config.longInterval);
        await longLines.fetchKlines();
    }

    protected async analyzeMarket(): Promise<void> {
        const dataManager = DataManager.getInstance();
        const shortKlines = dataManager.getKlines(this.config.symbol, this.config.shortInterval);
        const longKlines = dataManager.getKlines(this.config.symbol, this.config.longInterval);
        const closes = shortKlines.getClosePrices();
        const actualPrice = closes[closes.length - 1];
        const now = new Date();
        const dayHourMinute = now.toLocaleTimeString('en-US', { hour12: false, timeZone: 'UTC' }); // formato HH:MM:SS
        if (!shortKlines.getSize() || !longKlines.getSize()) {
            console.log('Waiting for klines data...');
            return;
        }
        const i = new Indicators();
        const prSTShort = i.calculateSupertrend(this.config.symbol, this.config.shortInterval, this.config.supertrendAtrPeriod, this.config.supertrendMultiplier);
        const prSTLong = i.calculateSupertrend(this.config.symbol, this.config.longInterval, this.config.supertrendAtrPeriod, this.config.supertrendMultiplier);
        const ls = prSTShort.direction.length - 1;
        const lm = prSTLong.direction.length - 1;

        const superTrendShortSignal = prSTShort.direction[ls] === 'bearish' ? false : true;
        const superTrendLongSignal = prSTLong.direction[lm] === 'bearish' ? false : true;
        const rsi = i.calculateRSI(this.config.symbol, this.config.shortInterval, 7);
        const r = rsi[rsi.length - 2];
        const shortMa = i.calculateSMA(this.config.symbol, this.config.shortInterval, 9);
        const longMa = i.calculateSMA(this.config.symbol, this.config.longInterval, 11);
        const shortEMA = i.calculateEMA(this.config.symbol, this.config.shortInterval, 9);
        const longEMA = i.calculateEMA(this.config.symbol, this.config.longInterval, 11);
        const sema = shortEMA[shortEMA.length - 2];
        const lema = longEMA[longEMA.length - 2];

        const ssma = shortMa[shortMa.length - 2];
        const lsma = longMa[longMa.length - 2];
        console.log(`RSI: ${r.toFixed(2)} SSMA: ${ssma.toFixed(2)}, LSMA: ${lsma.toFixed(2)} SEMA: ${sema.toFixed(2)}, LEMA: ${lema.toFixed(2)}`);
        console.log(`SuperTrend Short: ${prSTShort.direction[ls]} ${prSTShort.supertrend[ls]}, Long: ${prSTLong.direction[lm]} ${prSTLong.supertrend[lm]}`);
        if (this.status === 'SOLD') {
            console.log(`${dayHourMinute} ${this.status} Price: ${actualPrice.toFixed(2)} SuperTrend Short: ${superTrendShortSignal ? "OK!" : "NOK"}, Long: ${superTrendLongSignal ? "OK!" : "NOK"}`);
            if (superTrendShortSignal && superTrendLongSignal) {
                this.operantions.push(new Operation(
                    this.chatId, this.config.symbol, actualPrice, Date.now(), 'SuperTrend Buy Signal'));
                this.status = 'BOUGHT';
            }
        } else if (this.status === 'BOUGHT') {
            console.log(`Status: ${this.status} SuperTrend Short Signal: ${superTrendShortSignal}, Long Signal: ${superTrendLongSignal}`);
            if (!superTrendShortSignal || !superTrendLongSignal) {
                const operation = this.operantions.pop();
                if (operation) {
                    operation.sell(actualPrice, Date.now(), 'SuperTrend Sell Signal');
                    this.status = 'SOLD';
                    await operation.save();
                    console.log(`Operation closed: ${operation.toString()}`);
                }
            }
        }

    }

    protected getBotConfig(): string {
        return this.config.toString();
    }

    async run() {
        console.log(`${this.getBotName()} is running...`);
        await this.configKlines();
        setInterval(() => {
            this.analyzeMarket();
        }, 60000); // every 60 seconds
    }

}

export { BotSupperTrend, BotSupperTrendConfig };