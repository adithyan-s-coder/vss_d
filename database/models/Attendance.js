import { DataTypes } from 'sequelize';
import { sequelize } from '../db.js';

const Attendance = sequelize.define('Attendance', {
  id: { type: DataTypes.STRING, primaryKey: true, unique: true },
  date: { type: DataTypes.STRING },
  records: { type: DataTypes.JSON },
  timestamp: { type: DataTypes.BIGINT, defaultValue: () => Date.now() }
}, {
  tableName: 'attendance',
  timestamps: false
});

export default Attendance;
