import { DataTypes } from 'sequelize';
import { sequelize } from '../db.js';

const DyeingUnit = sequelize.define('DyeingUnit', {
  id: { type: DataTypes.STRING, primaryKey: true, unique: true },
  name: { type: DataTypes.STRING },
  address: { type: DataTypes.STRING },
  data: { type: DataTypes.JSON },
  timestamp: { type: DataTypes.BIGINT, defaultValue: () => Date.now() }
}, {
  tableName: 'dyeing_unit',
  timestamps: false
});

export default DyeingUnit;
