import { DataTypes } from 'sequelize';
import { sequelize } from '../db.js';

const Setting = sequelize.define('Setting', {
  id: { type: DataTypes.STRING, primaryKey: true, unique: true },
  companyName: { type: DataTypes.STRING },
  address: { type: DataTypes.STRING },
  phone: { type: DataTypes.STRING },
  email: { type: DataTypes.STRING },
  gstNo: { type: DataTypes.STRING },
  data: { type: DataTypes.JSON },
  timestamp: { type: DataTypes.BIGINT, defaultValue: () => Date.now() }
}, {
  tableName: 'setting',
  timestamps: false
});

export default Setting;
