import { DataTypes } from 'sequelize';
import { sequelize } from '../db.js';

const Staff = sequelize.define('Staff', {
  id: { type: DataTypes.STRING, primaryKey: true, unique: true },
  name: { type: DataTypes.STRING },
  role: { type: DataTypes.STRING },
  joinDate: { type: DataTypes.STRING },
  timestamp: { type: DataTypes.BIGINT, defaultValue: () => Date.now() }
}, {
  tableName: 'staff',
  timestamps: false
});

export default Staff;
