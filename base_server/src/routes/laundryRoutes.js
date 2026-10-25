const express = require('express');
const router = express.Router();
const c = require('../controllers/laundryController');

for (const name of ['pelanggan', 'layanan']) {
  router.get(`/${name}`,        c[name].list);
  router.get(`/${name}/:id`,    c[name].get);
  router.post(`/${name}`,       c[name].create);
  router.put(`/${name}/:id`,    c[name].update);
  router.delete(`/${name}/:id`, c[name].remove);
}

router.get('/pesanan',               c.pesanan.list);
router.get('/pesanan/:id',           c.pesanan.get);
router.post('/pesanan',              c.pesanan.create);
router.put('/pesanan/:id',           c.pesanan.update);
router.patch('/pesanan/:id/status',  c.pesanan.setStatus);
router.delete('/pesanan/:id',        c.pesanan.remove);

router.get('/dashboard', c.dashboard);

module.exports = router;
