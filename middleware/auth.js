const jwt = require('jsonwebtoken');
const path = require('path');

require('dotenv').config({ 
    path: path.resolve(__dirname, '..', '.env') 
});

const JWT_SECRET = process.env.JWT_SECRET;

const verifyToken = (req, res, next) => {
   
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; 

    if (token == null) {
        return res.status(401).send({ message: 'Akses ditolak. Token tidak ditemukan.' });
    }

   jwt.verify(token, JWT_SECRET, (err, decoded) => {
    req.clientId = decoded.id;
    req.storeId = decoded.storeId; 
    
    console.log(`[AUTH MIDDLEWARE] Mengizinkan StoreID: ${req.storeId}`); 
    next();
    
});
};

module.exports = verifyToken;