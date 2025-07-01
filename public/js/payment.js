/**
 * MonCash Payment Handler
 * Gère l'intégration côté client avec l'API MonCash
 */
class MonCashPayment {
  constructor() {
    this.form = document.getElementById('paymentForm');
    this.statusElement = document.getElementById('paymentStatus');
    this.testButton = document.getElementById('testConnection');
    this.apiBase = '/api/moncash';
    this.productId = null;
    
    this.init();
  }
  
  /**
   * Initialiser les événements et vérifier les paramètres URL
   */
  init() {
    // Vérifier si un productId est présent dans l'URL
    const urlParams = new URLSearchParams(window.location.search);
    this.productId = urlParams.get('productId');
    
    // Vérifier si on revient d'un paiement
    const status = urlParams.get('status');
    const transactionId = urlParams.get('transactionId');
    
    if (status === 'success' && transactionId) {
      this.verifyTransaction(transactionId);
    } else if (status === 'cancelled') {
      this.showStatus('Paiement annulé', 'warning');
    }
    
    // Si un productId est spécifié, charger les détails du produit
    if (this.productId) {
      this.loadProductDetails();
    }
    
    // Ajouter les listeners d'événements
    if (this.form) {
      this.form.addEventListener('submit', this.handlePayment.bind(this));
    }
    
    if (this.testButton) {
      this.testButton.addEventListener('click', this.testConnection.bind(this));
    }
  }
  
  /**
   * Charger les détails d'un produit
   */
  async loadProductDetails() {
    try {
      const response = await fetch(`/api/products/${this.productId}`);
      const data = await response.json();
      
      if (data.success && data.product) {
        const product = data.product;
        
        // Mettre à jour les champs du formulaire
        const amountField = document.getElementById('amount');
        const descriptionField = document.getElementById('description');
        
        if (amountField) {
          amountField.value = product.price;
          amountField.disabled = true;
        }
        
        if (descriptionField) {
          descriptionField.value = product.name;
          descriptionField.disabled = true;
        }
        
        // Afficher les détails du produit
        const productDetails = document.createElement('div');
        productDetails.className = 'product-details';
        productDetails.innerHTML = `
          <h3>${product.name}</h3>
          <p>${product.description}</p>
          ${product.imageUrl ? `<img src="${product.imageUrl}" alt="${product.name}" class="product-image">` : ''}
          <p class="product-price">${product.price} HTG</p>
        `;
        
        // Insérer avant le formulaire
        this.form.parentNode.insertBefore(productDetails, this.form);
      }
    } catch (error) {
      console.error('Erreur lors du chargement du produit:', error);
      this.showStatus('Erreur lors du chargement du produit', 'error');
    }
  }
  
  /**
   * Gérer la soumission du formulaire de paiement
   * @param {Event} event - L'événement de soumission
   */
  async handlePayment(event) {
    event.preventDefault();
    
    const amount = document.getElementById('amount').value;
    const description = document.getElementById('description').value || 'Paiement MonCash';
    
    // Validation de base
    if (!amount || isNaN(amount) || parseInt(amount) <= 0) {
      this.showStatus('Veuillez entrer un montant valide', 'error');
      return;
    }
    
    // Désactiver le bouton et afficher le chargement
    this.toggleLoading(true, 'payButton');
    this.showStatus('Création du paiement en cours...', 'loading');
    
    try {
      const response = await fetch(`${this.apiBase}/payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: parseInt(amount),
          description,
          productId: this.productId
        })
      });
      
      const data = await response.json();
      
      if (data.success && data.redirectUrl) {
        // Stocker l'orderId dans localStorage pour vérification ultérieure
        localStorage.setItem('moncash_orderId', data.orderId);
        
        this.showStatus('Redirection vers MonCash...', 'success');
        
        // Rediriger vers la page de paiement MonCash
        setTimeout(() => {
          window.location.href = data.redirectUrl;
        }, 1000);
      } else {
        this.showStatus(`Erreur: ${data.error || 'Erreur lors de la création du paiement'}`, 'error');
        this.toggleLoading(false, 'payButton');
      }
    } catch (error) {
      console.error('Erreur de paiement:', error);
      this.showStatus('Erreur de connexion au serveur', 'error');
      this.toggleLoading(false, 'payButton');
    }
  }
  
  /**
   * Vérifier une transaction par ID
   * @param {string} transactionId - ID de transaction MonCash
   */
  async verifyTransaction(transactionId) {
    this.showStatus('Vérification de la transaction...', 'loading');
    
    try {
      const response = await fetch(`${this.apiBase}/transaction/${transactionId}`);
      const data = await response.json();
      
      if (data.success && data.payment) {
        const payment = data.payment;
        const isSuccessful = payment.message === 'successful';
        
        if (isSuccessful) {
          this.showStatus('Paiement effectué avec succès!', 'success');
        } else {
          this.showStatus('Paiement en cours de traitement', 'warning');
        }
      } else {
        this.showStatus('Impossible de vérifier la transaction', 'error');
      }
    } catch (error) {
      console.error('Erreur de vérification:', error);
      this.showStatus('Erreur lors de la vérification de la transaction', 'error');
    }
  }
  
  /**
   * Tester la connexion à l'API MonCash
   */
  async testConnection() {
    this.toggleLoading(true, 'testConnection');
    
    try {
      const response = await fetch(`${this.apiBase}/test`);
      const data = await response.json();
      
      if (data.success) {
        this.showStatus(`Connexion MonCash réussie! Mode: ${data.mode}`, 'success');
      } else {
        this.showStatus(`Erreur de connexion: ${data.error}`, 'error');
      }
    } catch (error) {
      console.error('Erreur de test:', error);
      this.showStatus('Erreur de connexion au serveur', 'error');
    } finally {
      this.toggleLoading(false, 'testConnection');
    }
  }
  
  /**
   * Afficher un message de statut
   * @param {string} message - Message à afficher
   * @param {string} type - Type de message (success, error, warning, loading)
   */
  showStatus(message, type = 'info') {
    if (!this.statusElement) return;
    
    this.statusElement.textContent = message;
    this.statusElement.className = `status-message ${type}`;
    this.statusElement.style.display = 'block';
    
    // Masquer automatiquement les messages de succès après 5 secondes
    if (type === 'success') {
      setTimeout(() => {
        this.statusElement.style.display = 'none';
      }, 5000);
    }
  }
  
  /**
   * Activer/désactiver l'état de chargement sur un bouton
   * @param {boolean} isLoading - État de chargement
   * @param {string} buttonId - ID du bouton
   */
  toggleLoading(isLoading, buttonId) {
    const button = document.getElementById(buttonId);
    if (!button) return;
    
    if (isLoading) {
      // Sauvegarder le texte original
      button.dataset.originalText = button.textContent;
      button.disabled = true;
      button.innerHTML = '<span class="spinner"></span> Chargement...';
    } else {
      button.disabled = false;
      button.textContent = button.dataset.originalText || 'Payer';
      delete button.dataset.originalText;
    }
  }
}

// Initialiser le gestionnaire de paiement
document.addEventListener('DOMContentLoaded', () => {
  new MonCashPayment();
});