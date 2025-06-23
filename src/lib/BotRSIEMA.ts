import { Indicator } from "technicalindicators/declarations/indicator/indicator";
import { Bot, BotConfig } from "./Bot";
import DataManager from "./DataManager";
import { Interval, OHLCV } from './types';
import Indicators from "./Indicators";
import Operation from "./Operation";
import he from 'he';
import Kline from "./Kline";
import CsvWriter from "./CsvWriter";


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
    'SELL' |
    'HOLD';  // Intenção de venda

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
        public stopGainPercent: number = 0.03 // 3% Stop Gain
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
STOP LOSS......: ${(this.stopLossPercent * 100).toFixed(2)}%
MINIMUM P/L....: ± ${(this.minimumProfitPercent * 100).toFixed(2)}%`;
    }
}


class BotRSIEMA extends Bot {

    private operations: Operation[] = []; // List of operations performed by the bot

    private config: BotRSIMAConfig; // Configuration for the bot

    private buyPrice: number | null = null; // Price at which the bot bought
    private botRSI1dStatus: BotRSIStatus = 'NONE'; // Current status of the bot
    private botRSI1hStatus: BotRSIStatus = 'NONE'; // Current status of the bot for short interval

    private botIntention01hStatus: BotIntentionStatus = 'HOLD'; // Intention of the bot (buy or sell)
    private botIntention01dStatus: BotIntentionStatus = 'HOLD'; // Intention of the bot (buy or sell)
    private botEMA01hStatus: BotEMAStatus = 'DOWN'; // Current status of the bot for EMA
    private botEMA01dStatus: BotEMAStatus = 'DOWN'; // Current status of the bot for EMA
    private csvFileName: string;

    constructor(chatId: number, config: BotRSIMAConfig) {
        super(chatId, 10);
        this.config = config;
        this.sendMessage(this.getBotConfig());
        this.csvFileName = `bot_rsi_ema_${this.config.symbol}_${this.config.shortInterval}_${this.config.longInterval}.csv`;

    }

    protected async analyzeMarket(): Promise<void> {
        const i = new Indicators();
        const closes = DataManager.getInstance().getKlines(this.config.symbol, this.config.shortInterval).getClosePrices();
        const lastKline = DataManager.getInstance().getKlines(this.config.symbol, this.config.shortInterval).getLastKline();


        const startTimes = DataManager.getInstance().getKlines(this.config.symbol, this.config.shortInterval).getStartTimes();
        const endTimes = DataManager.getInstance().getKlines(this.config.symbol, this.config.shortInterval).getEndTimes();

        const actualDate = startTimes[startTimes.length - 1] / 1000 || 0;
        const actualDateString = new Date(actualDate * 1000).toISOString().replace('T', ' ').replace('Z', '');

        // Check RSI Indicators Long Interval
        const rsi01dIndicators = i.calculateRSI(this.config.symbol, this.config.longInterval, this.config.rsiPeriod);
        const previo01dRSI = rsi01dIndicators[rsi01dIndicators.length - 2] || 0;
        const actual01dRSI = rsi01dIndicators[rsi01dIndicators.length - 1] || 0;
        // Check RSI Indicators Short Interval
        const rsi01hIndicators = i.calculateRSI(this.config.symbol, this.config.shortInterval, this.config.rsiPeriod);

        const previo01hRSI = rsi01hIndicators[rsi01hIndicators.length - 2] || 0;
        const actual01hRSI = rsi01hIndicators[rsi01hIndicators.length - 1] || 0;


        // Check EMA Indicators
        const fast01dEMA = i.calculateEMA(this.config.symbol, this.config.longInterval, this.config.fastEMA);
        const slow01dmEMA = i.calculateEMA(this.config.symbol, this.config.longInterval, this.config.slowEMA);
        const actualFast01dEMA = fast01dEMA[fast01dEMA.length - 1] || 0;
        const actualSlow01dEMA = slow01dmEMA[slow01dmEMA.length - 1] || 0;
        const previoFast01dEMA = fast01dEMA[fast01dEMA.length - 2] || 0;
        const previoSlow01dEMA = slow01dmEMA[slow01dmEMA.length - 2] || 0;
        const crossActual01dEMA = actualFast01dEMA > actualSlow01dEMA;
        const crossPrevio01dEMA = previoFast01dEMA > previoSlow01dEMA;


        const fast01hEMA = i.calculateEMA(this.config.symbol, this.config.shortInterval, this.config.fastEMA);
        const slow01hEMA = i.calculateEMA(this.config.symbol, this.config.shortInterval, this.config.slowEMA);
        const actualfast01hEMA = fast01hEMA[fast01hEMA.length - 1] || 0;
        const actualslow01hEMA = slow01hEMA[slow01hEMA.length - 1] || 0;
        const previoFast01hEMA = fast01hEMA[fast01hEMA.length - 2] || 0;
        const previoSlow01hEMA = slow01hEMA[slow01hEMA.length - 2] || 0;
        const crossActual01EMA = actualfast01hEMA > actualslow01hEMA;
        const crossPrevio01EMA = previoFast01hEMA > previoSlow01hEMA;
        let opReason = '';

        const actualPrice = closes[closes.length - 1] || 0;

        // Definindo os Status do Bot
        if (previo01dRSI > 70) {
            this.botRSI1dStatus = 'RSI_ABOVE_80';
            opReason += `\nRSI 01d ${actual01dRSI.toFixed(3)} > 80`;

        } else if (previo01dRSI < 30) {
            this.botRSI1dStatus = 'RSI_BELOW_20';
            opReason += `\nRSI 01d  ${actual01dRSI.toFixed(3)} < 20`;
        }


        if (crossActual01dEMA && !crossPrevio01dEMA) {
            this.botEMA01dStatus = 'CROSS_UP';
            opReason += `\nCROSS UP 01d EMA\nFast/Slow Actual ${actualFast01dEMA.toFixed(2)}/${actualSlow01dEMA.toFixed(2)}\nFast/Slow Previous ${previoFast01dEMA.toFixed(2)}/${previoSlow01dEMA.toFixed(2)}`;
        } else if (!crossActual01dEMA && crossPrevio01dEMA) {
            this.botEMA01dStatus = 'CROSS_DOWN';
            opReason += `\nCROSS DOWN 01d EMA\nFast/Slow Actual ${actualFast01dEMA.toFixed(2)}/${actualSlow01dEMA.toFixed(2)}\nFast/Slow Previous ${previoFast01dEMA.toFixed(2)}/${previoSlow01dEMA.toFixed(2)}`;
        } else if (actualFast01dEMA > actualSlow01dEMA) {
            this.botEMA01dStatus = 'UP';
            opReason += `\nEMA 01d UP\nFast/Slow Actual ${actualFast01dEMA.toFixed(2)}/${actualSlow01dEMA.toFixed(2)}\nFast/Slow Previous ${previoFast01dEMA.toFixed(2)}/${previoSlow01dEMA.toFixed(2)}`;
        } else {
            this.botEMA01dStatus = 'DOWN';
            opReason += `\nEMA 01d DOWN\nFast/Slow Actual ${actualFast01dEMA.toFixed(2)}/${actualSlow01dEMA.toFixed(2)}\nFast/Slow Previous ${previoFast01dEMA.toFixed(2)}/${previoSlow01dEMA.toFixed(2)}`;
        }

        // Definindo os Status do Bot
        if (previo01hRSI > 80) {
            this.botRSI1hStatus = 'RSI_ABOVE_80';
            opReason += `\nRSI 01h ${actual01hRSI} > 80`;
        } else if (previo01hRSI < 20) {
            this.botRSI1hStatus = 'RSI_BELOW_20';
            opReason += `\nRSI 01h ${actual01hRSI} < 20`;
        }


        if (crossActual01EMA && !crossPrevio01EMA) {
            this.botEMA01hStatus = 'CROSS_UP';
            opReason += `\nCROSS UP 01h EMA \nFast/Slow Actual ${actualfast01hEMA.toFixed(2)}/${actualslow01hEMA.toFixed(2)}\nFast/Slow Previous ${previoFast01hEMA.toFixed(2)}/${previoSlow01hEMA.toFixed(2)}`;
        } else if (!crossActual01EMA && crossPrevio01EMA) {
            this.botEMA01hStatus = 'CROSS_DOWN';
            opReason += `\nCROSS DOWN 01h EMA\nFast/Slow Actual ${actualfast01hEMA.toFixed(2)}/${actualslow01hEMA.toFixed(2)}\nFast/Slow Previous ${previoFast01hEMA.toFixed(2)}/${previoSlow01hEMA.toFixed(2)}`;
        } else if (actualfast01hEMA > actualslow01hEMA) {
            this.botEMA01hStatus = 'UP';
            opReason += `\nEMA 01h UP\nFast/Slow Actual ${actualfast01hEMA.toFixed(2)}/${actualslow01hEMA.toFixed(2)}\nFast/Slow Previous ${previoFast01hEMA.toFixed(2)}/${previoSlow01hEMA.toFixed(2)}`;
        } else {
            this.botEMA01hStatus = 'DOWN';
            opReason += `\nEMA 01h DOWN\nFast/Slow Actual ${actualfast01hEMA.toFixed(2)}/${actualslow01hEMA.toFixed(2)}\nFast/Slow Previous ${previoFast01hEMA.toFixed(2)}/${previoSlow01hEMA.toFixed(2)}`;
        }


        if (this.botRSI1dStatus == 'RSI_BELOW_20' && this.botEMA01dStatus == 'CROSS_UP' && actual01dRSI < 60) {
            this.botIntention01dStatus = 'BUY';
        } else if (this.botRSI1dStatus == 'RSI_BELOW_20' && this.botEMA01dStatus == 'UP' && actual01dRSI < 60) {
            this.botIntention01dStatus = 'BUY';
        } else if (this.botRSI1dStatus == 'RSI_ABOVE_80' || this.botEMA01dStatus == 'CROSS_DOWN') {
            this.botIntention01dStatus = 'SELL';
        } else if (this.botIntention01dStatus != 'BUY' && actual01dRSI < 80) {
            this.botIntention01dStatus = 'HOLD';
        }

        if (this.botIntention01dStatus == 'BUY' && this.botEMA01hStatus == 'UP' && previo01hRSI < 60) {
            this.botIntention01hStatus = 'BUY';
        } else if (this.botIntention01dStatus == 'BUY' && this.botEMA01hStatus == 'CROSS_UP') {
            this.botIntention01hStatus = 'BUY';
        } else if (this.botIntention01dStatus == 'SELL' || this.botRSI1hStatus == 'RSI_ABOVE_80' || this.botEMA01hStatus == 'CROSS_DOWN') {
            this.botIntention01hStatus = 'SELL';
        } else {
            this.botIntention01hStatus = 'HOLD';
        }

        const csv = new CsvWriter('./results');
        const header = "Date,Symbol,Status,Price,RSI 01d,RSI 01h,Intention 01d,Intention 01h,EMA Fast 01d,EMA Slow 01d,EMA Fast 01h,EMA Slow 01h,op, operationReason";
        let op = 'NONE';
        if (this.status == 'SOLD') {
            this.log(`Status: ${this.status} $${actualPrice.toFixed(2)} RSI L/S: ${previo01dRSI.toFixed(3)}/${previo01hRSI.toFixed(3)} Intention L/S: ${this.botIntention01dStatus}/${this.botIntention01hStatus} EMA F/S ${this.config.longInterval}: ${actualFast01dEMA.toFixed(2)}/${actualSlow01dEMA.toFixed(2)} ${actualFast01dEMA > actualSlow01dEMA ? "OK!" : "!OK"} EMA F/S ${this.config.shortInterval}: ${actualfast01hEMA.toFixed(2)}/${actualslow01hEMA.toFixed(2)} ${actualfast01hEMA > actualslow01hEMA ? "OK!" : "!OK"}`);

            // Check for buy signal
            // if (this.botIntention01dStatus == 'BUY' && this.botIntention01hStatus == 'BUY' && actualPrice > actualfast01hEMA) {
            if (this.botIntention01dStatus == 'BUY' && this.botIntention01hStatus == 'BUY') {
                op = 'BUY';
                // if (this.botIntention01dStatus == 'BUY' && actualPrice > actualfast01hEMA) {
                const message = `
