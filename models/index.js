const { Sequelize, DataTypes } = require('sequelize');
require('dotenv').config();

// Initialiser Sequelize avec l'URL de la base de données
const sequelize = new Sequelize(process.env.DB_URL, {
  logging: process.env.NODE_ENV === 'development',
  dialect: 'mysql',
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  }
});

// Définir les modèles
const db = {};
db.sequelize = sequelize;
db.Sequelize = Sequelize;

// Importer les modèles
db.Product = require('./product')(sequelize, DataTypes);
db.Transaction = require('./transaction')(sequelize, DataTypes);

// Définir les relations
db.Transaction.belongsTo(db.Product, { foreignKey: 'productId' });
db.Product.hasMany(db.Transaction, { foreignKey: 'productId' });

module.exports = db;