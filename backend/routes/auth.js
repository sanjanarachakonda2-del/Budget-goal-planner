const express = require('express');
const bcrypt = require('bcryptjs');
const { jwt, safeUser, requireAuth } = require('../auth');
const supabase = require('../supabase');

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function cleanText(value) { return typeof value === 'string' ? value.trim() : ''; }
function issueToken(user) {
  return jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '8h' });
}

router.post('/signup', async (req, res, next) => {
  try {
    const name = cleanText(req.body.name);
    const email = cleanText(req.body.email).toLowerCase();
    const password = req.body.password;
    if (name.length < 2 || name.length > 80) return res.status(400).json({ error: 'Name must be between 2 and 80 characters.' });
    if (email.length > 254 || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (typeof password !== 'string' || password.length < 8 || password.length > 72) return res.status(400).json({ error: 'Password must be between 8 and 72 characters.' });
    if (email === String(process.env.ADMIN_EMAIL || '').toLowerCase()) return res.status(409).json({ error: 'This email is reserved for the administrator account.' });
    const { data: existing, error: lookupError } = await supabase.from('app_users').select('id').eq('email', email).maybeSingle();
    if (lookupError) return next(lookupError);
    if (existing) return res.status(409).json({ error: 'An account with this email already exists.' });
    const password_hash = await bcrypt.hash(password, 12);
    const { data: user, error } = await supabase.from('app_users')
      .insert({ name, email, password_hash, role: 'user' })
      .select('id,name,email,role,created_at').single();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'An account with this email already exists.' });
      return next(error);
    }
    return res.status(201).json({ token: issueToken(user), user: safeUser(user) });
  } catch (error) { next(error); }
});

router.post('/signin', async (req, res, next) => {
  try {
    const email = cleanText(req.body.email).toLowerCase();
    const password = req.body.password;
    if (!EMAIL_RE.test(email) || typeof password !== 'string' || !password) return res.status(400).json({ error: 'Enter your email and password.' });
    const { data: user, error } = await supabase.from('app_users')
      .select('id,name,email,role,created_at,password_hash').eq('email', email).maybeSingle();
    if (error) return next(error);
    const passwordOk = user ? await bcrypt.compare(password, user.password_hash) : false;
    if (!user || !passwordOk) return res.status(401).json({ error: 'Email or password is incorrect.' });
    return res.json({ token: issueToken(user), user: safeUser(user) });
  } catch (error) { next(error); }
});

router.get('/me', requireAuth, (req, res) => res.json({ user: safeUser(req.user) }));

module.exports = router;
