import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql2 from 'mysql2';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../backend/.env') });

let MYSQL_URI = process.env.MYSQL_URI || 'mysql://root@localhost:3306/vss_dc';
MYSQL_URI = MYSQL_URI.trim();

const sequelizeOptions = {
    dialect: 'mysql',
    dialectModule: mysql2,
    logging: false
};

// Aiven and Vercel require SSL
if (MYSQL_URI.includes('aivencloud') || process.env.NODE_ENV === 'production') {
    sequelizeOptions.dialectOptions = {
        ssl: {
            require: true,
            rejectUnauthorized: false // Required for Aiven
        }
    };
}

export const sequelize = new Sequelize(MYSQL_URI, sequelizeOptions);
