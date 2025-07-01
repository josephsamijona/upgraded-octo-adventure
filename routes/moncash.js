const express = require('express');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const db = require('../models');
const { Transaction, Product } = db;

// Utilitaire pour obtenir un token d'accès MonCash
async function getMonCashToken() {
  try {
    const auth = Buffer.from(
      `${process.env.MONCASH_CLIENT_ID}:${process.env.MONCASH_CLIENT_SECRET}`
    ).toString('base64');

    const response = await axios.post(
      `${process.env.MONCASH_API_BASE}/oauth/token`,
      'scope=read,write&grant_type=client_credentials',
      {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    return response.data.access_token;
  } catch (error) {
    console.error('Erreur d\'authentification MonCash:', error.response?.data || error.message);
    throw new Error('Échec de l\'authentification MonCash');
  }
}

// Route pour créer un paiement
router.post('/payment', async (req, res) => {
  try {
    const { amount, description, productId } = req.body;

    // Validation des données
    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Montant invalide'
      });
    }

    // Générer un ID de commande unique
    const orderId = uuidv4();

    // Créer la transaction en base de données
    const transaction = await Transaction.create({
      orderId,
      amount: parseInt(amount),
      description: description || 'Achat via MonCash',
      productId: productId || null,
      status: 'pending'
    });

    // Obtenir un token d'accès
    const accessToken = await getMonCashToken();

    // Créer le paiement MonCash
    const response = await axios.post(
      `${process.env.MONCASH_API_BASE}/v1/CreatePayment`,
      {
        amount: parseInt(amount),
        orderId: orderId
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // Récupérer le token de paiement
    const { payment_token } = response.data;
    
    // Construire l'URL de redirection
    const redirectUrl = `${process.env.MONCASH_GATEWAY_BASE}/Payment/Redirect?token=${payment_token.token}`;

    // Stocker les informations en session
    req.session.pendingPayment = {
      orderId,
      amount: parseInt(amount),
      description,
      productId
    };

    res.status(200).json({
      success: true,
      redirectUrl,
      orderId,
      token: payment_token.token
    });

  } catch (error) {
    console.error('Erreur création paiement:', error.response?.data || error.message);
    
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la création du paiement',
      details: error.response?.data?.message || error.message
    });
  }
});

// Return URL - Page de notification après paiement
router.get('/return', async (req, res) => {
  const { transactionId } = req.query;
  let transaction = null;
  let payment = null;
  
  try {
    if (transactionId) {
      // Vérifier la transaction avec l'API MonCash
      const accessToken = await getMonCashToken();
      
      const response = await axios.post(
        `${process.env.MONCASH_API_BASE}/v1/RetrieveTransactionPayment`,
        { transactionId },
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      payment = response.data.payment;
      
      // Mettre à jour la transaction en base de données
      if (payment && payment.reference) {
        transaction = await Transaction.findOne({ 
          where: { orderId: payment.reference },
          include: [{ model: Product }]
        });
        
        if (transaction) {
          await transaction.update({
            transactionId: payment.transaction_id,
            status: payment.message === 'successful' ? 'successful' : 'pending',
            payerPhone: payment.payer || '',
            paymentDetails: payment
          });
        }
      }
    }

    // Rendre la page de détails de transaction
    res.render('transaction', {
      transactionId,
      payment,
      transaction: transaction ? transaction.toJSON() : null
    });
    
  } catch (error) {
    console.error('Erreur Return URL:', error);
    res.render('transaction', {
      error: 'Erreur lors de la vérification du paiement',
      transactionId,
      payment: null,
      transaction: null
    });
  }
});

// Alert URL - Webhook MonCash
router.post('/webhook', async (req, res) => {
  // Enregistrer les données du webhook
  console.log('Webhook MonCash reçu:', JSON.stringify(req.body, null, 2));
  
  try {
    const webhookData = req.body;
    
    // Répondre rapidement pour confirmer la réception
    res.status(200).json({ success: true });
    
    // Traitement asynchrone du webhook
    if (webhookData && webhookData.reference) {
      const transaction = await Transaction.findOne({ 
        where: { orderId: webhookData.reference }
      });
      
      if (transaction) {
        await transaction.update({
          transactionId: webhookData.transaction_id,
          status: webhookData.message === 'successful' ? 'successful' : 'pending',
          payerPhone: webhookData.payer || '',
          paymentDetails: webhookData
        });
        
        console.log(`Transaction ${transaction.orderId} mise à jour via webhook`);
      }
    }
  } catch (error) {
    console.error('Erreur traitement webhook:', error);
    // Ne pas renvoyer d'erreur au client, le webhook a déjà été confirmé
  }
});

// Page de succès
router.get('/success', (req, res) => {
  res.sendFile('success.html', { root: './public' });
});

// Vérifier une transaction par ID
router.get('/transaction/:transactionId', async (req, res) => {
  try {
    const { transactionId } = req.params;
    
    const accessToken = await getMonCashToken();
    
    const response = await axios.post(
      `${process.env.MONCASH_API_BASE}/v1/RetrieveTransactionPayment`,
      { transactionId },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    res.status(200).json({
      success: true,
      payment: response.data.payment
    });
  } catch (error) {
    console.error('Erreur vérification transaction:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur de vérification de transaction'
    });
  }
});

// Vérifier une transaction par orderId
router.get('/order/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    
    const accessToken = await getMonCashToken();
    
    const response = await axios.post(
      `${process.env.MONCASH_API_BASE}/v1/RetrieveOrderPayment`,
      { orderId },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    res.status(200).json({
      success: true,
      payment: response.data.payment
    });
  } catch (error) {
    console.error('Erreur vérification ordre:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur de vérification de commande'
    });
  }
});

// Tester la connexion MonCash
router.get('/test', async (req, res) => {
  try {
    const accessToken = await getMonCashToken();
    
    res.json({
      success: true,
      message: 'Connexion MonCash réussie',
      mode: process.env.MONCASH_MODE
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Erreur de connexion MonCash',
      details: error.message
    });
  }
});

module.exports = router;