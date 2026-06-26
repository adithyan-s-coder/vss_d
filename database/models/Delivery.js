import { DataTypes } from 'sequelize';
import { sequelize } from '../db.js';

const Delivery = sequelize.define('Delivery', {
  id: { type: DataTypes.STRING, primaryKey: true, unique: true },
  dcNo: { type: DataTypes.STRING },
  date: { type: DataTypes.STRING },
  partyName: { type: DataTypes.STRING },
  receivedChallanNo: { type: DataTypes.STRING },
  items: { type: DataTypes.JSON },
  totalWeight: { type: DataTypes.FLOAT },
  data: { type: DataTypes.JSON },
  timestamp: { type: DataTypes.BIGINT, defaultValue: () => Date.now() }
}, {
  tableName: 'delivery',
  timestamps: false
});

export default Delivery;
