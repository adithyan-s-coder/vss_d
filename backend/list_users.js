import dotenv from 'dotenv';
import { sequelize } from '../database/db.js';
import User from '../database/models/User.js';

dotenv.config();

async function listUsers() {
    try {
        console.log('Connecting to MySQL database...');
        await sequelize.authenticate();
        console.log('✅ Connected.');

        const users = await User.findAll();
        console.log('Query result count:', users.length);
        
        if (users.length === 0) {
            console.log('No users found in the database.');
        } else {
            console.log('\n--- Registered Users ---');
            users.forEach((u, i) => console.log(`${i + 1}. Username: ${u.username} (ID: ${u.id})`));
            console.log('------------------------\n');
        }
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await sequelize.close();
    }
}

listUsers();
