require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initializeDatabase } = require('./src/config/database');
const testRoutes =  require('./src/routes/test')
const productRoutes = require('./src/routes/productRoutes');
const laundryRoutes = require('./src/routes/laundryRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

/* Middleware */
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* Root route */
app.get('/', (req, res) => {
  res.json({
    message: '🚀 Product API is running',
    endpoints: {
      'GET    /api/products':      'Ambil semua produk',
      'GET    /api/products/:id':  'Ambil produk by id',
      'POST   /api/products':      'Buat produk baru',
      'PUT    /api/products/:id':  'Update produk',
      'DELETE /api/products/:id':  'Hapus produk',
    },
  });
});

/* Routes */
app.use('/api/test', testRoutes)
app.use('/api/products', productRoutes);
app.use('/api', laundryRoutes);

/* 404 */
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Endpoint tidak ditemukan' });
});

/* Start */
(async () => {
  await initializeDatabase();
  app.listen(PORT, () => {
    console.log(`🚀 Server: http://localhost:${PORT}`);
  });
})();