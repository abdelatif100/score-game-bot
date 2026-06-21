import { handleMessage } from './lib/bot/commands';
import { Role } from '@prisma/client';
import { prisma } from './lib/db/prisma';

async function testTournament() {
  console.log('🚀 Starting Tournament Logic Tests...\n');

  try {
    const adminId = 88888888;
    // Ensure user exists as ADMIN
    await prisma.user.upsert({
      where: { telegramId: BigInt(adminId) },
      update: { role: Role.ADMIN },
      create: { telegramId: BigInt(adminId), role: Role.ADMIN, firstName: 'TestAdmin' }
    });

    // Cleanup
    await prisma.tournamentPlayer.deleteMany({});
    await prisma.tournament.deleteMany({});

    const msg = (text: string) => ({
      chat: { id: adminId },
      from: { id: adminId },
      text
    });

    // 1. Create Tournament
    console.log('Test 1: Create Tournament (trn بطولة اليوم)');
    const reply1 = await handleMessage(msg('trn بطولة اليوم'));
    console.log(`Result: ${reply1?.includes('تم إنشاء البطولة') ? 'PASSED' : 'FAILED'} (Reply: ${reply1})\n`);

    // 2. Register Player
    console.log('Test 2: Register Player (reg أحمد)');
    const reply2 = await handleMessage(msg('reg أحمد'));
    console.log(`Result: ${reply2?.includes('تم تسجيل اللاعب أحمد') ? 'PASSED' : 'FAILED'} (Reply: ${reply2})\n`);

    // 3. Register Another Player
    console.log('Test 3: Register Player (reg خالد)');
    const reply3 = await handleMessage(msg('reg خالد'));
    console.log(`Result: ${reply3?.includes('تم تسجيل اللاعب خالد') ? 'PASSED' : 'FAILED'} (Reply: ${reply3})\n`);

    // 4. Close Registration
    console.log('Test 4: Close Registration (closereg)');
    const reply4 = await handleMessage(msg('closereg'));
    console.log(`Result: ${reply4?.includes('تم إغلاق التسجيل') ? 'PASSED' : 'FAILED'} (Reply: ${reply4})\n`);

    // 5. Declare Winners
    console.log('Test 5: Declare Winners (win أحمد, خالد)');
    const reply5 = await handleMessage(msg('win أحمد, خالد'));
    console.log(`Result: ${reply5?.includes('تم إعلان الفائزين') ? 'PASSED' : 'FAILED'} (Reply: ${reply5})\n`);

    // 6. Verify Completed
    const tournament = await prisma.tournament.findFirst({ orderBy: { id: 'desc' } });
    console.log(`Test 6: Verify Tournament Completed Status: ${tournament?.status === 'completed' ? 'PASSED' : 'FAILED'}`);
    
    console.log('\n✅ All tournament logic tests completed.');
  } catch (error) {
    console.error('❌ Test failed with error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testTournament();
