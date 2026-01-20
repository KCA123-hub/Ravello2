const crypto = require('crypto');

const SCYPT_PARAMS = {
    N: 16384, 
    r: 8,     
    p: 1,     
    keylen: 32 
};

function hashPasswordScrypt(password) {
    return new Promise((resolve, reject) => {
        crypto.randomBytes(16, (err, salt) => {
            if (err) return reject(err);

            crypto.scrypt(password, salt, SCYPT_PARAMS.keylen, SCYPT_PARAMS, (err, hash) => {
                if (err) return reject(err);

                const combined = salt.toString('base64') + '.' + hash.toString('base64');
                resolve(combined);
            });
        });
    });
}

function comparePasswordScrypt(password, combinedHash) {
    return new Promise((resolve, reject) => {
        const [saltBase64, originalHashBase64] = combinedHash.split('.');
        
        if (!saltBase64 || !originalHashBase64) {
            return resolve(false); 
        }

        const salt = Buffer.from(saltBase64, 'base64');
        
        crypto.scrypt(password, salt, SCYPT_PARAMS.keylen, SCYPT_PARAMS, (err, hash) => {
            if (err) return reject(err);

            const newHashBase64 = hash.toString('base64');
            resolve(newHashBase64 === originalHashBase64);
        });
    });
}

module.exports = { 
    hashPasswordScrypt, 
    comparePasswordScrypt 
};