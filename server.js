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
  // RDC = UTC+2 (heure d'été) ou UTC+1 (heure d'hiver)
  const rdcOffset = 2 * 60 * 60 * 1000; // 2 heures en ms
  const rdcTime = new Date(now.getTime() + rdcOffset);
  return rdcTime.toISOString().split('T')[0];
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
// GET /stats - Statistiques globales (CORRIGE AVEC DEBUG)
// ============================================
server.get('/stats', (req, res) => {
  const db = router.db;
  const articles = db.get('articles').value() || [];

  const totalViews = articles.reduce((sum, a) => sum + (a.views || 0), 0);
  const totalLikes = articles.reduce((sum, a) => sum + (a.likes || 0), 0);
  const totalArticles = articles.length;

  // Date aujourd'hui en RDC (UTC+2)
  const today = getTodayRDC();
  console.log('📅 Date RDC aujourd'hui :', today);
  console.log('📅 Date UTC aujourd'hui :', new Date().toISOString().split('T')[0]);

  // 🔥 CORRECTION : Comparer les dates correctement
  const todayArticles = articles.filter(a => {
    if (!a.date_publication) {
      console.log('   ⚠️ Article sans date :', a.id, a.titre);
      return false;
    }

    // Extraire juste la date (YYYY-MM-DD) de l'article
    const articleDate = a.date_publication.split('T')[0];
    const isToday = articleDate === today;

    console.log('   Article :', a.id, '| date :', articleDate, '| today :', today, '| match :', isToday);
    return isToday;
  }).length;

  // Articles cette semaine (7 derniers jours)
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const weekArticles = articles.filter(a => {
    if (!a.date_publication) return false;
    return new Date(a.date_publication) >= oneWeekAgo;
  }).length;

  console.log('📊 Stats finales :', { totalArticles, todayArticles, weekArticles, totalViews, totalLikes });

  res.json({
    totalArticles,
    todayArticles,
    weekArticles,
    totalViews,
    totalLikes
  });
});

// ============================================
// ROUTER JSON SERVER
// ============================================
server.use(router);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('🚀 UCO Backend API running on port ' + PORT);
  console.log('📰 Articles endpoint: http://localhost:' + PORT + '/articles');
  console.log('👁️  Views endpoint: POST /articles/:id/view');
  console.log('❤️  Likes endpoint: POST /articles/:id/like');
  console.log('📊 Stats endpoint: GET /stats');
});
