const jsonServer = require('json-server');
const cors = require('cors');

const server = jsonServer.create();
const router = jsonServer.router('db.json');
const middlewares = jsonServer.defaults();

// CORS
server.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

server.use(middlewares);

// ============================================
// ROUTES CUSTOM (articles uniquement)
// ============================================

function getTodayRDC() {
  const now = new Date();
  const rdcOffset = 2 * 60 * 60 * 1000;
  const rdcTime = new Date(now.getTime() + rdcOffset);
  return rdcTime.toISOString().split('T')[0];
}

// POST /articles/:id/view
server.post('/articles/:id/view', (req, res) => {
  const db = router.db;
  const article = db.get('articles').find({ id: parseInt(req.params.id) }).value();
  if (!article) return res.status(404).json({ error: 'Article non trouve' });

  const currentViews = article.views || 0;
  db.get('articles').find({ id: parseInt(req.params.id) }).assign({ views: currentViews + 1 }).write();
  res.json({ id: article.id, views: currentViews + 1 });
});

// POST /articles/:id/like
server.post('/articles/:id/like', (req, res) => {
  const db = router.db;
  const article = db.get('articles').find({ id: parseInt(req.params.id) }).value();
  if (!article) return res.status(404).json({ error: 'Article non trouve' });

  const userIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
  const likedIPs = article.likedIPs || [];

  if (likedIPs.includes(userIP)) {
    return res.status(400).json({ error: 'Deja like', likes: article.likes || 0 });
  }

  const currentLikes = article.likes || 0;
  likedIPs.push(userIP);
  db.get('articles').find({ id: parseInt(req.params.id) }).assign({ likes: currentLikes + 1, likedIPs }).write();
  res.json({ id: article.id, likes: currentLikes + 1 });
});

// GET /stats
server.get('/stats', (req, res) => {
  const db = router.db;
  const articles = db.get('articles').value() || [];
  const totalViews = articles.reduce((sum, a) => sum + (a.views || 0), 0);
  const totalLikes = articles.reduce((sum, a) => sum + (a.likes || 0), 0);
  const totalArticles = articles.length;
  const today = getTodayRDC();
  const todayArticles = articles.filter(a => a.date_publication && a.date_publication.split('T')[0] === today).length;
  const oneWeekAgo = new Date(); oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const weekArticles = articles.filter(a => a.date_publication && new Date(a.date_publication) >= oneWeekAgo).length;

  res.json({ totalArticles, todayArticles, weekArticles, totalViews, totalLikes });
});

// ============================================
// JSON SERVER ROUTER (gere /messages nativement)
// ============================================
server.use(router);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('🚀 UCO API running on port ' + PORT);
  console.log('📰 /articles - Articles');
  console.log('📧 /messages - Messages (json-server natif)');
  console.log('📊 /stats - Statistiques');
});
