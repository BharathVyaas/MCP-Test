import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import dotenv from 'dotenv';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = resolve(__dirname, '.env');
console.log('Resolving .env at:', envPath);
dotenv.config({ path: envPath });
console.log('DATAVERSE_URL =', process.env.DATAVERSE_URL);
