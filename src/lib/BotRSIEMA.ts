import { Indicator } from "technicalindicators/declarations/indicator/indicator";
import { Bot, BotConfig } from "./Bot";
import DataManager from "./DataManager";
import { Interval, OHLCV } from './types';
import Indicators from "./Indicators";
import Operation from "./Operation";
import config from '../../jest.config';

export type BotStatus = 'NONE' | 'RSI_BELOW_20' | 'RSI_LONG_ABOVE_80' | 'SHORT_CROSS';

class BotRSIMAConfig extends BotConfig {
    /**
     * 
     * @param symbol 
     * @param shortInterval 
     * @param longInterval 
     * @param rsiPeriod 
     * @param fastEMA 
     * @param slowEMA 
     * @param stopLossPercent 
     * @param minimumProfitPercent 
     */
    constructor(
        public symbol: string,
        public shortInterval: Interval,
        public longInterval: Interval,
        public rsiPeriod: number = 7,
        public fastEMA: number = 9,
        public slowEMA: number = 11,
        public stopLossPercent: number = 0.01, // 1% Stop Loss
        public minimumProfitPercent: number = 0.005, // 0.5% Minimum Profit
    ) {
        super();
    }

    public toString(): string {
        return `
CONFIGURATION:
SYMBOL.........: ${this.symbol}
SHORT INTERVAL.: ${this.shortInterval}
LONG INTERVAL..: ${this.longInterval}
RSI PERIOD.....: ${this.rsiPeriod}
FAST EMA.......: ${this.fastEMA}
SLOW EMA.......: ${this.slowEMA}
STOP LOSS......: ${this.stopLossPercent * 100}%
MINIMUM PROFIT.: ${this.minimumProfitPercent * 100}%`;
    }
}


class BotRSIEMA extends Bot {

    private operations: Operation[] = []; // List of operations performed by the bot
    private result: number; // Result multiplier

    private config: BotRSIMAConfig; // Configuration for the bot

    private buyPrice: number | null = null; // Price at which the bot bought
    private botStatus: BotStatus = 'NONE'; // Current status of the bot


    constructor(chatId: number, config: BotRSIMAConfig) {
        super(chatId, 10);
        this.config = config;
        this.result = 1; // Result multiplier
        this.sendMessage(this.getBotConfig());
    }