BUY SIGNAL..: ${this.config.symbol} 
PRICE ......: ${actualPrice.toFixed(2)} 
RSI.........: ${previo01dRSI.toFixed(3)}
STATUS......: ${this.status}`;

                this.log(message);
            }
            if (this.botIntention01dStatus == 'BUY' &&
                this.botIntention01hStatus == 'BUY') {
                this.status = 'BOUGHT';
                const operation = new Operation(
                    this.chatId,
                    this.config.symbol,
                    actualPrice,
                    actualDate,
                    opReason // Não escapa aqui, o sendMessage já faz o escape
                );
                this.operations.push(operation);
                await operation.save();
                this.buyPrice = operation.buyPrice;
                const message = operation.getBuyMessage(actualPrice);
                this.sendMessage(message);
                console.log(lastKline);
                console.log(`ema 01d: ${actualFast01dEMA.toFixed(2)}/${actualSlow01dEMA.toFixed(2)} ${actualFast01dEMA > actualSlow01dEMA ? "OK!" : "!OK"}`);
                console.log(`ema 01h: ${actualfast01hEMA.toFixed(2)}/${actualslow01hEMA.toFixed(2)} ${actualfast01hEMA > actualslow01hEMA ? "OK!" : "!OK"}`);
                console.log(`rsi 01d: ${actual01dRSI.toFixed(2)}/${previo01dRSI.toFixed(2)}`);
                console.log(`rsi 01h: ${actual01hRSI.toFixed(2)}/${previo01hRSI.toFixed(2)}`);
            }
        } else if (this.status == 'BOUGHT') {
            let stopLossPrice: number | null = null;
            let stopGainPrice: number | null = null;
            let pl: number | null = null;
            let minimumProfitPrice: number | null = null;
            let minimumLossPrice: number | null = null;
            let minimumCriteria = false;


            if (this.buyPrice !== null) {
                pl = (actualPrice / this.buyPrice) - 1;
                stopLossPrice = this.buyPrice * (1 - this.config.stopLossPercent);
                stopGainPrice = this.buyPrice * (1 + this.config.stopGainPercent);
                minimumProfitPrice = this.buyPrice * (1 + this.config.minimumProfitPercent);
                minimumLossPrice = this.buyPrice * (1 - this.config.minimumProfitPercent);
                minimumCriteria = actualPrice > minimumProfitPrice || actualPrice < minimumLossPrice;
                this.log(`Status: ${this.status} $${actualPrice.toFixed(2)} PL: ${pl} RSI L/S: ${previo01dRSI.toFixed(3)}/${previo01hRSI.toFixed(3)} Intention L/S: ${this.botIntention01dStatus}/${this.botIntention01hStatus} EMA F/S ${this.config.longInterval}: ${actualFast01dEMA.toFixed(2)}/${actualSlow01dEMA.toFixed(2)} ${actualFast01dEMA > actualSlow01dEMA ? "OK!" : "!OK"} EMA F/S ${this.config.shortInterval}: ${actualfast01hEMA.toFixed(2)}/${actualslow01hEMA.toFixed(2)} ${actualfast01hEMA > actualslow01hEMA ? "OK!" : "!OK"}`);
            } else {
                console.error('Buy price is null, cannot calculate P/L or stop loss.');
                return;
            }
            // Check for sell signal
            if (
                // this.botIntention01dStatus == 'SELL' &&
                // minimumCriteria

                (this.botIntention01dStatus == 'SELL' ||
                    this.botIntention01hStatus == 'SELL') &&
                actualPrice < actualslow01hEMA &&
                minimumCriteria

            ) {
                op = 'SELL';
                const message = `
