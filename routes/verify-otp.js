// File: verify-otp.js - Menggabungkan Verifikasi OTP Reset dan Registrasi

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken'); 

const OTP_PURPOSES = require('../utils/otp_constants');

module.exports = (con) => {

    router.post('/verify-otp', async (req, res) => {
        console.log('[DEBUG VERIFY-OTP REQUEST BODY]', req.body);
       
        const { email, otp, action_flow } = req.body; 
        const standardizedEmail = email ? email.toLowerCase() : '';

        const JWT_SECRET = process.env.JWT_SECRET;
        if (!JWT_SECRET) {
             return res.status(500).json({ success: false, message: "Server error: JWT_SECRET tidak terkonfigurasi." });
        }

        let purpose = null;
        
        if (action_flow === 'PASSWORD_RESET') {
            purpose = OTP_PURPOSES.PASSWORD_RESET;
        } else if (action_flow === 'REGISTRATION') {
            purpose = OTP_PURPOSES.REGISTRATION;
        } else {
          
            return res.status(400).json({ success: false, message: "Alur verifikasi (action_flow) tidak valid. Harap ulangi proses permintaan kode." });
        }

        try {
            if (!standardizedEmail || !otp) {
                return res.status(400).json({ success: false, message: "Email dan kode OTP wajib diisi." });
            }
            
          
            const otpResult = await con.query(
                `SELECT otp_expire, temp_reg_id FROM otp_verification 
                 WHERE email = $1 AND otp = $2 AND purpose = $3 
                 ORDER BY otp_expire DESC LIMIT 1`,
                [standardizedEmail, otp, purpose]
            );

            if (otpResult.rows.length === 0) {
                return res.status(401).json({ success: false, message: "Kode OTP salah atau tidak ditemukan." });
            }
            const otpRow = otpResult.rows[0]; 

            const now = new Date();
            const expireTime = new Date(otpRow.otp_expire);

            if (now > expireTime) {
                
                if (purpose === OTP_PURPOSES.REGISTRATION) {
                    await con.query('DELETE FROM temp_registration WHERE temp_id = $1', [otpRow.temp_reg_id]);
                }
                await con.query('DELETE FROM otp_verification WHERE email = $1 AND purpose = $2', [standardizedEmail, purpose]);
                
                return res.status(401).json({ success: false, message: "Kode OTP telah kedaluwarsa. Silakan minta kode baru." });
            }

            if (purpose === OTP_PURPOSES.PASSWORD_RESET) {

                await con.query('DELETE FROM otp_verification WHERE email = $1 AND purpose = $2', [standardizedEmail, purpose]);
                
                return res.status(200).json({
                    success: true,
                    message: "Verifikasi berhasil. Lanjutkan untuk mengatur password baru.",
                    action: "reset_password", 
                    email: standardizedEmail 
                });

            } else if (purpose === OTP_PURPOSES.REGISTRATION) {
             
                const tempRegistrationId = otpRow.temp_reg_id; 
                
                const tempRegResult = await con.query(
                    'SELECT name, email, phone_number, password, role, store_id FROM temp_registration WHERE temp_id = $1',
                    [tempRegistrationId]
                );
                const tempUserData = tempRegResult.rows[0];

                if (!tempUserData) {
                    return res.status(500).json({ success: false, message: "Data registrasi sementara tidak ditemukan. Silakan coba mendaftar ulang." });
                }

                const insert_query = `INSERT INTO client (name, email, phone_number, password, role, store_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING client_id, name, email, role, store_id`;
                const values = [tempUserData.name, tempUserData.email, tempUserData.phone_number, tempUserData.password, tempUserData.role, tempUserData.store_id];

                const result = await con.query(insert_query, values);
                const newClientData = result.rows[0];

                await con.query('DELETE FROM otp_verification WHERE email = $1 AND purpose = $2', [standardizedEmail, purpose]);
                await con.query('DELETE FROM temp_registration WHERE temp_id = $1', [tempRegistrationId]);

                const payload = { 
                    id: newClientData.client_id, 
                    email: newClientData.email,
                    name: newClientData.name,
                    role: newClientData.role,
                    storeId: newClientData.store_id 
                };
                const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' }); 


                console.log(`✅ [AUTH] Registrasi final berhasil untuk ID: ${newClientData.client_id}`);
                return res.status(201).json({
                    success: true,
                    message: "Registrasi dan verifikasi berhasil! Akun Anda sudah aktif.",
                    action: "registration_complete",
                    client_id: newClientData.client_id,
                    token: token,
                    role: newClientData.role,
                    store_id: newClientData.store_id
                });
                
            } else {

                return res.status(500).json({ success: false, message: "Kesalahan internal alur verifikasi." });
            }


        } catch (err) {
            console.error("Database Error (OTP Verification):", err.stack);
            
            if (err.code === '23505') { 
                return res.status(409).json({ success: false, message: "Email sudah terdaftar." });
            }
            return res.status(500).json({ success: false, message: "Gagal memproses verifikasi. Cek log server." });
        }
    });

    return router;
};