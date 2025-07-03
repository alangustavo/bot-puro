import ChatManager from "./ChatManager";
import Database from "./Database";
import he from 'he';
import { formatAllDate } from "./utils";

export default class Operation {

    public operationId: number | null;
    public chatId: number;
    public symbol: string;
    public actualBuyPrice: number | null = null; // Preenchido quando a operação é aberta com o preço atual
    public actualSellPrice: number | null = null; // Preenchido quando a operação é fechada com o preço atual
    public buyPrice: number; // preço efetivo de compra, ajustado para 0.1% acima do preço de mercado
    public buyDate: number;
    public buyCriteria: string;
    public sellPrice: number; // preço efetivo de venda, ajustado para 0.1% abaixo do preço de mercado
    public sellDate: number;
    public sellCriteria: string;
    /**
     * 
     * @param chatId 
     * @param symbol 
     * @param buyPrice 
     * @param buyDate 
     * @param buyCriteria 
     */
    constructor(chatId: number, symbol: string, buyPrice: number, buyDate: number, buyCriteria: string) {
        this.operationId = null; // This will be set by the database
        this.chatId = chatId;
        this.symbol = symbol;
        this.actualBuyPrice = buyPrice; // Preenchido quando a operação é aberta com o preço atual
        this.buyPrice = buyPrice * 1.001;
        this.buyDate = buyDate;
        this.buyCriteria = buyCriteria;
        this.sellPrice = 0; // This will be set when the operation is closed
        this.sellDate = 0; // This will be set when the operation is closed
        this.sellCriteria = ''; // This will be set when the operation is closed
        // this.sendOperationToTelegram();
    }

    formatDate(ms: number): string {
        return formatAllDate(ms);
    }

    public getBuyMessage(price: number): string {
        return `
SYMBOL.......: ${this.symbol}
BUY PRICE....: ${this.buyPrice}
BUY DATE.....: ${this.formatDate(this.buyDate)}
BUY CRITERIA.: ${this.buyCriteria}
CURRENT PRICE: ${price}`;
    }

    public toString(): string {
        return `
OPERATION ID.: ${this.operationId || 'NEW'}
SYMBOL.......: ${this.symbol}
BUY PRICE....: ${this.buyPrice}
BUY DATE.....: ${this.formatDate(this.buyDate)}
BUY CRITERIA.: ${this.buyCriteria}
BUY ACTUAL...: ${this.actualBuyPrice ? this.actualBuyPrice : 'N/A'}
SELL PRICE...: ${this.sellPrice}
SELL DATE....: ${this.sellDate ? this.formatDate(this.sellDate) : 'N/A'}
SELL CRITERIA: ${this.sellCriteria}
SELL ACTUAL..: ${this.actualSellPrice ? this.actualSellPrice : 'N/A'}
P/L..........: ${(((this.sellPrice / this.buyPrice) - 1) * 100).toFixed(2)}%`;
    }

    public async sell(sellPrice: number, sellDate: number, sellCriteria: string): Promise<void> {
        this.sellPrice = sellPrice * 0.999; // Ajuste de 0.1% para venda
        this.actualSellPrice = sellPrice; // Preenchido quando a operação é fechada com o preço atual
        this.sellDate = sellDate;
        this.sellCriteria = sellCriteria;
        await this.save();
        // this.sendOperationToTelegram();


    }
    protected escapeHtml(text: string): string {
        return he.encode(text);
    }

    private async sendOperationToTelegram(): Promise<void> {

        const chatManager = await ChatManager.getInstance();
        if (this.chatId === 999999) {
            return; // Não envia mensagens para o chat de testes
        }

        chatManager.sendMessage(this.chatId, `<pre>${this.escapeHtml(this.toString())}</pre>`);
    }

    public async save(): Promise<void> {
        const db = await Database.getInstance();

        interface RunResult {
            lastID?: number;
            changes?: number;
        }

        const result: RunResult = await db.run(
            `INSERT OR REPLACE INTO operations(
            operationId, chatId, symbol, buyPrice, buyDate, buyCriteria, sellPrice, sellDate, sellCriteria
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                this.operationId || null, // null permite autoincremento em novo registro
                this.chatId,
                this.symbol,
                this.buyPrice,
                this.buyDate,
                this.buyCriteria,
                this.sellPrice,
                this.sellDate,
                this.sellCriteria
            ]
        );

        // Se inserido novo, atualiza o operationId
        if (!this.operationId && result && result.lastID) {
            this.operationId = result.lastID;
        }

    }


    public static async getOpenOperation(chatId: number): Promise<Operation | null> {
        const db = await Database.getInstance();
        const rows = await db.all(
            'SELECT * FROM operations WHERE chatId = ? AND sellPrice = 0 ORDER BY buyDate DESC LIMIT 1',
            [chatId]
        ) as any[];
        if (rows.length === 0) return null;
        const row = rows[0];
        const op = new Operation(
            row.chatId,
            row.symbol,
            row.buyPrice,
            row.buyDate,
            row.buyCriteria
        );
        op.operationId = row.operationId;
        return op;
    }

};