import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../backend/.env') });

const MYSQL_URI = process.env.MYSQL_URI || 'mysql://root@localhost:3306/vss_dc';

export const sequelize = new Sequelize(MYSQL_URI, {
    dialect: 'mysql',
    logging: false
});
