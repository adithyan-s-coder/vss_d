import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath, URL } from 'url';
import mysql2 from 'mysql2';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../backend/.env') });

// Remove ALL spaces, newlines, and hidden characters from the URI
let rawUri = process.env.MYSQL_URI || 'mysql://root:password@localhost:3306/vss_dc';
rawUri = rawUri.replace(/\s+/g, '');

const dbUrl = new URL(rawUri);

const sequelizeOptions = {
    dialect: 'mysql',
    dialectModule: mysql2,
    host: dbUrl.hostname,
    port: parseInt(dbUrl.port, 10) || 3306,
    logging: false
};

if (rawUri.includes('aivencloud') || process.env.NODE_ENV === 'production') {
    sequelizeOptions.dialectOptions = {
        ssl: {
            require: true,
            rejectUnauthorized: false
        }
    };
}

export const sequelize = new Sequelize(
    dbUrl.pathname.replace(/^\//, ''), // database
    dbUrl.username,                    // username
    dbUrl.password,                    // password
    sequelizeOptions
);
