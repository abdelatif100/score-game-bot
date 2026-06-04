const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function listUsers() {
  try {
    const users = await prisma.user.findMany();
    console.log('Users in DB:');
    users.forEach(u => {
      console.log(`- ID: ${u.telegramId}, Username: ${u.username}, Role: ${u.role}`);
    });
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

listUsers();
