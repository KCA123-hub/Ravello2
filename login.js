const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken'); 
const path = require('path');

const { comparePasswordScrypt } = require('./utils/auth_utils.js'); 

require('dotenv').config({ 
    path: path.resolve(__dirname, '..', '.env') 
}); 

const JWT_SECRET = process.env.JWT_SECRET;

module.exports = (con) => {

    if (!JWT_SECRET) {
        throw new Error("FATAL ERROR: JWT_SECRET not defined.");
    }

    router.post('/login', async (req, res) => {

    const { email, password } = req.body;

    const standardizedEmail = email ? email.toLowerCase() : ''; 

        try {
            if (!standardizedEmail || !password) {
             return res.status(400).send({ success: false, message: 'Email dan password wajib diisi.' });
             }

           const query = `
                SELECT 
                    c.client_id, 
                    c.name, 
                    c.password, 
                    c.email, 
                    c.role,
                    s.store_id, 
                    s.store_name 
                FROM client c
                LEFT JOIN store s ON c.client_id = s.client_id
                WHERE c.email = $1
            `;
            const clientResult = await con.query(query, [standardizedEmail]);
            const client = clientResult.rows[0];

            if (!client) {
                return res.status(401).send({ success: false, message: 'Email atau password salah.' });
             }

             const hashedPasswordDB = client.password; 

             const passwordMatch = await comparePasswordScrypt(password, hashedPasswordDB);

            if (!passwordMatch) {
                return res.status(401).send({ success: false, message: 'Email atau password salah.' });
            }

            const payload = { 
                id: client.client_id, 
                email: client.email,
                name: client.name,
                role: client.role,
                storeId: client.store_id,
                storeName: client.store_name 
            };

            console.log(`[DEBUG LOGIN] ID: ${client.client_id}, Role: ${client.role}, StoreID: ${client.store_id}, StoreName: ${client.store_name}`);
            const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' }); 

            res.status(200).send({
                success: true,
                message: 'Login berhasil.',
                token: token,
                client_id: client.client_id,
                name: client.name, 
                email: client.email,
                role: client.role,
                store_id: client.store_id,
                store_name: client.store_name 
            });

        } catch (error) {
            console.error("Login Error:", error.stack);
             res.status(500).send({ success: false, message: 'Terjadi kesalahan server internal.' });
        }
      });
      return router; 
};