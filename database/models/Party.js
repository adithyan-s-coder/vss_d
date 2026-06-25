import { DataTypes } from 'sequelize';
import { sequelize } from '../db.js';

const Party = sequelize.define('Party', {
  id: { type: DataTypes.STRING, primaryKey: true, unique: true },
  name: { type: DataTypes.STRING },
  address: { type: DataTypes.STRING },
  phone: { type: DataTypes.STRING },
  gstin: { type: DataTypes.STRING },
  gstNo: { type: DataTypes.STRING },
  date: { type: DataTypes.STRING },
  timestamp: { type: DataTypes.BIGINT, defaultValue: () => Date.now() }
}, {
  tableName: 'party',
  timestamps: false
});

export default Party;
