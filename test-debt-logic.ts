import { handleMessage } from './lib/bot/commands';
import { Role } from '@prisma/client';
import { prisma } from './lib/db/prisma';

async function testDebt() {
  console.log('🚀 Starting Debt Logic Tests...\n');

  try {
    const adminId = 99999999;
    // Ensure user exists as ADMIN
    await prisma.user.upsert({
      where: { telegramId: BigInt(adminId) },
      update: { role: Role.ADMIN },
      create: { telegramId: BigInt(adminId), role: Role.ADMIN, firstName: 'TestAdmin' }
    });

    // Cleanup previous test data if any
    await prisma.debtTransaction.deleteMany({});
    await prisma.debtor.deleteMany({});

    const msg = (text: string) => ({
      chat: { id: adminId },
      from: { id: adminId },
      text
    });

    // 1. Add Debtor
    console.log('Test 1: Add Debtor (add Ahmed)');
    const reply1 = await handleMessage(msg('add Ahmed'));
    console.log(`Result: ${reply1?.includes('Ahmed') ? 'PASSED' : 'FAILED'} (Reply: ${reply1})\n`);

    // 2. List Debtors (din)
    console.log('Test 2: List Debtors (din)');
    const reply2 = await handleMessage(msg('din'));
    console.log(`Result: ${reply2?.includes('Ahmed') ? 'PASSED' : 'FAILED'} (Reply: ${reply2})\n`);

    // 3. Update Debt (din <id> 500)
    console.log('Test 3: Update Debt (din <id> 500)');
    const debtor = await prisma.debtor.findFirst({ where: { name: 'Ahmed' } });
    if (!debtor) throw new Error('Debtor not found');
    
    const reply3 = await handleMessage(msg(`din ${debtor.id} 500`));
    console.log(`Result: ${reply3?.includes('500') && reply3?.includes('Ahmed') ? 'PASSED' : 'FAILED'} (Reply: ${reply3})\n`);

    // 4. Update Debt (din <id> -200)
    console.log('Test 4: Update Debt (din <id> -200)');
    const reply4 = await handleMessage(msg(`din ${debtor.id} -200`));
    console.log(`Result: ${reply4?.includes('-200') && (reply4?.includes('300') || reply4?.includes('300.00')) ? 'PASSED' : 'FAILED'} (Reply: ${reply4})\n`);

    // 5. List Debtors again
    console.log('Test 5: List Debtors again');
    const reply5 = await handleMessage(msg('din'));
    console.log(`Result: ${reply5?.includes('Ahmed: +300') ? 'PASSED' : 'FAILED'} (Reply: ${reply5})\n`);

    console.log('✅ Debt logic tests completed.');
  } catch (error) {
    console.error('❌ Test failed with error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testDebt();
