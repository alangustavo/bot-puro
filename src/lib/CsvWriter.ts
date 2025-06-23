import * as fs from 'node:fs';
import * as path from 'node:path';

class CsvWriter {
    private directory: string;

    constructor(directory: string) {
        this.directory = directory;
        this.ensureDirectoryExists();
    }

    private ensureDirectoryExists() {
        if (!fs.existsSync(this.directory)) {
            fs.mkdirSync(this.directory, { recursive: true });
        }
    }

    public writeCsv(fileName: string, header: string, row: string) {
        const filePath = path.join(this.directory, fileName);
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, `${header}\n`, 'utf8');
        }
        fs.appendFileSync(filePath, `${row}\n`, 'utf8');
    }
}

export default CsvWriter;
