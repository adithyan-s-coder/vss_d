import { DataTypes } from 'sequelize';
import { sequelize } from '../db.js';

const Counter = sequelize.define('Counter', {
  id: { type: DataTypes.STRING, primaryKey: true, unique: true },
  seq: { type: DataTypes.INTEGER, defaultValue: 0 }
}, {
  tableName: 'counter',
  timestamps: false
});

export default Counter;
