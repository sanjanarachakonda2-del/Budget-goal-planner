require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const supabase = require('./supabase');
const authRoutes = require('./routes/auth');
const budgetRoutes = require('./routes/budgets');
const expenseRoutes = require('./routes/expenses');
const adminRoutes = require('./routes/admin');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || process.env.JWT_SECRET.includes('REPLACE_WITH')) {
  throw new Error('Set JWT_SECRET to a random secret of at least 32 characters in backend/.env.');
}

const app = express();
const port = Number(process.env.PORT) || 3000;
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: { directives: {
  defaultSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'], scriptSrc: ["'self'"],
  imgSrc: ["'self'", 'data:'], connectSrc: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"]
} } }));
// Same-origin hosting is the default. CORS is kept disabled unless a separate local origin is explicitly configured.
if (process.env.CORS_ORIGIN) app.use(cors({ origin: process.env.CORS_ORIGIN, credentials: false }));
app.use(express.json({ limit: '20kb' }));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many authentication attempts. Try again in 15 minutes.' } });
app.use('/api/auth/signin', authLimiter);
app.use('/api/auth/signup', authLimiter);

app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'Budget Goal Planner API' }));
app.use('/api/auth', authRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/admin', adminRoutes);

app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.get(/.*/, (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

app.use((req, res) => res.status(404).json({ error: 'Route not found.' }));
app.use((error, req, res, _next) => {
  // Do not expose database errors, stack traces, or secret values to clients.
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.path}:`, error.message);
  res.status(500).json({ error: 'An unexpected server error occurred. Check the server terminal for details.' });
});

async function ensureAdmin() {
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 8 || password.includes('SET_THE_ADMIN_PASSWORD')) {
    console.warn('Admin bootstrap skipped: set ADMIN_EMAIL and ADMIN_PASSWORD in backend/.env to create the administrator account.');
    return;
  }
  const { data: existing, error: lookupError } = await supabase.from('app_users').select('id,email,role').eq('email', email).maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) {
    if (existing.role !== 'admin') {
      const { error } = await supabase.from('app_users').update({ role: 'admin' }).eq('id', existing.id);
      if (error) throw error;
    }
    console.log(`Administrator account is ready: ${email}`);
    return;
  }
  const password_hash = await bcrypt.hash(password, 12);
  const { error } = await supabase.from('app_users').insert({ name: 'Administrator', email, password_hash, role: 'admin' });
  if (error && error.code !== '23505') throw error;
  console.log(`Administrator account is ready: ${email}`);
}

async function start() {
  try {
    await ensureAdmin();
    app.listen(port, () => console.log(`Budget Goal Planner is running at http://localhost:${port}`));
  } catch (error) {
    console.error('Startup failed. Check Supabase URL/key and confirm database/schema.sql was executed.', error.message);
    process.exit(1);
  }
}
if (require.main === module) start();
module.exports = { app, ensureAdmin };
