import sqlite3 from 'sqlite3';

export default class Database {
    private static instance: Database;
    private db: sqlite3.Database;

    private constructor() {
        this.db = new sqlite3.Database('./db/database.sqlite');
        this.initialize(); // Inicializa o banco de dados ao criar a instância
    }

    public static async getInstance(): Promise<Database> {
        if (!Database.instance) {
            Database.instance = new Database();
            await Database.instance.initialize(); // Aguarda a inicialização do banco de dados
        }
        return Database.instance;
    }

    public async run(query: string, params: unknown[] = []): Promise<{ lastID?: number, changes?: number; }> {
        return new Promise((resolve, reject) => {
            this.db.run(query, params, function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ lastID: this.lastID, changes: this.changes });
                }
            });
        });
    }

    public async get(query: string, params: unknown[] = []): Promise<unknown> {
        return new Promise((resolve, reject) => {
            this.db.get(query, params, (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    public async all(query: string, params: unknown[] = []): Promise<unknown[]> {
        return new Promise((resolve, reject) => {
            this.db.all(query, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    public async initialize(): Promise<void> {
        const createClientTableQuery = `
            CREATE TABLE IF NOT EXISTS clients (
                chatId INTEGER NOT NULL PRIMARY KEY,
                name TEXT,
                email TEXT,
                binanceApiKey TEXT,
                binanceApiSecret TEXT,
                active BOOLEAN DEFAULT false
            );
        `;
        await this.run(createClientTableQuery);
        const createOperationsTableQuery = `
            CREATE TABLE IF NOT EXISTS operations (
                operationId INTEGER PRIMARY KEY AUTOINCREMENT,
                chatId INTEGER NOT NULL,
                symbol TEXT NOT NULL,
                buyPrice REAL NOT NULL,
                buyDate INTEGER NOT NULL,
                buyCriteria TEXT NOT NULL,
                sellPrice REAL,
                sellDate INTEGER,
                sellCriteria TEXT,
                FOREIGN KEY (chatId) REFERENCES clients(chatId)
            );
        `;
        await this.run(createOperationsTableQuery);
    }
}


