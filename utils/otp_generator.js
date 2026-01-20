const ONE_TIME_LIMIT_MS = 5 * 60 * 1000; 

function generateOtp() {
   
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    const expiresAt = new Date(Date.now() + ONE_TIME_LIMIT_MS);

    return { 
        code: code, 
        expiresAt: expiresAt 
    };
}

module.exports = generateOtp;