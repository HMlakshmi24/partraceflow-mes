const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const SCRYPT_N = 16384, SCRYPT_R = 8, SCRYPT_P = 1, KEY_LEN = 64;
    const hash = crypto.scryptSync(password, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P }).toString('hex');
    return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${hash}`;
}

const prisma = new PrismaClient();
prisma.user.update({
    where: { username: 'admin' },
    data: { passwordHash: hashPassword('admin123') }
}).then((u) => {
    console.log('Fixed password for ' + u.username);
    process.exit(0);
}).catch(e => {
    console.error(e);
    process.exit(1);
});
