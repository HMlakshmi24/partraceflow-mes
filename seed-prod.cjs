/**
 * Production seed — creates default users with hashed passwords.
 * Run once after first deploy:
 *   node seed-prod.js
 * (DATABASE_URL must be set in environment or .env)
 */

const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

function hashPassword(password) {
  const N = 16384, r = 8, p = 1, keyLen = 64;
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, keyLen, { N, r, p }).toString('hex');
  return `scrypt$${N}$${r}$${p}$${salt}$${hash}`;
}

async function main() {
  console.log('Seeding production users...');

  const users = [
    { username: 'admin',      password: 'Admin@1234',    role: 'ADMIN' },
    { username: 'supervisor', password: 'Super@1234',    role: 'SUPERVISOR' },
    { username: 'quality',    password: 'Quality@1234',  role: 'QUALITY' },
    { username: 'qc',         password: 'Qc@1234',       role: 'QC' },
    { username: 'operator',   password: 'Operator@1234', role: 'OPERATOR' },
  ];

  for (const u of users) {
    const passwordHash = hashPassword(u.password);
    await prisma.user.upsert({
      where: { username: u.username },
      update: { passwordHash, role: u.role, isActive: true },
      create: { username: u.username, passwordHash, role: u.role, isActive: true },
    });
    console.log(`  created: ${u.username} (${u.role}) — password: ${u.password}`);
  }

  console.log('\nDone! Login at your Vercel URL with the credentials above.');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
