// Importer les dépendances
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const session = require('express-session');
const helmet = require('helmet'); // Ajout pour la sécurité
const compression = require('compression'); // Ajout pour les performances
require('dotenv').config();

// Initialiser l'application Express
const app = express();
const PORT = process.env.PORT || 3000;

// Importer les modèles
const db = require('./models');

// Middlewares de sécurité et performance
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://moncashbutton.digicelgroup.com"],
      imgSrc: ["'self'", "https://moncashbutton.digicelgroup.com", "https://via.placeholder.com", "data:"],
      connectSrc: ["'self'", process.env.MONCASH_API_BASE, process.env.MONCASH_GATEWAY_BASE]
    }
  }
}));
app.use(compression()); // Compresser les réponses

// Configurer les middlewares
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d' // Cache des fichiers statiques pour 1 jour
}));

// Configurer EJS pour le rendu des vues
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Configurer les sessions
const sess = {
  secret: process.env.SESSION_SECRET || 'moncash-test-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    maxAge: 24 * 60 * 60 * 1000 // 24 heures
  }
};

// En production, utiliser cookies sécurisés et proxy pour HTTPS
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1); // Trust first proxy
  sess.cookie.secure = true; // Serve secure cookies
  sess.cookie.sameSite = 'none'; // Allow cross-site cookies for Railway
}

app.use(session(sess));

// Middleware pour exposer les informations MonCash et gérer BASE_URL
app.use((req, res, next) => {
  // Déterminer dynamiquement l'URL de base
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  
  const baseUrl = process.env.BASE_URL || `${protocol}://${host}`;
  
  res.locals.moncashMode = process.env.MONCASH_MODE;
  res.locals.baseUrl = baseUrl;
  
  // Exposer l'URL de base comme variable globale
  global.BASE_URL = baseUrl;
  
  next();
});

// Routes pour MonCash
const moncashRoutes = require('./routes/moncash');
app.use('/api/moncash', moncashRoutes);

// Route principale - page d'accueil
app.get('/', async (req, res) => {
  try {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  } catch (error) {
    console.error('Erreur page d\'accueil:', error);
    res.status(500).send('Erreur serveur');
  }
});

// Route pour la page de checkout
app.get('/checkout/:productId?', async (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'checkout.html'));
});

// API pour récupérer les produits
app.get('/api/products', async (req, res) => {
  try {
    const products = await db.Product.findAll({ 
      where: { active: true },
      order: [['price', 'ASC']]
    });
    
    res.json({ success: true, products });
  } catch (error) {
    console.error('Erreur récupération produits:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// API pour récupérer un produit par ID
app.get('/api/products/:id', async (req, res) => {
  try {
    const product = await db.Product.findByPk(req.params.id);
    
    if (!product) {
      return res.status(404).json({ success: false, error: 'Produit non trouvé' });
    }
    
    res.json({ success: true, product });
  } catch (error) {
    console.error('Erreur récupération produit:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// Gestion des erreurs 404
app.use((req, res, next) => {
  res.status(404).send('Page non trouvée');
});

// Gestion des erreurs
app.use((err, req, res, next) => {
  console.error('Erreur serveur:', err);
  res.status(500).send('Erreur serveur');
});

// Démarrer le serveur avec gestion des échecs de connexion à la DB
function startServer() {
  // Options de synchronisation adaptées à l'environnement
  const syncOptions = {
    // Pas d'ALTER TABLE en production
    alter: process.env.NODE_ENV === 'development'
  };
  
  db.sequelize.sync(syncOptions)
    .then(() => {
      app.listen(PORT, () => {
        console.log(`Serveur démarré sur le port ${PORT}`);
        console.log(`Mode: ${process.env.NODE_ENV}`);
        console.log(`Mode MonCash: ${process.env.MONCASH_MODE}`);
        console.log(`URL de base: ${global.BASE_URL}`);
      });
    })
    .catch(err => {
      console.error('Erreur de synchronisation avec la base de données:', err);
      // En production, retenter la connexion après un délai
      if (process.env.NODE_ENV === 'production') {
        console.log('Nouvelle tentative dans 5 secondes...');
        setTimeout(startServer, 5000);
      } else {
        process.exit(1);
      }
    });
}

// Démarrer l'application
startServer();

// Gérer les signaux pour arrêt propre
process.on('SIGTERM', () => {
  console.log('SIGTERM reçu. Arrêt gracieux...');
  db.sequelize.close().then(() => {
    console.log('Connexions DB fermées');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT reçu. Arrêt gracieux...');
  db.sequelize.close().then(() => {
    console.log('Connexions DB fermées');
    process.exit(0);
  });
});