SELL SIGNAL.: ${this.config.symbol} 
BUY PRICE...: ${this.buyPrice ? this.buyPrice.toFixed(2) : 'N/A'}
PRICE ......: ${actualPrice.toFixed(2)} 
P/L.........: ${pl ? pl.toFixed(3) : 'N/A'}%
RSI 01h.....: ${actual01hRSI.toFixed(3)}/ ${previo01hRSI.toFixed(3)})
RSI 01d.....: ${actual01dRSI.toFixed(3)}/ ${previo01dRSI.toFixed(3)})
EMA 01h.....: ${actualfast01hEMA.toFixed(2)}/${actualslow01hEMA.toFixed(2)}
EMA 01d.....: ${actualFast01dEMA.toFixed(2)}/${actualSlow01dEMA.toFixed(2)}
STATUS......: ${this.status}
REASON......: ${opReason}
`;
                console.log(lastKline?.toString());
                this.closeOperation(actualPrice, opReason, actualDate);
                this.sendMessage(message);
            } else if (stopLossPrice && actualPrice < stopLossPrice) {
                console.log(lastKline?.toString());
                op = 'SELL';
                this.closeOperation(actualPrice, `STOP LOSS ${opReason}`, actualDate);

                const message = `
SELL SIGNAL.: ${this.config.symbol} 
BUY PRICE...: ${this.buyPrice ? this.buyPrice.toFixed(2) : 'N/A'}
PRICE ......: ${actualPrice.toFixed(2)} 
P/L.........: ${pl ? pl.toFixed(3) : 'N/A'}%
RSI 01h.....: ${actual01hRSI.toFixed(3)}/ ${previo01hRSI.toFixed(3)})
RSI 01d.....: ${actual01dRSI.toFixed(3)}/ ${previo01dRSI.toFixed(3)})
EMA 01h.....: ${actualfast01hEMA.toFixed(2)}/${actualslow01hEMA.toFixed(2)}
EMA 01d.....: ${actualFast01dEMA.toFixed(2)}/${actualSlow01dEMA.toFixed(2)}
STATUS......: ${this.status}
REASON......: ${opReason}
`;
                this.sendMessage(message);
            } else if (stopGainPrice && actualPrice > stopGainPrice) {
                op = 'SELL';
                console.log(lastKline?.toString());
                this.closeOperation(actualPrice, `STOP GAIN ${opReason}`, actualDate);
                const message = `SELL SIGNAL.: ${this.config.symbol}
