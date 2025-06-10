import ChatManager from "./ChatManager";
import DataManager from "./DataManager";
import type Klines from "./Klines";
import Operation from "./Operation";
import type { Interval, Status } from "./types";

export default class BotSupportResistance {
    private chatId: number;
    private symbol: string;
    private interval: Interval;
    private klines: Klines;
    private support: number | null = null;
    private resistance: number | null = null;
    private status: Status = "SOLD";
    private operation: Operation | null = null;
    private chatManager!: ChatManager;
    private stopLossPercent: number;
    private trailingStopLossPercent: number;
    private trailingStopLossActivePercent: number;
    private trailingStopLossPrice = 0;
    private trailingStopLossActive = false;
    private result = 1;
    private window: number;

    constructor(
        chatId: number,
        symbol: string,
        interval: Interval,
        window = 50,
        stopLossPercent = 0.98,
        trailingStopLossPercent = 0.995,
        trailingStopLossActivePercent = 1.007
    ) {
        this.chatId = chatId;
        this.symbol = symbol;
        this.interval = interval;
        this.window = window;
        this.stopLossPercent = stopLossPercent;
        this.trailingStopLossPercent = trailingStopLossPercent;
        this.trailingStopLossActivePercent = trailingStopLossActivePercent;
        const dataManager = DataManager.getInstance();
        this.klines = dataManager.getKlines(this.symbol, this.interval);
    }

    private detectSupportResistance(): void {
        const closes = this.klines.getClosePrices();
        if (closes.length < this.window) return;
        const recent = closes.slice(-this.window);
        this.support = Math.min(...recent);
        this.resistance = Math.max(...recent);
    }

    private closeOperation(sellPrice: number, sellDate: number, sellCriteria: string) {
        if (this.operation) {
            this.operation.sell(sellPrice, sellDate, sellCriteria);
            const result = sellPrice / this.operation.buyPrice;
            if (result > 1.005 || result < 0.995) {
                this.status = "SOLD";
                this.operation.save();
                this.result *= sellPrice / this.operation.buyPrice;
                const message = `BOTSMA.......:\n${this.operation.toString()}`;

                this.operation = null;
                this.trailingStopLossPrice = 0;
                this.trailingStopLossActive = false;
                this.chatManager.sendMessage(this.chatId, `SELL ${this.symbol} at ${sellPrice} (${sellCriteria})`);

                const resultMessage = `
            RESULT.......: ${this.result.toFixed(4)}%`;
                this.chatManager.sendFormattedMessage(this.chatId, message + resultMessage);
            }
        }
    }

    public async start() {
        this.chatManager = await ChatManager.getInstance();
        await this.klines.fetchKlines();
        setInterval(() => {
            this.detectSupportResistance();
            const closes = this.klines.getClosePrices();

            if (closes.length < this.window) {
                console.log(`Aguardando mais dados para detectar suportes/resistências (${closes.length}/${this.window})`);
                return;
            }
            const lastPrice = closes[closes.length - 1];
            const diff = (this.support !== null && this.resistance !== null && this.support !== 0)
                ? (this.resistance / this.support).toFixed(4)
                : "N/A";
            console.log(`Price: ${lastPrice} Support: ${this.support}, Resistance: ${this.resistance} Satus: ${this.status} dif: ${diff}`);
            if (this.status === "SOLD") {
                // Compra se romper resistência
                if (this.resistance && lastPrice > this.resistance * 1.001) {
                    this.operation = new Operation(this.chatId, this.symbol, lastPrice, Date.now(), 'BREAK RESISTANCE');
                    this.operation.save();
                    console.log(this.operation.getMessage(lastPrice));
                    this.status = "BOUGHT";
                    this.chatManager.sendMessage(this.chatId, `BUY ${this.symbol} at ${lastPrice} (Break Resistance)`);
                    this.chatManager.sendFormattedMessage(this.chatId, `BOTSMA.......:\n${this.operation.getMessage(lastPrice)}`);
                    this.trailingStopLossActive = false;
                }
                // Compra se tocar no suporte (opcional)
                else if (this.support && lastPrice <= this.support * 1.001) {
                    this.operation = new Operation(this.chatId, this.symbol, lastPrice, Date.now(), 'TOUCH SUPPORT');
                    this.operation.save();
                    console.log(this.operation.getMessage(lastPrice));
                    this.status = "BOUGHT";
                    this.chatManager.sendMessage(this.chatId, `BUY ${this.symbol} at ${lastPrice} (Touch Support)`);
                    this.trailingStopLossActive = false;
                    return;
                }
            } else if (this.operation && this.status === "BOUGHT") {
                const buyPrice = this.operation.buyPrice;
                // Stop Loss se perder o suporte
                if (this.support && lastPrice < this.support * 0.999) {
                    this.closeOperation(lastPrice, Date.now(), 'BREAK SUPPORT (STOP LOSS)');
                    return;
                }
                // Stop Loss tradicional
                if (lastPrice < buyPrice * this.stopLossPercent) {
                    this.closeOperation(lastPrice, Date.now(), 'STOP LOSS');
                    return;
                }
                // Ativa trailing stop se subir o suficiente
                if (!this.trailingStopLossActive && lastPrice > buyPrice * this.trailingStopLossActivePercent) {
                    this.trailingStopLossPrice = lastPrice * this.trailingStopLossPercent;
                    this.trailingStopLossActive = true;
                    this.chatManager.sendMessage(this.chatId, `Active Trailing Stop Loss at ${this.trailingStopLossPrice}`);
                }
                // Ajusta trailing stop
                if (this.trailingStopLossActive) {
                    const price = lastPrice * this.trailingStopLossPercent;
                    if (price > this.trailingStopLossPrice) {
                        this.trailingStopLossPrice = price;
                        this.chatManager.sendMessage(this.chatId, `Change Trailing Stop Loss Price to ${this.trailingStopLossPrice}`);
                    }
                }
                // Trailing Stop Loss
                if (this.trailingStopLossActive && lastPrice < this.trailingStopLossPrice) {
                    this.closeOperation(lastPrice, Date.now(), 'TRAILING STOP LOSS');
                    return;
                }
                // Venda se perder resistência (pullback)
                if (this.resistance && lastPrice < this.resistance * 0.999) {
                    this.closeOperation(lastPrice, Date.now(), 'PULLBACK RESISTANCE');
                    return;
                }
            }
        }, 10000);
    }
}
