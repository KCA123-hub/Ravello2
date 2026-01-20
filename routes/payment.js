const express = require('express');
const verifyToken = require('../middleware/auth'); 

module.exports = (con) => {
    const router = express.Router();

    router.post('/confirm', verifyToken, async (req, res) => {
        const client_id = req.clientId;
        const { order_id, transaction_details } = req.body; 

        if (!order_id) {
            return res.status(400).json({ message: 'Order ID wajib diisi untuk konfirmasi pembayaran.' });
        }

        let client;

        try {
            client = await con.connect();
            await client.query('BEGIN');

            const orderResult = await client.query(
                `SELECT status, total_price FROM "order" 
                 WHERE order_id = $1 AND client_id = $2`,
                [order_id, client_id]
            );

            if (orderResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ message: 'Pesanan tidak ditemukan atau bukan milik Anda.' });
            }

            const currentStatus = orderResult.rows[0].status;
  
            if (currentStatus === 'paid' || currentStatus === 'completed') {
                await client.query('ROLLBACK');
                return res.status(400).json({ message: `Pesanan ID ${order_id} sudah diproses atau dibayar.` });
            }
   
            await client.query(
                `UPDATE "order" SET status = $1, payment_date = NOW() WHERE order_id = $2`,
                ['paid', order_id]
            );

            await client.query('COMMIT');
            
            console.log(`✅ [PAYMENT] Order ID ${order_id} berhasil dikonfirmasi dan status diubah menjadi 'paid'.`);

            res.status(200).json({
                success: true,
                message: 'Konfirmasi pembayaran berhasil. Pesanan Anda akan segera diproses.',
                order_id: order_id,
                new_status: 'paid'
            });

        } catch (err) {
            if (client) {
                await client.query('ROLLBACK');
            }
            console.error('Payment Confirmation Error:', err.stack);
            res.status(500).json({ message: 'Gagal memproses konfirmasi pembayaran.' });
        } finally {
            if (client) {
                client.release();
            }
        }
    });

    return router;
};