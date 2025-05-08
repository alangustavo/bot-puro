import Database from '../src/lib/database';

describe('Database', () => {
    let db: Database;

    beforeAll(async () => {
        db = await Database.getInstance();
    });

    test('should run a query without errors', async () => {
        await expect(db.run('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)')).resolves.toBeUndefined();
    });

    test('should insert a row and retrieve it', async () => {
        await db.run('INSERT INTO test (name) VALUES (?)', ['Alice']);
        const row = await db.get('SELECT * FROM test WHERE name = ?', ['Alice']);
        expect(row).toEqual({ id: 1, name: 'Alice' });
    });

    test('should retrieve all rows', async () => {
        await db.run('INSERT INTO test (name) VALUES (?)', ['Bob']);
        const rows = await db.all('SELECT * FROM test');
        expect(rows).toEqual([
            { id: 1, name: 'Alice' },
            { id: 2, name: 'Bob' }
        ]);
    });
});