BUY PRICE...: ${this.buyPrice ? this.buyPrice.toFixed(2) : 'N/A'}
PRICE ......: ${actualPrice.toFixed(2)}
P/L.........: ${pl ? pl.toFixed(3) : 'N/A'}%
RSI 01h.....: ${actual01hRSI.toFixed(3)}/ ${previo01hRSI.toFixed(3)})
RSI 01d.....: ${actual01dRSI.toFixed(3)}/ ${previo01dRSI.toFixed(3)})
EMA 01h.....: ${actualfast01hEMA.toFixed(2)}/${actualslow01hEMA.toFixed(2)}
EMA 01d.....: ${actualFast01dEMA.toFixed(2)}/${actualSlow01dEMA.toFixed(2)}
STATUS......: ${this.status}
REASON......: ${opReason}
`;
            }

        }
        const sanitizedOpReason = opReason.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
        const row = `${actualDateString},${this.config.symbol},${this.status},${actualPrice.toFixed(2)},${previo01dRSI.toFixed(3)},${previo01hRSI.toFixed(3)},${this.botIntention01dStatus},${this.botIntention01hStatus},${actualFast01dEMA.toFixed(2)},${actualSlow01dEMA.toFixed(2)},${actualfast01hEMA.toFixed(2)},${actualslow01hEMA.toFixed(2)},${op},${sanitizedOpReason}`;
        csv.writeCsv(this.csvFileName, header, row);
    }

    private closeOperation(sellPrice: number, criteria: string, actualDate: number): void {
        this.log(`Closing operation at ${sellPrice.toFixed(2)} due to ${criteria}`);
        const operation = this.operations[this.operations.length - 1];
        if (operation) {
            operation.sell(sellPrice, actualDate, criteria);
            this.status = 'SOLD';
            this.sendMessage('Operation closed: ' + operation.toString());
            this.buyPrice = null; // Reset buy price after selling
            operation.save();
        } else {
            console.error(`No operation to close. ${sellPrice} ${criteria} ignored.`);
            return;
        }
        this.log(`Operation closed: ${operation ? operation.toString() : 'N/A'}`);
        this.sendMessage('Operation closed at ' + sellPrice.toFixed(2) + ' due to ' + criteria);

        let result = 1;
        let gains = 0;
        for (const op of this.operations) {
            if (op.sellPrice && op.buyPrice) {
                const pl = op.sellPrice / op.buyPrice;
                if (pl > 1) gains++;
                result *= pl;
            }
        }
        result = (result - 1) * 100; // Convert to percentage

        const message = operation.toString() + `\nRESULT.......: ${result.toFixed(3)}%\nGAINS........: ${gains}/${this.operations.filter(op => op.sellPrice && op.buyPrice).length}`;
        this.sendMessage(message);
        console.log(message);
    }

    protected async configKlines(): Promise<void> {
        const shortKlines = DataManager.getInstance().getKlines(this.config.symbol, this.config.shortInterval);
        await shortKlines.fetchKlines();

        const longLines = DataManager.getInstance().getKlines(this.config.symbol, this.config.longInterval);
        await longLines.fetchKlines();

        const openOperation = await Operation.getOpenOperation(this.chatId);
        if (openOperation) {
            this.operations.push(openOperation);
            this.status = 'BOUGHT';
            this.buyPrice = openOperation.buyPrice;
            this.sendMessage(`Open Operation found: ${openOperation.toString()}`);
        } else {
            this.status = 'SOLD';
            this.sendMessage('No open operations found, starting fresh.');
        }
    }

    protected getBotName(): string {
        return `RSI + SMA Bot(${this.config.symbol})`;
    }

    protected getBotConfig(): string {
        return this.config.toString();
    }

    getLastOperation(): Operation | null {
        return this.operations.length > 0 ? this.operations[this.operations.length - 1] : null;
    }
};

export { BotRSIEMA, BotRSIMAConfig };