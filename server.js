const jsonServer = require('json-server');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const server = jsonServer.create();
const router = jsonServer.router('db.json');
const middlewares = jsonServer.defaults();

// Activer CORS pour que le frontend puisse appeler l'API
server.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

server.use(middlewares);

// ============================================
// ENDPOINTS CUSTOM : VUES ET LIKES
// ============================================

// 🔥 GET /articles/:id/view - Incrémenter les vues
server.get('/articles/:id/view', (req, res) => {
  const db = router.db;
  const article = db.get('articles').find({ id: parseInt(req.params.id) }).value();

  if (!article) {
    return res.status(404).json({ error: 'Article non trouvé' });
  }

  const currentViews = article.views || 0;
  db.get('articles')
    .find({ id: parseInt(req.params.id) })
    .assign({ views: currentViews + 1 })
    .write();

  res.json({ 
    id: article.id, 
    views: currentViews + 1,
    message: 'Vue comptabilisée'
  });
});

// ❤️ POST /articles/:id/like - Ajouter un like (1 par IP)
server.post('/articles/:id/like', (req, res) => {
  const db = router.db;
  const article = db.get('articles').find({ id: parseInt(req.params.id) }).value();

  if (!article) {
    return res.status(404).json({ error: 'Article non trouvé' });
  }

  const userIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
  const likedIPs = article.likedIPs || [];

  // Vérifier si cette IP a déjà liké
  if (likedIPs.includes(userIP)) {
    return res.status(400).json({ 
      error: 'Déjà liké',
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
    message: 'Like ajouté'
  });
});

// 📊 GET /stats - Statistiques globales (pour l'admin)
server.get('/stats', (req, res) => {
  const db = router.db;
  const articles = db.get('articles').value() || [];

  const totalViews = articles.reduce((sum, a) => sum + (a.views || 0), 0);
  const totalLikes = articles.reduce((sum, a) => sum + (a.likes || 0), 0);
  const totalArticles = articles.length;

  // Articles publiés aujourd'hui
  const today = new Date().toISOString().split('T')[0];
  const todayArticles = articles.filter(a => {
    const articleDate = new Date(a.date_publication).toISOString().split('T')[0];
    return articleDate === today;
  }).length;

  // Articles cette semaine
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const weekArticles = articles.filter(a => {
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
// ROUTER JSON SERVER (articles CRUD)
// ============================================
server.use(router);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('🚀 UCO Backend API running on port ' + PORT);
  console.log('📰 Articles endpoint: http://localhost:' + PORT + '/articles');
  console.log('👁️  Views endpoint: GET /articles/:id/view');
  console.log('❤️  Likes endpoint: POST /articles/:id/like');
  console.log('📊 Stats endpoint: GET /stats');
});
