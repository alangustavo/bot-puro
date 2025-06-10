import ChatManager from "./ChatManager";
import Database from "./Database";

export default class Operation {

    public operationId: number | null;
    public chatId: number;
    public symbol: string;
    public buyPrice: number;
    public buyDate: number;
    public buyCriteria: string;
    public sellPrice: number;
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
        this.buyPrice = buyPrice * 1.001;
        this.buyDate = buyDate;
        this.buyCriteria = buyCriteria;
        this.sellPrice = 0; // This will be set when the operation is closed
        this.sellDate = 0; // This will be set when the operation is closed
        this.sellCriteria = ''; // This will be set when the operation is closed
        this.sendOperationToTelegram();
    }

    public getBuyMessage(price: number): string {
        return `
<pre>
SYMBOL.......: ${this.symbol}
BUY PRICE....: ${this.buyPrice}
BUY DATE.....: ${new Date(this.buyDate).toLocaleString()}
BUY CRITERIA.: ${this.buyCriteria}
CURRENT PRICE: ${price}
P/L..........: N/A
</pre>
        `;
    }

    public toString(): string {
        return `
<pre>
SYMBOL.......: ${this.symbol}
BUY PRICE....: ${this.buyPrice}
BUY DATE.....: ${new Date(this.buyDate).toLocaleString()}
BUY CRITERIA.: ${this.buyCriteria}
SELL PRICE...: ${this.sellPrice}
SELL DATE....: ${new Date(this.sellDate).toLocaleString()}
SELL CRITERIA: ${this.sellCriteria}
P/L..........: ${(this.sellPrice / this.buyPrice) - 1 * 100}%
</pre>`;

    }

    public async sell(sellPrice: number, sellDate: number, sellCriteria: string): Promise<void> {
        this.sellPrice = sellPrice * 0.999; // Ajuste de 0.1% para venda
        this.sellDate = sellDate;
        this.sellCriteria = sellCriteria;
        await this.save();
        this.sendOperationToTelegram();

    }

    private async sendOperationToTelegram(): Promise<void> {
        const chatManager = await ChatManager.getInstance();
        chatManager.sendMessage(this.chatId, this.toString());
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

    public async getOpenOperations(chatId: number): Promise<Operation[]> {
        const db = await Database.getInstance();
        const rows = await db.all(
            'SELECT * FROM operations WHERE chatId = ? AND sellPrice = 0',
            [chatId]
        ) as Operation[];

        return rows.map((row) => {
            return new Operation(
                row.chatId,
                row.symbol,
                row.buyPrice,
                row.buyDate,
                row.buyCriteria,
            );
        });
    }

};