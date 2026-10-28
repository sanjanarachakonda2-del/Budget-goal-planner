const express = require('express');
const supabase = require('../supabase');
const { requireAuth } = require('../auth');
const router = express.Router();
router.use(requireAuth);

function validMonth(value) { return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value); }
function validDate(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value; }
function clean(value) { return typeof value === 'string' ? value.trim() : ''; }
function validAmount(value) { return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 100000000; }

router.get('/', async (req, res, next) => {
  try {
    const month = req.query.month;
    if (!validMonth(month)) return res.status(400).json({ error: 'month must use YYYY-MM format.' });
    const start = `${month}-01`;
    const [year, mon] = month.split('-').map(Number);
    const endDate = new Date(Date.UTC(year, mon, 1)).toISOString().slice(0, 10);
    const { data, error } = await supabase.from('expenses')
      .select('id,description,category,amount,spent_on,created_at')
      .eq('user_id', req.user.id).gte('spent_on', start).lt('spent_on', endDate)
      .order('spent_on', { ascending: false }).order('created_at', { ascending: false });
    if (error) return next(error);
    res.json({ expenses: data });
  } catch (error) { next(error); }
});

router.post('/', async (req, res, next) => {
  try {
    const description = clean(req.body.description);
    const category = clean(req.body.category);
    const { amount, spent_on } = req.body;
    if (description.length < 1 || description.length > 120) return res.status(400).json({ error: 'Description must be between 1 and 120 characters.' });
    if (category.length < 1 || category.length > 50) return res.status(400).json({ error: 'Category must be between 1 and 50 characters.' });
    if (!validAmount(amount)) return res.status(400).json({ error: 'Expense amount must be a positive number up to 100,000,000.' });
    if (!validDate(spent_on)) return res.status(400).json({ error: 'Enter a valid expense date.' });
    const { data, error } = await supabase.from('expenses').insert({
      user_id: req.user.id, description, category, amount, spent_on
    }).select('id,description,category,amount,spent_on,created_at').single();
    if (error) return next(error);
    res.status(201).json({ expense: data });
  } catch (error) { next(error); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('expenses').delete().eq('id', req.params.id).eq('user_id', req.user.id).select('id').maybeSingle();
    if (error) return next(error);
    if (!data) return res.status(404).json({ error: 'Expense not found.' });
    res.json({ message: 'Expense deleted.' });
  } catch (error) { next(error); }
});

module.exports = router;
