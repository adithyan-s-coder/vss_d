import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sequelize } from '../database/db.js';
import User from '../database/models/User.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
app.use(express.json());
app.use(cors());

// Connect to MySQL
sequelize.authenticate()
    .then(() => {
        console.log('✅ Connected to MySQL database');
    })
    .catch(err => console.error('MySQL connection error:', err));

// Test Home Route
app.get('/', (req, res) => {
    res.send('VSS DC Auth Server Running');
});

// Login Endpoint
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        // Check if user exists
        const user = await User.findOne({ where: { username } });
        if (!user) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        // Check password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        // Success
        res.json({ message: 'Login successful' });
    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ error: 'Server error during login' });
    }
});

import Received from '../database/models/Received.js';
import Delivery from '../database/models/Delivery.js';
import Party from '../database/models/Party.js';
import DyeingUnit from '../database/models/DyeingUnit.js';
import Staff from '../database/models/Staff.js';
import Attendance from '../database/models/Attendance.js';
import Invoice from '../database/models/Invoice.js';
import Setting from '../database/models/Setting.js';
import Counter from '../database/models/Counter.js';

// Model Mapping
const models = {
    received: Received,
    delivery: Delivery,
    party_master: Party,
    dyeing_master: DyeingUnit,
    staff: Staff,
    attendance: Attendance,
    invoices: Invoice,
    settings: Setting,
    counters: Counter
};

// Generic Data Endpoints
app.get('/api/:collection', async (req, res) => {
    try {
        const { collection } = req.params;
        const Model = models[collection];
        if (!Model) return res.status(404).json({ error: 'Collection not found' });

        const rows = await Model.findAll();
        // Fallback to relational columns if data is empty (for backward compatibility)
        const data = rows.map(r => r.data ? r.data : r.toJSON());
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/:collection', async (req, res) => {
    try {
        const { collection } = req.params;
        const Model = models[collection];
        if (!Model) return res.status(404).json({ error: 'Collection not found' });

        const payload = req.body;
        if (!payload.id) return res.status(400).json({ error: 'ID is required' });

        // Upsert with data JSON column
        const upsertData = { ...payload, data: payload };
        await Model.upsert(upsertData);

        res.json(payload);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/:collection/:id', async (req, res) => {
    try {
        const { collection, id } = req.params;
        const Model = models[collection];
        if (!Model) return res.status(404).json({ error: 'Collection not found' });

        await Model.destroy({ where: { id: String(id) } });
        res.json({ message: 'Deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Admin Initial Registration Endpoint (Development Use Only)

app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;

        // See if any user already exists
        const existingUser = await User.findOne({ where: { username } });
        if (existingUser) {
            return res.status(400).json({ error: 'Username already exists' });
        }

        // Hash the password securely
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Save
        const newUser = await User.create({ username, password: hashedPassword });

        res.status(201).json({ message: 'User registered successfully' });
    } catch (error) {
        console.error('Registration Error:', error);
        res.status(500).json({ error: 'Server error during registration' });
    }
});

const PORT = process.env.PORT || 5000;
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`🚀 Server listening on http://localhost:${PORT}`);
    });
}

export default app;
