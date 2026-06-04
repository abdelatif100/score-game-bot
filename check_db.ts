import { prisma } from './lib/db/prisma';

async function checkDB() {
  try {
    const userCount = await prisma.user.count();
    console.log(`Connection successful. User count: ${userCount}`);
  } catch (error) {
    console.error('DB Connection Failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDB();
