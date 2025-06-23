import { Indicator } from "technicalindicators/declarations/indicator/indicator";
import { Bot, BotConfig } from "./Bot";
import DataManager from "./DataManager";
import { Interval, Status } from './types';
import Indicators from "./Indicators";
import Operation from "./Operation";
import he from 'he';
import Kline from "./Kline";


export type BotRSIStatus2 =
    'RSI_BELOW_20' | // RSI abaixo de 20 no intervalo longo 
    'RSI_ABOVE_80' | // RSI acima de 80 no intervalo longo
    'NONE';  // RSI não está em nenhum dos estados acima

export type BotTSILast2 =
    'CRESCENT' | // Últimos 3 RSI crescenteso 
    'DECRESCENT' | // Últimos 3 RSI decrescentes
    'INDEFINED';  // Últimos 3 RSI não estão em nenhum dos estados acima

export type BotEMAStatus2 =
    'CROSS_UP' | // EMA rápida cruzou a EMA lenta para cima
    'CROSS_DOWN' | // EMA rápida cruzou a EMA lenta para baixo
    'UP' | // EMA rápida está acima da EMA lenta
    'DOWN'; // EMA rápida está abaixo da EMA lenta

export type BotIntentionStatus2 =
    'BUY' | // Intenção de compra
    'SELL';  // Intenção de venda

class BotRSIMA2Config extends BotConfig {
    /**
     * @param symbol 
     * @param interval 
     * @param rsiPeriod // Período de cálculo do RSI
     * @param fastEMA // Período de cálculo do EMA rápido
     * @param slowEMA // Período de cálculo do EMA lenta
     * @param stopLossPercent // Percentual de stop loss para considerar a operação
     * @param minimumPL // Percentual mínimo de lucro/perda para considerar a operação 
     * @param priceDistance 
     */
    constructor(
        public symbol: string,
        public interval: Interval = '1h',
        public rsiPeriod: number = 7,
        public fastEMA: number = 9,
        public slowEMA: number = 11,
        public stopLossPercent: number = 0.02, // 2% Stop Loss
        public minimumPL: number = 0.005, // 0.5% Minimum Loss/Profit
        public priceDistance: number = 1.01, // 1% Price Distance
        public stopGainPercent: number = 0.01 // 5% Stop Gain

    ) {
        super();
    }

    public toString(): string {
        return `
CONFIGURATION:
SYMBOL.........: ${this.symbol}
INTERVAL.......: ${this.interval}
RSI PERIOD.....: ${this.rsiPeriod}
FAST EMA.......: ${this.fastEMA}
SLOW EMA.......: ${this.slowEMA}
STOP LOSS......: ${(this.stopLossPercent * 100).toFixed(2)}%
MINIMUM P/L....: ± ${(this.minimumPL * 100).toFixed(2)}%`;
    }
}


class BotRSIEMA2 extends Bot {

    private operations: Operation[] = []; // List of operations performed by the bot

    private config: BotRSIMA2Config; // Configuration for the bot

    private buyPrice: number | null = null; // Price at which the bot bought
    private botRSIStatus2: BotRSIStatus2 = 'NONE'; // Current status of the bot
    private botTSILast2: BotTSILast2 = 'INDEFINED'; // Last 3 RSI trends

    private botIntentionStatus2: BotIntentionStatus2 = 'SELL'; // Intention of the bot (buy or sell)
    private botEmaStatus2: BotEMAStatus2 = 'DOWN'; // Current status of the bot for EMA

    private lastSellPrice: number = 0; // Last price at which the bot sold


    constructor(chatId: number, config: BotRSIMA2Config) {
        super(chatId);
        this.config = config;
        this.sendMessage(this.getBotConfig());

    }

