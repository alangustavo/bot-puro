import sqlite3 from 'sqlite3';

class Database {
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

    public async run(query: string, params: unknown[] = []): Promise<void> {
        return new Promise((resolve, reject) => {
            this.db.run(query, params, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
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
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS clients (
                chatId INTEGER PRIMARY KEY,
                name TEXT,
                email TEXT,
                binanceApiKey TEXT,
                binanceApiSecret TEXT,
                active BOOLEAN DEFAULT false
            )
        `;
        await this.run(createTableQuery);
    }
}

export default Database;
