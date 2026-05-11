const jsonServer = require('json-server');
const cors = require('cors');

const server = jsonServer.create();
const router = jsonServer.router('db.json');
const middlewares = jsonServer.defaults();

server.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

server.use(middlewares);

// ============================================
// FONCTION : Date du jour en RDC (UTC+2)
// ============================================
function getTodayRDC() {
  const now = new Date();
  const rdcOffset = 2 * 60 * 60 * 1000;
  const rdcTime = new Date(now.getTime() + rdcOffset);
  return rdcTime.toISOString().split('T')[0];
}

function getNowRDC() {
  const now = new Date();
  const rdcOffset = 2 * 60 * 60 * 1000;
  return new Date(now.getTime() + rdcOffset).toISOString();
}

// ============================================
// POST /articles/:id/view - Incrementer les vues
// ============================================
server.post('/articles/:id/view', (req, res) => {
  const db = router.db;
  const article = db.get('articles').find({ id: parseInt(req.params.id) }).value();

  if (!article) {
    return res.status(404).json({ error: 'Article non trouve' });
  }

  const currentViews = article.views || 0;
  db.get('articles')
    .find({ id: parseInt(req.params.id) })
    .assign({ views: currentViews + 1 })
    .write();

  res.json({ 
    id: article.id, 
    views: currentViews + 1,
    message: 'Vue comptabilisee'
  });
});

// ============================================
// POST /articles/:id/like - Ajouter un like (1 par IP)
// ============================================
server.post('/articles/:id/like', (req, res) => {
  const db = router.db;
  const article = db.get('articles').find({ id: parseInt(req.params.id) }).value();

  if (!article) {
    return res.status(404).json({ error: 'Article non trouve' });
  }

  const userIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
  const likedIPs = article.likedIPs || [];

  if (likedIPs.includes(userIP)) {
    return res.status(400).json({ 
      error: 'Deja like',
      likes: article.likes || 0,
      alreadyLiked: true
    });
  }

  const currentLikes = article.likes || 0;
  likedIPs.push(userIP);

  db.get('articles')
    .find({ id: parseInt(req.params.id) })
    .assign({ 
      likes: currentLikes + 1,
      likedIPs: likedIPs
    })
    .write();

  res.json({ 
    id: article.id, 
    likes: currentLikes + 1,
    message: 'Like ajoute'
  });
});

// ============================================
// GET /stats - Statistiques globales
// ============================================
server.get('/stats', (req, res) => {
  const db = router.db;
  const articles = db.get('articles').value() || [];

  const totalViews = articles.reduce((sum, a) => sum + (a.views || 0), 0);
  const totalLikes = articles.reduce((sum, a) => sum + (a.likes || 0), 0);
  const totalArticles = articles.length;

  const today = getTodayRDC();
  const todayArticles = articles.filter(a => {
    if (!a.date_publication) return false;
    const articleDate = a.date_publication.split('T')[0];
    return articleDate === today;
  }).length;

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const weekArticles = articles.filter(a => {
    if (!a.date_publication) return false;
    return new Date(a.date_publication) >= oneWeekAgo;
  }).length;

  res.json({
    totalArticles,
    todayArticles,
    weekArticles,
    totalViews,
    totalLikes
  });
});

// ============================================
// MESSAGES CONTACT - NOUVEAU
// ============================================

// POST /messages - Envoyer un message (depuis contact.html)
server.post('/messages', (req, res) => {
  const db = router.db;
  const message = req.body;

  // Validation
  if (!message.nom || !message.prenom || !message.email || !message.sujet || !message.message) {
    return res.status(400).json({ 
      success: false, 
      message: 'Nom, prenom, email, sujet et message sont obligatoires' 
    });
  }

  const newMessage = {
    id: Date.now(),
    nom: message.nom,
    prenom: message.prenom,
    email: message.email,
    telephone: message.telephone || '',
    sujet: message.sujet,
    message: message.message,
    statut: 'non_lu',
    date_envoi: getNowRDC(),
    date_lecture: null,
    reponse: null,
    date_reponse: null
  };

  db.get('messages').push(newMessage).write();

  res.json({
    success: true,
    message: 'Message envoye avec succes',
    data: newMessage
  });
});

// GET /messages - Lister les messages (pour l'admin)
server.get('/messages', (req, res) => {
  const db = router.db;
  let messages = db.get('messages').value() || [];

  const statut = req.query.statut;
  const limit = parseInt(req.query.limit) || 50;
  const offset = parseInt(req.query.offset) || 0;

  // Filtrer par statut
  if (statut && ['non_lu', 'lu', 'repondu'].includes(statut)) {
    messages = messages.filter(m => m.statut === statut);
  }

  // Trier par date (plus recent d'abord)
  messages = messages.sort((a, b) => new Date(b.date_envoi) - new Date(a.date_envoi));

  // Pagination
  const totalMessages = messages.length;
  messages = messages.slice(offset, offset + limit);

  // Stats
  const allMessages = db.get('messages').value() || [];
  const stats = {
    total: allMessages.length,
    non_lu: allMessages.filter(m => m.statut === 'non_lu').length,
    lu: allMessages.filter(m => m.statut === 'lu').length,
    repondu: allMessages.filter(m => m.statut === 'repondu').length
  };

  res.json({
    success: true,
    message: totalMessages + ' message(s) trouve(s)',
    data: {
      messages,
      stats
    }
  });
});

// PUT /messages/:id - Marquer comme lu ou repondre
server.put('/messages/:id', (req, res) => {
  const db = router.db;
  const id = parseInt(req.params.id);
  const { action, reponse } = req.body;

  const message = db.get('messages').find({ id }).value();

  if (!message) {
    return res.status(404).json({ success: false, message: 'Message non trouve' });
  }

  if (action === 'lu') {
    db.get('messages')
      .find({ id })
      .assign({ statut: 'lu', date_lecture: getNowRDC() })
      .write();

    res.json({ success: true, message: 'Message marque comme lu' });
  } else if (action === 'repondu') {
    if (!reponse) {
      return res.status(400).json({ success: false, message: 'La reponse est obligatoire' });
    }
    db.get('messages')
      .find({ id })
      .assign({ statut: 'repondu', reponse, date_reponse: getNowRDC() })
      .write();

    res.json({ success: true, message: 'Reponse enregistree' });
  } else {
    res.status(400).json({ success: false, message: 'Action non reconnue' });
  }
});

// DELETE /messages/:id - Supprimer un message
server.delete('/messages/:id', (req, res) => {
  const db = router.db;
  const id = parseInt(req.params.id);

  const message = db.get('messages').find({ id }).value();

  if (!message) {
    return res.status(404).json({ success: false, message: 'Message non trouve' });
  }

  db.get('messages').remove({ id }).write();

  res.json({ success: true, message: 'Message supprime' });
});

// ============================================
// ROUTER JSON SERVER
// ============================================
server.use(router);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('🚀 UCO Backend API running on port ' + PORT);
  console.log('📰 Articles endpoint: GET/POST /articles');
  console.log('👁️  Views endpoint: POST /articles/:id/view');
  console.log('❤️  Likes endpoint: POST /articles/:id/like');
  console.log('📊 Stats endpoint: GET /stats');
  console.log('📧 Messages endpoint: GET/POST /messages');
  console.log('📧 Message detail: GET/PUT/DELETE /messages/:id');
});
