const express = require('express');
const verifyToken = require('../middleware/auth'); 

module.exports = (con) => {
    const router = express.Router();

    router.get('/', verifyToken, async (req, res) => {
        const client_id = req.clientId; 

        try {
            const query = `
                SELECT 
                    od.*, 
                    p.product_name, 
                    p.image_url 
                FROM order_detail od
                JOIN product p ON od.product_id = p.product_id
                WHERE od.client_id = $1
                ORDER BY od.order_detail_id DESC
            `;
            
            const result = await con.query(query, [client_id]);

            res.status(200).json({
                success: true,
                count: result.rows.length,
                data: result.rows
            });

        } catch (err) {
            console.error('Error fetching order details:', err);
            return res.status(500).json({ 
                success: false,
                message: 'Server error saat mengambil data' 
            });
        }
    });

    router.post('/', verifyToken, async (req, res) => {
        const { product_id, quantity } = req.body;
        const client_id = req.clientId; 
        
        if (!product_id || !quantity) {
            return res.status(400).json({
                success: false,
                message: 'product_id dan quantity wajib diisi'
            });
        }

        if (quantity <= 0) {
            return res.status(400).json({
                success: false,
                message: 'quantity harus lebih dari 0'
            });
        }

        try {
            const productResult = await con.query(
                `SELECT product_id, product_name, price
                 FROM product
                 WHERE product_id = $1`,
                [product_id]
            );

            if (productResult.rows.length === 0) {
                return res.status(404).json({ 
                    success: false,
                    message: 'Produk tidak ditemukan' 
                });
            }

            const product = productResult.rows[0];

            const unitPrice = Number(product.price);
            const qty = Number(quantity);
            const totalPrice = unitPrice * qty;

            return res.status(200).json({
                success: true,
                client_id, 
                product_id: product.product_id,
                product_name: product.product_name,
                unit_price: unitPrice,
                quantity: qty,
                total_price: totalPrice
            });

        } catch (err) {
            console.error('Error in /order-detail:', err);
            return res.status(500).json({ 
                success: false,
                message: 'Server error' 
            });
        }
    });

    return router;
};