    protected async analyzeMarket(): Promise<void> {
        const i = new Indicators();
        const closes = DataManager.getInstance().getKlines(this.config.symbol, this.config.shortInterval).getClosePrices();
        // Check long RSI Interval
        const rsiIndicators = i.calculateRSI(this.config.symbol, this.config.longInterval, this.config.rsiPeriod);
        // Long EMA Indicators
        const fastLongEMA = i.calculateEMA(this.config.symbol, this.config.longInterval, this.config.fastEMA);
        const slowLongEMA = i.calculateEMA(this.config.symbol, this.config.longInterval, this.config.slowEMA);
        const actualFastLongEMA = fastLongEMA[fastLongEMA.length - 1] || 0;
        const actualSlowLongEMA = slowLongEMA[slowLongEMA.length - 1] || 0;

        // Short EMA Indicators
        const fastShortEMA = i.calculateEMA(this.config.symbol, this.config.shortInterval, this.config.fastEMA);
        const slowShortEMA = i.calculateEMA(this.config.symbol, this.config.shortInterval, this.config.slowEMA);
        const actualFastShortEMA = fastShortEMA[fastShortEMA.length - 1] || 0;
        const actualSlowShortEMA = slowShortEMA[slowShortEMA.length - 1] || 0;

        const actualPrice = closes[closes.length - 1] || 0;
        const previoRSI = rsiIndicators[rsiIndicators.length - 2] || 0;

        const actualRSI = rsiIndicators[rsiIndicators.length - 1] || 0;


        if (this.status == 'SOLD') {
            console.log(`${this.status} ${this.botStatus} Price: ${actualPrice.toFixed(2)}, RSI(P/A): ${previoRSI.toFixed(2)}/${actualRSI.toFixed(2)}, FLEMA: ${actualFastLongEMA.toFixed(2)}, SLEMA: ${actualSlowLongEMA.toFixed(2)} ${actualFastLongEMA > actualSlowLongEMA ? "OK!" : "NOK"} FSEMA: ${actualFastShortEMA.toFixed(2)}, SSEMA: ${actualSlowShortEMA.toFixed(2)} ${actualFastShortEMA > actualSlowShortEMA ? "OK!" : "NOK"}`);

            // Check for buy signal
            if (previoRSI <= 20) {
                this.botStatus = 'RSI_BELOW_20';
                const message = `
RSI BELOW 20: ${this.config.symbol} 
PRICE ......: ${actualPrice.toFixed(2)} 
RSI.........: ${previoRSI.toFixed(3)})
STATUS......: ${this.status}`;
                this.sendMessage(message);
                console.log(message);
            } else if (this.botStatus == 'RSI_BELOW_20' && actualPrice > actualFastLongEMA && actualFastLongEMA > actualSlowLongEMA && actualRSI > 40) {
                this.status = 'BOUGHT';
                const operation = new Operation(
                    this.chatId,
                    this.config.symbol,
                    actualPrice,
                    Date.now(),
                    'RSI EMA Buy Signal'
                );
                this.operations.push(operation);
                await operation.save();
                this.buyPrice = operation.buyPrice;
                const message = operation.getBuyMessage(actualPrice);
                this.sendMessage(message);
            } else if (this.botStatus == 'SHORT_CROSS' && actualRSI > 45 && actualRSI < 70 && actualPrice > actualFastShortEMA && actualFastShortEMA > actualSlowShortEMA && actualFastLongEMA > actualFastShortEMA) {
                this.status = 'BOUGHT';
                const operation = new Operation(
                    this.chatId,
                    this.config.symbol,
                    actualPrice,
                    Date.now(),
                    'RSI EMA Buy Signal after Short Cross'
                );
                this.operations.push(operation);
                await operation.save();
                this.buyPrice = operation.buyPrice;
                const message = operation.getBuyMessage(actualPrice);
                this.sendMessage(message);
            }

        } else if (this.status == 'BOUGHT') {
            let stopLossPrice: number | null = null;
            let pl: number | null = null;
            let minimumProfitPrice: number | null = null;
            let minimumLossPrice: number | null = null;
            let minimumCriteria = false;
            if (this.buyPrice !== null) {
                pl = (actualPrice / this.buyPrice) - 1;
                stopLossPrice = this.buyPrice * (1 - this.config.stopLossPercent);
                minimumProfitPrice = this.buyPrice * (1 + this.config.minimumProfitPercent);
                minimumLossPrice = this.buyPrice * (1 - this.config.minimumProfitPercent);
                minimumCriteria = actualPrice > minimumProfitPrice || actualPrice < minimumLossPrice;
            }
            // Check for sell signal
            if (previoRSI >= 80) {
                this.botStatus = 'RSI_LONG_ABOVE_80';
                const message = `
RSI BELOW 20: ${this.config.symbol} 
BUY PRICE...: ${this.buyPrice ? this.buyPrice.toFixed(2) : 'N/A'}
PRICE ......: ${actualPrice.toFixed(2)} 
P/L.........: ${pl ? pl.toFixed(3) : 'N/A'}%
RSI.........: ${previoRSI.toFixed(3)})
STATUS......: ${this.status}
`;
                this.sendMessage(message);
            }

            if (actualSlowLongEMA > actualFastLongEMA && minimumCriteria) {
                this.closeOperation(actualPrice, 'Long Cross EMA Down');
                this.botStatus = 'NONE';
            } else if (stopLossPrice !== null && actualPrice < stopLossPrice) {
                this.closeOperation(actualPrice, 'Stop Loss Triggered');
                this.botStatus = 'NONE';
                return;
            } else if (actualSlowShortEMA > actualFastShortEMA && minimumCriteria) {
                this.closeOperation(actualPrice, 'Short Cross EMA Down');
                this.botStatus = 'SHORT_CROSS';
            }
        }
    }

    private closeOperation(sellPrice: number, criteria: string): void {
        const operation = this.operantions[this.operations.length - 1];
        if (operation) {
            operation.sell(sellPrice, Date.now(), criteria);
            this.status = 'SOLD';
            this.result *= sellPrice / operation.buyPrice;
            this.sendMessage(`Operation closed: ${operation.toString()}`);
            this.buyPrice = null; // Reset buy price after selling
        }
        operation.save();
        this.sendMessage(`Operation closed at ${sellPrice.toFixed(2)} due to ${criteria}`);

        let result = 1;
        for (const op of this.operations) {
            result *= op.sellPrice / op.buyPrice;
        }
        result = (result - 1) * 100; // Convert to percentage

        const message = operation.toString() + `\nRESULT.......: ${result.toFixed(3)}%`;
        this.sendMessage(message);
        console.log(message);


    }

    protected async configKlines(): Promise<void> {
        const shortKlines = DataManager.getInstance().getKlines(this.config.symbol, this.config.shortInterval);
        await shortKlines.fetchKlines();

        const longLines = DataManager.getInstance().getKlines(this.config.symbol, this.config.longInterval);
        await longLines.fetchKlines();
    }

    protected getBotName(): string {
        return `RSI + SMA Bot(${this.config.symbol})`;
    }

    protected getBotConfig(): string {
        return this.config.toString();
    }
};

export { BotRSIEMA, BotRSIMAConfig };