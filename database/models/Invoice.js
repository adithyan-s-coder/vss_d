import { DataTypes } from 'sequelize';
import { sequelize } from '../db.js';

const Invoice = sequelize.define('Invoice', {
  id: { type: DataTypes.STRING, primaryKey: true, unique: true },
  invoiceNo: { type: DataTypes.STRING },
  date: { type: DataTypes.STRING },
  partyName: { type: DataTypes.STRING },
  totalAmount: { type: DataTypes.FLOAT },
  items: { type: DataTypes.JSON },
  data: { type: DataTypes.JSON },
  timestamp: { type: DataTypes.BIGINT, defaultValue: () => Date.now() }
}, {
  tableName: 'invoice',
  timestamps: false
});

export default Invoice;
