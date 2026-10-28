const express = require('express');
const supabase = require('../supabase');
const { requireAuth } = require('../auth');
const router = express.Router();
router.use(requireAuth);

function validMonth(value) { return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value); }
function validCategory(value) { return typeof value === 'string' && value.trim().length >= 1 && value.trim().length <= 50; }
function validAmount(value) { return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 100000000; }

router.get('/', async (req, res, next) => {
  try {
    const month = req.query.month;
    if (!validMonth(month)) return res.status(400).json({ error: 'month must use YYYY-MM format.' });
    const { data, error } = await supabase.from('budgets').select('id,category,amount,month,created_at,updated_at')
      .eq('user_id', req.user.id).eq('month', `${month}-01`).order('category');
    if (error) return next(error);
    res.json({ budgets: data });
  } catch (error) { next(error); }
});

router.post('/', async (req, res, next) => {
  try {
    const category = typeof req.body.category === 'string' ? req.body.category.trim() : '';
    const { amount } = req.body;
    const month = req.body.month;
    if (!validCategory(category)) return res.status(400).json({ error: 'Category must be between 1 and 50 characters.' });
    if (!validAmount(amount)) return res.status(400).json({ error: 'Budget amount must be a positive number up to 100,000,000.' });
    if (!validMonth(month)) return res.status(400).json({ error: 'month must use YYYY-MM format.' });
    const { data, error } = await supabase.from('budgets')
      .insert({ user_id: req.user.id, category, amount, month: `${month}-01` })
      .select('id,category,amount,month,created_at,updated_at').single();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'A budget for this category already exists in that month. Edit the existing budget instead.' });
      return next(error);
    }
    res.status(201).json({ budget: data });
  } catch (error) { next(error); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const { amount } = req.body;
    if (!validAmount(amount)) return res.status(400).json({ error: 'Budget amount must be a positive number up to 100,000,000.' });
    const { data, error } = await supabase.from('budgets').update({ amount }).eq('id', req.params.id).eq('user_id', req.user.id)
      .select('id,category,amount,month,created_at,updated_at').maybeSingle();
    if (error) return next(error);
    if (!data) return res.status(404).json({ error: 'Budget not found.' });
    res.json({ budget: data });
  } catch (error) { next(error); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('budgets').delete().eq('id', req.params.id).eq('user_id', req.user.id).select('id').maybeSingle();
    if (error) return next(error);
    if (!data) return res.status(404).json({ error: 'Budget not found.' });
    res.json({ message: 'Budget deleted.' });
  } catch (error) { next(error); }
});

module.exports = router;
