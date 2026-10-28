const jwt = require('jsonwebtoken');
const supabase = require('./supabase');

function safeUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, created_at: user.created_at };
}

async function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return res.status(401).json({ error: 'Please sign in to continue.' });
  try {
    const payload = jwt.verify(match[1], process.env.JWT_SECRET, { algorithms: ['HS256'] });
    const { data: user, error } = await supabase.from('app_users')
      .select('id,name,email,role,created_at').eq('id', payload.sub).maybeSingle();
    if (error || !user) return res.status(401).json({ error: 'Your session is no longer valid. Please sign in again.' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Your session is invalid or has expired. Please sign in again.' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Administrator permission is required.' });
  next();
}

module.exports = { jwt, safeUser, requireAuth, requireAdmin };
