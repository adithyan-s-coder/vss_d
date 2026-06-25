import bcrypt from 'bcryptjs';
import User from '../database/models/User.js';
import { sequelize } from '../database/db.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

async function seed() {
    try {
        await sequelize.authenticate();
        console.log('Connected to MySQL');

        // Ensure table exists
        await User.sync();

        const users = ['kannan', 'vikash'];
        const password = 'admin';
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        for (const username of users) {
            const existing = await User.findOne({ where: { username } });
            if (!existing) {
                await User.create({ username, password: hashedPassword });
                console.log(`User ${username} created`);
            } else {
                console.log(`User ${username} already exists`);
            }
        }

        console.log('Seeding completed');
        process.exit(0);
    } catch (error) {
        console.error('Seeding error:', error);
        process.exit(1);
    }
}

seed();
