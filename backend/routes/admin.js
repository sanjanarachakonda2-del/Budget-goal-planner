const express = require('express');
const supabase = require('../supabase');
const { requireAuth, requireAdmin } = require('../auth');
const router = express.Router();
router.use(requireAuth, requireAdmin);

router.get('/users', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('app_users')
      .select('id,name,email,role,created_at').order('created_at', { ascending: false }).limit(500);
    if (error) return next(error);
    res.json({ users: data });
  } catch (error) { next(error); }
});

module.exports = router;
