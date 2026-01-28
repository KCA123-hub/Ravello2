const express = require('express');
const router = express.Router();

const verifyToken = require('../middleware/auth.js'); 
const verifyStoreOwner = require('../middleware/verifyStoreOwner'); 

module.exports = (con) => {
    
    // ============================================================
    // 1. ROUTE PROFILE (WAJIB DI ATAS AGAR TIDAK TERBENTUR :order_id)
    // ============================================================
    router.get('/profile', verifyToken, async (req, res) => {
        // Ambil store_id dari req (hasil ekstrak middleware auth.js)
        const store_id = req.storeId; 

        try {
            if (!store_id) {
                return res.status(404).send({ 
                    success: false, 
                    message: "Akses ditolak. ID Toko tidak ditemukan dalam token. Silakan login ulang." 
                });
            }

            // Ambil detail toko menggunakan JOIN untuk mendapatkan nama pemilik (client name)
            const storeQuery = `
                SELECT 
                    s.store_id, 
                    s.store_name, 
                    s.description, 
                    s.address, 
                    c.name AS owner_name,
                    c.client_id AS owner_id
                FROM store s
                JOIN client c ON s.client_id = c.client_id
                WHERE s.store_id = $1
            `;
            const result = await con.query(storeQuery, [store_id]);

            if (result.rows.length === 0) {
                return res.status(404).send({ success: false, message: "Toko tidak ditemukan." });
            }

            console.log(`✅ [STORE GET] Berhasil menarik profil Toko ID: ${store_id}`);
            
            res.status(200).send({
            success: true,
            data: result.rows[0] // Isinya: { store_id: 15, store_name: "memek", ... }
        });
    } catch (err) {
        res.status(500).send({ success: false, message: "Server Error" });
    }
});
       
    // ============================================================
    // 2. ENDPOINT POST / (Buat Toko Baru)
    // ============================================================
    router.post('/', verifyToken, async (req, res) => {
        const client_id = req.clientId; 
        const { store_name, description, address } = req.body;
        let client; 
        
        try {
            client = await con.connect();
            await client.query('BEGIN'); 

            const existingStore = await client.query(
                'SELECT store_id FROM store WHERE client_id = $1',
                [client_id]
            );

            if (existingStore.rows.length > 0) {
                await client.query('ROLLBACK');
                return res.status(403).send({ 
                    success: false, 
                    message: "Akses ditolak: Anda hanya diperbolehkan mendaftar satu toko." 
                });
            }
            
            const insert_query = `
                INSERT INTO store (client_id, store_name, description, address) 
                VALUES ($1, $2, $3, $4) 
                RETURNING store_id
            `;
            const values = [client_id, store_name, description, address];
            const result = await client.query(insert_query, values);
            const newStoreId = result.rows[0].store_id;

            console.log(`[STORE] Toko baru berhasil dibuat. Store ID: ${newStoreId}, Owner ID: ${client_id}`);

            const updateRoleQuery = `
                UPDATE client 
                SET role = 'seller',
                    store_id = $2
                WHERE client_id = $1
                RETURNING client_id
            `;
            await client.query(updateRoleQuery, [client_id, newStoreId]); 

            await client.query('COMMIT'); 
            
            res.status(201).send({ 
                success: true, 
                message: "Toko berhasil didaftarkan. Harap login ulang untuk memperbarui hak akses.",
                store_id: newStoreId,
                owner_id: client_id 
            });

        } catch (err) {
            if (client) await client.query('ROLLBACK');
            console.error("Database Error (Store):", err.stack);
            res.status(500).send({ success: false, message: "Gagal membuat toko." });
        } finally {
            if (client) client.release();
        }
    });

    // ============================================================
    // 3. ENDPOINT REPORT
    // ============================================================
    router.get('/report', verifyToken, verifyStoreOwner(con), async (req, res) => {
        const store_id = req.storeId; 
        const year = req.query.year || new Date().getFullYear();
        let client;
        
        try {
            client = await con.connect();
            const reportQuery = `
                SELECT
                    TO_CHAR(o.order_date, 'MM') AS month_number,
                    SUM(od.quantity) AS total_products_sold,
                    SUM(od.unit_price * od.quantity) AS monthly_revenue
                FROM "order" o
                JOIN order_detail od ON o.order_id = od.order_id
                WHERE od.store_id = $1 
                    AND EXTRACT(YEAR FROM o.order_date) = $2
                    AND o.status = 'completed'
                GROUP BY month_number
                ORDER BY month_number
            `;
            const reportResult = await client.query(reportQuery, [store_id, year]);
            const monthlyReport = reportResult.rows.map(row => ({
                month: parseInt(row.month_number),
                total_products_sold: parseInt(row.total_products_sold || 0),
                monthly_revenue: parseFloat(row.monthly_revenue || 0).toFixed(2)
            }));
            
            res.status(200).json({
                success: true,
                store_id: store_id,
                year: year,
                report: monthlyReport
            });
        } catch (err) {
            console.error('Store Report Error:', err.stack);
            res.status(500).json({ message: 'Gagal memuat laporan toko.' });
        } finally {
            if (client) client.release();
        }
    });

    // ============================================================
    // 4. ENDPOINT UPDATE STATUS ORDER
    // ============================================================
    router.put('/order/:order_id/status', verifyToken, verifyStoreOwner(con), async (req, res) => {
        const store_id = req.storeId;
        const order_id = req.params.order_id;
        const { new_status } = req.body;
        const validStatuses = ['shipped', 'completed'];

        if (!new_status || !validStatuses.includes(new_status)) {
            return res.status(400).json({
                message: "Status baru tidak valid. Hanya menerima: 'shipped' atau 'completed'."
            });
        }
        
        let client;
        try {
            client = await con.connect();
            await client.query('BEGIN');
            const ownershipQuery = `
                SELECT o.status FROM "order" o
                JOIN order_detail od ON o.order_id = od.order_id
                WHERE o.order_id = $1 AND od.store_id = $2 LIMIT 1;
            `;
            const checkResult = await client.query(ownershipQuery, [order_id, store_id]);

            if (checkResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(403).json({ message: "Akses ditolak." });
            }

            const currentStatus = checkResult.rows[0].status;
            if (currentStatus === 'waiting for payment') {
                await client.query('ROLLBACK');
                return res.status(400).json({ message: "Pesanan belum dibayar." });
            }

            const updateStatusQuery = `
                UPDATE "order" 
                SET status = $1, 
                    shipped_date = CASE WHEN $1 = 'shipped' AND shipped_date IS NULL THEN NOW() ELSE shipped_date END,
                    completion_date = CASE WHEN $1 = 'completed' AND completion_date IS NULL THEN NOW() ELSE completion_date END
                WHERE order_id = $2;
            `;
            await client.query(updateStatusQuery, [new_status, order_id]);
            await client.query('COMMIT');
            res.status(200).json({ success: true, message: `Status berhasil diperbarui.` });
        } catch (err) {
            if (client) await client.query('ROLLBACK');
            res.status(500).json({ message: 'Gagal memproses status pesanan.' });
        } finally {
            if (client) client.release();
        }
    });

    // ============================================================
    // 5. ENDPOINT UPDATE STORE
    // ============================================================
    router.put('/update', verifyToken, async (req, res) => {
        const client_id = req.clientId; 
        const store_id = req.storeId; // Gunakan storeId dari token agar lebih aman
        const { store_name, description, address } = req.body;

        try {
            if (!store_name || !description || !address) {
                return res.status(400).send({ success: false, message: "Semua data wajib diisi." });
            }

            const updateQuery = `
                UPDATE store SET store_name = $1, description = $2, address = $3
                WHERE store_id = $4 AND client_id = $5
                RETURNING *
            `;
            const result = await con.query(updateQuery, [store_name, description, address, store_id, client_id]);

            if (result.rowCount === 0) {
                return res.status(403).send({ success: false, message: "Akses ditolak atau toko tidak ditemukan." });
            }

            res.status(200).send({ success: true, message: "Toko diperbarui.", data: result.rows[0] });
        } catch (err) {                         
            res.status(500).send({ success: false, message: "Terjadi kesalahan server." });
        }
    });

    return router;
};