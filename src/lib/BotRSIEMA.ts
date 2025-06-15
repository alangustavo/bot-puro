import { Indicator } from "technicalindicators/declarations/indicator/indicator";
import { Bot, BotConfig } from "./Bot";
import DataManager from "./DataManager";
import { Interval, OHLCV } from './types';
import Indicators from "./Indicators";
import Operation from "./Operation";


export type BotRSIStatus =
    'RSI_BELOW_20' | // RSI abaixo de 20 no intervalo longo 
    'RSI_ABOVE_80' | // RSI acima de 80 no intervalo longo
    'NONE';  // RSI não está em nenhum dos estados acima

export type BotEMAStatus =
    'CROSS_UP' | // EMA rápida cruzou a EMA lenta para cima
    'CROSS_DOWN' | // EMA rápida cruzou a EMA lenta para baixo
    'UP' | // EMA rápida está acima da EMA lenta
    'DOWN'; // EMA rápida está abaixo da EMA lenta

export type BotIntentionStatus =
    'BUY' | // Intenção de compra
    'SELL';  // Intenção de venda

class BotRSIMAConfig extends BotConfig {
    /**
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
MINIMUM P/L....: ± ${this.minimumProfitPercent * 100}%`;
    }
}


class BotRSIEMA extends Bot {

    private operations: Operation[] = []; // List of operations performed by the bot

    private config: BotRSIMAConfig; // Configuration for the bot

    private buyPrice: number | null = null; // Price at which the bot bought
    private botRSI15mStatus: BotRSIStatus = 'NONE'; // Current status of the bot
    private botRSI01mStatus: BotRSIStatus = 'NONE'; // Current status of the bot for short interval

    private botIntention01mStatus: BotIntentionStatus = 'SELL'; // Intention of the bot (buy or sell)
    private botIntention15mStatus: BotIntentionStatus = 'SELL'; // Intention of the bot (buy or sell)
    private botEMA01mStatus: BotEMAStatus = 'DOWN'; // Current status of the bot for EMA
    private botEMA15mStatus: BotEMAStatus = 'DOWN'; // Current status of the bot for EMA


    constructor(chatId: number, config: BotRSIMAConfig) {
        super(chatId, 10);
        this.config = config;
        this.sendMessage(this.getBotConfig());
    }

    protected async analyzeMarket(): Promise<void> {
        const i = new Indicators();
        const closes = DataManager.getInstance().getKlines(this.config.symbol, this.config.shortInterval).getClosePrices();
        // Check RSI Indicators Long Interval
        const rsi15mIndicators = i.calculateRSI(this.config.symbol, this.config.longInterval, this.config.rsiPeriod);
        const previo15mRSI = rsi15mIndicators[rsi15mIndicators.length - 2] || 0;
        const actual15mRSI = rsi15mIndicators[rsi15mIndicators.length - 1] || 0;
        // Check RSI Indicators Short Interval
        const rsi01mIndicators = i.calculateRSI(this.config.symbol, this.config.shortInterval, this.config.rsiPeriod);
        const previo01mRSI = rsi01mIndicators[rsi01mIndicators.length - 2] || 0;
        const actual01mRSI = rsi01mIndicators[rsi01mIndicators.length - 1] || 0;


        // Check EMA Indicators
        const fast15mEMA = i.calculateEMA(this.config.symbol, this.config.longInterval, this.config.fastEMA);
        const slow15mEMA = i.calculateEMA(this.config.symbol, this.config.longInterval, this.config.slowEMA);
        const actualFast15mEMA = fast15mEMA[fast15mEMA.length - 1] || 0;
        const actualSlow15mEMA = slow15mEMA[slow15mEMA.length - 1] || 0;
        const previoFast15mEMA = fast15mEMA[fast15mEMA.length - 2] || 0;
        const previoSlow15mEMA = slow15mEMA[slow15mEMA.length - 2] || 0;
        const crossActual15EMA = actualFast15mEMA > actualSlow15mEMA;
        const crossPrevio15EMA = previoFast15mEMA > previoSlow15mEMA;


        const fast01mEMA = i.calculateEMA(this.config.symbol, this.config.shortInterval, this.config.fastEMA);
        const slow01mEMA = i.calculateEMA(this.config.symbol, this.config.shortInterval, this.config.slowEMA);
        const actualfast01mEMA = fast01mEMA[fast01mEMA.length - 1] || 0;
        const actualslow01mEMA = slow01mEMA[slow01mEMA.length - 1] || 0;
        const previoFast01mEMA = fast01mEMA[fast01mEMA.length - 2] || 0;
        const previoSlow01mEMA = slow01mEMA[slow01mEMA.length - 2] || 0;
        const crossActual01EMA = actualfast01mEMA > actualslow01mEMA;
        const crossPrevio01EMA = previoFast01mEMA > previoSlow01mEMA;
        let opReason = '';

        const actualPrice = closes[closes.length - 1] || 0;

        // Definindo os Status do Bot
        if (previo15mRSI > 80) {
            this.botRSI15mStatus = 'RSI_ABOVE_80';
            opReason += 'RSI 15m > 80\n';
        } else if (previo15mRSI < 20) {
            this.botRSI15mStatus = 'RSI_BELOW_20';
            opReason += 'RSI 15m < 20\n';
        }

        if (crossActual15EMA && !crossPrevio15EMA) {
            this.botEMA15mStatus = 'CROSS_UP';
            opReason += 'CROSS UP 15m EMA\n';
        } else if (!crossActual15EMA && crossPrevio15EMA) {
            this.botEMA15mStatus = 'CROSS_DOWN';
            opReason += 'CROSS DOWN 15m EMA\n';
        } else if (actualFast15mEMA > actualSlow15mEMA) {
            this.botEMA15mStatus = 'UP';
            opReason += 'EMA 15m UP\n';
        } else {
            this.botEMA15mStatus = 'DOWN';
            opReason += 'EMA 15m DOWN\n';
        }

        // Definindo os Status do Bot
        if (previo01mRSI > 80) {
            this.botRSI01mStatus = 'RSI_ABOVE_80';
            opReason += 'RSI 01m > 80\n';
        } else if (previo01mRSI < 20) {
            this.botRSI01mStatus = 'RSI_BELOW_20';
            opReason += 'RSI 01m < 20\n';
        } else {
            opReason += 'RSI 01m >= 20 AND <= 80\n';
            this.botRSI01mStatus = 'NONE';
        }


        if (crossActual01EMA && !crossPrevio01EMA) {
            this.botEMA01mStatus = 'CROSS_UP';
            opReason += 'CROSS UP 01m EMA\n';
        } else if (!crossActual01EMA && crossPrevio01EMA) {
            this.botEMA01mStatus = 'CROSS_DOWN';
            opReason += 'CROSS DOWN 01m EMA\n';
        } else if (actualfast01mEMA > actualslow01mEMA) {
            this.botEMA01mStatus = 'UP';
            opReason += 'EMA 01m UP\n';
        } else {
            this.botEMA01mStatus = 'DOWN';
            opReason += 'EMA 01m DOWN\n';
        }


        if (this.botRSI15mStatus == 'RSI_BELOW_20' && this.botEMA15mStatus == 'CROSS_UP') {
            this.botIntention15mStatus = 'BUY';
        } else if (this.botRSI15mStatus == 'RSI_ABOVE_80' || this.botEMA15mStatus == 'CROSS_DOWN') {
            this.botIntention15mStatus = 'SELL';
        }

        if (this.botIntention15mStatus == 'BUY' && this.botEMA01mStatus == 'CROSS_UP' && previo01mRSI < 50) {
            this.botIntention01mStatus = 'BUY';
        } else if (this.botIntention15mStatus == 'SELL' || this.botRSI01mStatus == 'RSI_ABOVE_80' || this.botEMA01mStatus == 'CROSS_DOWN') {
            this.botIntention01mStatus = 'SELL';
        }


        if (this.status == 'SOLD') {
            console.log(`Status: ${this.status} $${actualPrice.toFixed(2)} RSI L/S: ${previo15mRSI.toFixed(3)}/${previo01mRSI.toFixed(3)} Intention L/S: ${this.botIntention15mStatus}/${this.botIntention01mStatus} EMA F/S ${this.config.longInterval}: ${actualFast15mEMA.toFixed(2)}/${actualSlow15mEMA.toFixed(2)} ${actualFast15mEMA > actualSlow15mEMA ? "OK!" : "!OK"} EMA F/S ${this.config.shortInterval}: ${actualfast01mEMA.toFixed(2)}/${actualslow01mEMA.toFixed(2)} ${actualfast01mEMA > actualslow01mEMA ? "OK!" : "!OK"}`);

            // Check for buy signal
            if (this.botIntention15mStatus == 'BUY' && this.botIntention01mStatus == 'BUY' && actualPrice > actualfast01mEMA) {
                const message = `
BUY SIGNAL..: ${this.config.symbol} 
PRICE ......: ${actualPrice.toFixed(2)} 
RSI.........: ${previo15mRSI.toFixed(3)}
STATUS......: ${this.status}`;

                console.log(message);
            }
            if (this.botIntention15mStatus == 'BUY' &&
                this.botIntention01mStatus == 'BUY') {
                this.status = 'BOUGHT';
                const operation = new Operation(
                    this.chatId,
                    this.config.symbol,
                    actualPrice,
                    Date.now(),
                    opReason
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
                console.log(`Status: ${this.status} $${actualPrice.toFixed(2)} PL: ${pl} RSI L/S: ${previo15mRSI.toFixed(3)}/${previo01mRSI.toFixed(3)} Intention L/S: ${this.botIntention15mStatus}/${this.botIntention01mStatus} EMA F/S ${this.config.longInterval}: ${actualFast15mEMA.toFixed(2)}/${actualSlow15mEMA.toFixed(2)} ${actualFast15mEMA > actualSlow15mEMA ? "OK!" : "!OK"} EMA F/S ${this.config.shortInterval}: ${actualfast01mEMA.toFixed(2)}/${actualslow01mEMA.toFixed(2)} ${actualfast01mEMA > actualslow01mEMA ? "OK!" : "!OK"}`);
            } else {
                console.error('Buy price is null, cannot calculate P/L or stop loss.');
                return;
            }
            // Check for sell signal
            if (this.botIntention15mStatus == 'SELL' ||
                this.botIntention01mStatus == 'SELL' &&
                actualPrice < actualslow01mEMA &&
                minimumCriteria

            ) {
                const message = `
SELL SIGNAL.: ${this.config.symbol} 
BUY PRICE...: ${this.buyPrice ? this.buyPrice.toFixed(2) : 'N/A'}
PRICE ......: ${actualPrice.toFixed(2)} 
P/L.........: ${pl ? pl.toFixed(3) : 'N/A'}%
RSI 01m.....: ${actual01mRSI.toFixed(3)}/ ${previo01mRSI.toFixed(3)})
RSI 15m.....: ${actual15mRSI.toFixed(3)}/ ${previo15mRSI.toFixed(3)})
EMA 01m.....: ${actualfast01mEMA.toFixed(2)}/${actualslow01mEMA.toFixed(2)}
EMA 15m.....: ${actualFast15mEMA.toFixed(2)}/${actualSlow15mEMA.toFixed(2)}
STATUS......: ${this.status}
REASON......: ${opReason}
`;
                this.closeOperation(actualPrice, opReason);
                this.sendMessage(message);
            } else if (stopLossPrice && actualPrice < stopLossPrice) {
                this.closeOperation(actualPrice, `STOP LOSS ${opReason}`);
                const message = `
SELL SIGNAL.: ${this.config.symbol} 
BUY PRICE...: ${this.buyPrice ? this.buyPrice.toFixed(2) : 'N/A'}
PRICE ......: ${actualPrice.toFixed(2)} 
P/L.........: ${pl ? pl.toFixed(3) : 'N/A'}%
RSI 01m.....: ${actual01mRSI.toFixed(3)}/ ${previo01mRSI.toFixed(3)})
RSI 15m.....: ${actual15mRSI.toFixed(3)}/ ${previo15mRSI.toFixed(3)})
EMA 01m.....: ${actualfast01mEMA.toFixed(2)}/${actualslow01mEMA.toFixed(2)}
EMA 15m.....: ${actualFast15mEMA.toFixed(2)}/${actualSlow15mEMA.toFixed(2)}
STATUS......: ${this.status}
REASON......: ${opReason}
`;
            }
        }

    }


    private closeOperation(sellPrice: number, criteria: string): void {
        console.log(`Closing operation at ${sellPrice.toFixed(2)} due to ${criteria}`);
        const operation = this.operations[this.operations.length - 1];
        if (operation) {
            operation.sell(sellPrice, Date.now(), criteria);
            this.status = 'SOLD';
            this.sendMessage(`Operation closed: ${operation.toString()}`);
            this.buyPrice = null; // Reset buy price after selling
            operation.save();
        } else {
            console.error(`No operation to close. ${sellPrice} ${criteria} ignored.`);
            return;
        }
        console.log(`Operation closed: ${operation ? operation.toString() : 'N/A'}`);
        this.sendMessage(`Operation closed at ${sellPrice.toFixed(2)} due to ${criteria}`);

        let result = 1;
        let pl = 0;
        let gains = 0;
        for (const op of this.operations) {
            pl = (op.sellPrice / op.buyPrice);
            gains = pl > 1 ? gains++ : gains;
            result *= pl;
        }
        result = (result - 1) * 100; // Convert to percentage

        const message = operation.toString() + `\nRESULT.......: ${result.toFixed(3)}%\nGAINS........: ${gains}/${this.operations.length}`;
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