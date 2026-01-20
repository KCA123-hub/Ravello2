const express = require('express');
const verifyToken = require('../middleware/auth');

module.exports = (con) => {
    const router = express.Router();

    router.post('/', verifyToken, async (req, res) => {
        const client_id = req.clientId;
        const { product_id } = req.body;

        console.log('[DEBUG CART]');
        console.log('CLIENT ID =>', client_id);
        console.log('PRODUCT ID =>', product_id);

        if (!product_id) {
            return res.status(400).json({
                success: false,
                message: 'product_id wajib diisi'
            });
        }

        try {
            const existingItem = await con.query(
                'SELECT cart_id, quantity FROM cart WHERE client_id = $1 AND product_id = $2',
                [client_id, product_id]
            );

            if (existingItem.rows.length > 0) {

                const update = await con.query(
                    'UPDATE cart SET quantity = quantity + 1 WHERE cart_id = $1 RETURNING cart_id',
                    [existingItem.rows[0].cart_id]
                );

                return res.status(200).json({
                    success: true,
                    message: 'Kuantitas produk diperbarui',
                    cart_id: update.rows[0].cart_id
                });

            } else {

                const insert = await con.query(
                    `INSERT INTO cart (client_id, product_id, quantity, added_date)
                     VALUES ($1, $2, 1, NOW())
                     RETURNING cart_id`,
                    [client_id, product_id]
                );

                return res.status(201).json({
                    success: true,
                    message: 'Produk berhasil dimasukkan ke keranjang',
                    cart_id: insert.rows[0].cart_id
                });
            }

        } catch (err) {
            console.error("CART ERROR =>", err);
            res.status(500).json({
                success: false,
                message: 'Server error'
            });
        }
    });

    router.get('/', verifyToken, async (req, res) => {
        const client_id = req.clientId;

        try {
            const cart = await con.query(
                `SELECT c.cart_id, c.quantity, c.added_date,
                        p.product_id, p.product_name, p.price
                 FROM cart c
                 JOIN product p ON c.product_id = p.product_id
                 WHERE c.client_id = $1
                 ORDER BY c.added_date DESC`,
                [client_id]
            );

            res.json(cart.rows);

        } catch (err) {
            console.error(err);
            res.status(500).json({ message: 'Server error' });
        }
    });

    router.delete('/:cart_id', verifyToken, async (req, res) => {
        const { cart_id } = req.params;
        const client_id = req.clientId;

        try {
            const result = await con.query(
                'DELETE FROM cart WHERE cart_id = $1 AND client_id = $2',
                [cart_id, client_id]
            );

            if (result.rowCount === 0) {
                return res.status(404).json({ message: 'Item tidak ditemukan' });
            }

            res.json({ success: true, message: 'Item berhasil dihapus' });

        } catch (err) {
            console.error(err);
            res.status(500).json({ message: 'Server error' });
        }
    });

    router.get('/summary', verifyToken, async (req, res) => {
        const client_id = req.clientId;

        try {
            const summary = await con.query(
                `SELECT 
                    SUM(c.quantity * p.price) AS total_harga, 
                    SUM(c.quantity) AS total_quantity 
                 FROM cart c
                 JOIN product p ON c.product_id = p.product_id
                 WHERE c.client_id = $1`,
                [client_id]
            );

            const s = summary.rows[0];

            if (!s.total_quantity) {
                return res.status(200).json({
                    success: true,
                    total_harga: 0,
                    total_quantity: 0,
                    message: 'Keranjang kosong'
                });
            }

            res.json({
                success: true,
                total_harga: parseFloat(s.total_harga).toFixed(2),
                total_quantity: parseInt(s.total_quantity),
                message: 'Ringkasan berhasil'
            });

        } catch (err) {
            console.error(err);
            res.status(500).json({ message: 'Server error' });
        }
    });

    return router;
};