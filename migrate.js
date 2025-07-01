require('dotenv').config();
const { Sequelize, DataTypes } = require('sequelize');
const fs = require('fs');
const path = require('path');

// Initialiser Sequelize avec l'URL de la DB
const sequelize = new Sequelize(process.env.DB_URL, {
  logging: false // Mettre à true pour voir les requêtes SQL
});

// Importer les modèles
const Product = require('./models/product')(sequelize, DataTypes);
const Transaction = require('./models/transaction')(sequelize, DataTypes);

// Relations entre modèles (si nécessaire)
Transaction.belongsTo(Product, { foreignKey: 'productId' });
Product.hasMany(Transaction, { foreignKey: 'productId' });

async function runMigrations() {
  try {
    // Tester la connexion
    await sequelize.authenticate();
    console.log('Connexion à MySQL établie avec succès.');

    // Synchroniser les modèles avec la base de données
    // force: true va supprimer et recréer les tables (À utiliser avec précaution!)
    await sequelize.sync({ force: false });
    console.log('Tables synchronisées avec succès.');

    // Vérifier si des données initiales sont nécessaires
    const productCount = await Product.count();
    
    if (productCount === 0) {
      console.log('Insertion de produits de test...');
      
      // Insertion de données de test
      await Product.bulkCreate([
        {
          name: 'T-shirt MonCash',
          price: 500,
          description: 'T-shirt avec logo MonCash',
          imageUrl: 'https://via.placeholder.com/150'
        },
        {
          name: 'Casquette Digicel',
          price: 300,
          description: 'Casquette rouge Digicel',
          imageUrl: 'https://via.placeholder.com/150'
        },
        {
          name: 'Recharge téléphonique',
          price: 100,
          description: 'Recharge de 100 HTG',
          imageUrl: 'https://via.placeholder.com/150'
        }
      ]);
      
      console.log('Produits de test insérés avec succès.');
    }

    console.log('Migration terminée avec succès!');
    process.exit(0);
  } catch (error) {
    console.error('Erreur lors de la migration:', error);
    process.exit(1);
  }
}

runMigrations();