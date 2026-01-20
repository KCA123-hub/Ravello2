const verifyStoreOwner = (con) => {
    
    
    return async (req, res, next) => {
        
        const client_id = req.clientId;
        if (!client_id) {
            return res.status(401).json({ 
                success: false, 
                message: "Akses ditolak. Token tidak ditemukan atau tidak valid." 
            });
        }
        
        try {
            const storeResult = await con.query(
                'SELECT store_id FROM store WHERE client_id = $1',
                [client_id]
            );

            if (storeResult.rows.length === 0) {

                return res.status(403).json({
                    success: false,
                    message: "Akses ditolak. Anda belum terdaftar sebagai pemilik toko."
                });
            }

            req.storeId = storeResult.rows[0].store_id; 
            
            next(); 

        } catch (error) {
            console.error('Middleware verifyStoreOwner Error:', error.stack);
            res.status(500).json({ success: false, message: "Kesalahan server saat memverifikasi kepemilikan toko." });
        }
    };
};

module.exports = verifyStoreOwner;