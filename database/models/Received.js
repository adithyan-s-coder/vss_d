import { DataTypes } from 'sequelize';
import { sequelize } from '../db.js';

const Received = sequelize.define('Received', {
  id: { type: DataTypes.STRING, primaryKey: true, unique: true },
  partyName: { type: DataTypes.STRING },
  receivedDate: { type: DataTypes.STRING },
  clothType: { type: DataTypes.STRING },
  pieces: { type: DataTypes.INTEGER },
  weight: { type: DataTypes.FLOAT },
  lotNo: { type: DataTypes.STRING },
  status: { type: DataTypes.STRING, defaultValue: 'Pending' },
  timestamp: { type: DataTypes.BIGINT, defaultValue: () => Date.now() }
}, {
  tableName: 'received',
  timestamps: false
});

export default Received;