    protected async analyzeMarket(): Promise<void> {
        const i = new Indicators();
        const closes = DataManager.getInstance().getKlines(this.config.symbol, this.config.interval).getClosePrices();
        const lastKline = DataManager.getInstance().getKlines(this.config.symbol, this.config.interval).getLastKline();
        const startTimes = DataManager.getInstance().getKlines(this.config.symbol, this.config.interval).getStartTimes();
        const actualDate = startTimes[startTimes.length - 1] / 1000 || 0;

        // Check RSI Indicators
        const rsiIndicator = i.calculateRSI(this.config.symbol, this.config.interval, this.config.rsiPeriod);
        const prePreviousRSI = rsiIndicator[rsiIndicator.length - 3] || 0;
        const previousRSI = rsiIndicator[rsiIndicator.length - 2] || 0;
        const actualRSI = rsiIndicator[rsiIndicator.length - 1] || 0;

        // Check EMA Indicators
        const fastInterval = i.calculateEMA(this.config.symbol, this.config.interval, this.config.fastEMA);
        const slowInterval = i.calculateEMA(this.config.symbol, this.config.interval, this.config.slowEMA);
        const longInterval = i.calculateEMA(this.config.symbol, this.config.interval, 100);

        const actualfastInterval = fastInterval[fastInterval.length - 1] || 0;
        const actualslowInterval = slowInterval[slowInterval.length - 1] || 0;
        const previofastInterval = fastInterval[fastInterval.length - 2] || 0;
        const previoslowInterval = slowInterval[slowInterval.length - 2] || 0;

        const actualLongInterval = longInterval[longInterval.length - 1] || 0;

        const crossUp = actualfastInterval > actualslowInterval && previofastInterval <= previoslowInterval;
        const crossDown = actualfastInterval < actualslowInterval && previofastInterval >= previoslowInterval;

        let opReason = '';

        const actualPrice = closes[closes.length - 1] || 0;
        const priceDistance = this.lastSellPrice / actualPrice;

        // Definindo os Status do Bot
        if (previousRSI > 80) {
            this.botRSIStatus2 = 'RSI_ABOVE_80';
            opReason += 'RSI > 80\n';
        } else if (previousRSI < 20) {
            this.botRSIStatus2 = 'RSI_BELOW_20';
            opReason += 'RSI < 20\n';
        }

        if (prePreviousRSI < previousRSI && previousRSI < actualRSI) {
            this.botTSILast2 = 'CRESCENT';
            opReason += 'RSI CRESCENT\n';
        } else if (prePreviousRSI > previousRSI && previousRSI > actualRSI) {
            this.botTSILast2 = 'DECRESCENT';
            opReason += 'RSI DECRESCENT\n';
        } else {
            this.botTSILast2 = 'INDEFINED';
            opReason += 'RSI INDEFINED\n';
        }

        if (crossUp && actualLongInterval < actualPrice) {
            this.botEmaStatus2 = 'CROSS_UP';
            opReason += 'CROSS UP EMA\n';
        } else if (crossDown) {
            this.botEmaStatus2 = 'CROSS_DOWN';
            opReason += 'CROSS DOWN EMA\n';
        } else if (actualfastInterval > actualslowInterval && actualLongInterval < actualPrice) {
            this.botEmaStatus2 = 'UP';
            opReason += 'EMA UP\n';
        } else {
            this.botEmaStatus2 = 'DOWN';
            opReason += 'EMA DOWN\n';
        }



        if (this.botRSIStatus2 == 'RSI_BELOW_20' && this.botEmaStatus2 == 'CROSS_UP') {
            this.botIntentionStatus2 = 'BUY';
        }
        // else if (this.botTSILast2 == "CRESCENT" && this.botEmaStatus2 == 'UP' && priceDistance > this.config.priceDistance && actualRSI < 50) {
        //     opReason += `RSI CRESCENT + EMA UP + Price Distance > ${this.config.priceDistance.toFixed(2)} (${priceDistance.toFixed(2)}) + RSI < 50\n`;
        //     this.botIntentionStatus2 = 'BUY';
        // } 
        // else if (this.botRSIStatus2 == 'RSI_ABOVE_80' || this.botEmaStatus2 == 'CROSS_DOWN') {
        else if (this.botRSIStatus2 == 'RSI_ABOVE_80') {
            this.botIntentionStatus2 = 'SELL';
        }
        // else if (this.botEmaStatus2 == 'DOWN') {
        //     this.botIntentionStatus2 = 'SELL';
        // }

        if (this.status == 'SOLD') {
            let log = `
BUY SIGNAL..: ${this.config.symbol} 
PRICE ......: ${actualPrice.toFixed(2)} 
RSI.........: ${previousRSI.toFixed(3)}
STATUS......: ${this.status}`;
            this.log(log);
            // Se verifica se o bot tem intenção de comprar
            if (this.botIntentionStatus2 == 'BUY') {
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
                const message: string = operation.getBuyMessage(actualPrice);
                this.sendMessage(message);
                console.log(lastKline);
                console.log(`EMA: ${actualfastInterval.toFixed(2)}/${actualslowInterval.toFixed(2)} ${this.botEmaStatus2}`);
                console.log(`RSI: ${actualRSI.toFixed(2)}/${previousRSI.toFixed(2)} ${this.botRSIStatus2} ${this.botTSILast2}`);
                console.log(operation.toString());
            }
        } else if (this.status == 'BOUGHT') {
            let stopLossPrice: number | null = null;
            let stopGainPrice: number | null = null;
            let pl: number | null = null;
            let minimumProfitPrice: number | null = null;
            let minimumLossPrice: number | null = null;
            let minimumCriteria: boolean = false;

            if (this.buyPrice !== null) {
                pl = (actualPrice / this.buyPrice) - 1;
                stopLossPrice = this.buyPrice * (1 - this.config.stopLossPercent);
                stopGainPrice = this.buyPrice * (1 + this.config.stopGainPercent);
                // @ts-ignore
                minimumProfitPrice = this.buyPrice * (1 + this.config.minimumPL);
                // @ts-ignore
                minimumLossPrice = this.buyPrice * (1 - this.config.minimumPL);
                minimumCriteria = actualPrice > minimumProfitPrice || actualPrice < minimumLossPrice;
            } else {
                console.error('Buy price is null, cannot calculate P/L or stop loss.');
                return;
            }
            // Check for sell signal
            if (this.botIntentionStatus2 == 'SELL' && minimumCriteria) {
                const message: string = `
SELL SIGNAL.: ${this.config.symbol} 
BUY PRICE...: ${this.buyPrice ? this.buyPrice.toFixed(2) : 'N/A'}
PRICE ......: ${actualPrice.toFixed(2)} 
P/L.........: ${pl ? pl.toFixed(3) : 'N/A'}%
RSI ........: ${actualRSI.toFixed(2)}/${previousRSI.toFixed(2)}/${prePreviousRSI.toFixed(2)}
EMA ---.....: ${actualfastInterval.toFixed(2)}/${actualslowInterval.toFixed(2)}
STATUS......: ${this.status}
REASON......: ${opReason}
`;
                console.log(lastKline?.toString());
                this.lastSellPrice = actualPrice; // Update last sell price
                this.closeOperation(actualPrice, opReason, actualDate);
                this.sendMessage(message);
            } else if (stopLossPrice && actualPrice < stopLossPrice) {
                console.log(lastKline?.toString());
                this.closeOperation(actualPrice, `STOP LOSS ${opReason}`, actualDate);

                const message: string = `
SELL SIGNAL.: ${this.config.symbol} 
BUY PRICE...: ${this.buyPrice ? this.buyPrice.toFixed(2) : 'N/A'}
PRICE ......: ${actualPrice.toFixed(2)} 
P/L.........: ${pl ? pl.toFixed(3) : 'N/A'}%
RSI ........: ${actualRSI.toFixed(2)}/${previousRSI.toFixed(2)}/${prePreviousRSI.toFixed(2)}
EMA ---.....: ${actualfastInterval.toFixed(2)}/${actualslowInterval.toFixed(2)}
STATUS......: ${this.status}
REASON......: STOP LOSS ${opReason}
`;
                this.sendMessage(message);
            } else if (actualPrice > stopGainPrice && this.buyPrice !== null) {
                this.closeOperation(actualPrice, `STOP GAIN`, actualDate);
                const message: string = `
    SELL SIGNAL.: ${this.config.symbol} 
    BUY PRICE...: ${this.buyPrice ? this.buyPrice.toFixed(2) : 'N/A'}
    PRICE ......: ${actualPrice.toFixed(2)}
    P/L.........: ${pl ? pl.toFixed(3) : 'N/A'}%
    RSI ........: ${actualRSI.toFixed(2)}/${previousRSI.toFixed(2)}/${prePreviousRSI.toFixed(2)}
    EMA ---.....: ${actualfastInterval.toFixed(2)}/${actualslowInterval.toFixed(2)}
    STATUS......: ${this.status}  
    REASON......: STOP GAIN
    `;
            }
        }

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

        const longLines = DataManager.getInstance().getKlines(this.config.symbol, this.config.interval);
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

export { BotRSIEMA2, BotRSIMA2Config };