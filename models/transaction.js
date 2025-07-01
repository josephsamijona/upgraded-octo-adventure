module.exports = (sequelize, DataTypes) => {
  const Transaction = sequelize.define('Transaction', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    orderId: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true
    },
    amount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1
      }
    },
    productId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'products',
        key: 'id'
      }
    },
    description: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    transactionId: {
      type: DataTypes.STRING(50),
      allowNull: true,
      unique: true
    },
    status: {
      type: DataTypes.ENUM('pending', 'successful', 'failed', 'cancelled'),
      defaultValue: 'pending'
    },
    payerPhone: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    paymentDetails: {
      type: DataTypes.JSON,
      allowNull: true
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'transactions',
    timestamps: true,
    indexes: [
      {
        name: 'transaction_order_id_idx',
        using: 'BTREE',
        fields: ['orderId']
      },
      {
        name: 'transaction_status_idx',
        using: 'BTREE',
        fields: ['status']
      }
    ]
  });

  return Transaction;
};