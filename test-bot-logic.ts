import { handleMessage } from './lib/bot/commands';
import { Role } from '@prisma/client';
import { prisma } from './lib/db/prisma';

async function testBot() {
  console.log('🚀 Starting Bot Logic Tests...\n');

  try {
    // 1. Simulate a new CUSTOMER message (should be ignored)
    console.log('Test 1: New Customer Message');
    const customerMsg = {
      chat: { id: 12345 },
      from: { id: 12345, username: 'customer_user', first_name: 'Customer' },
      text: 'hello'
    };
    const reply1 = await handleMessage(customerMsg);
    console.log(`Result: ${reply1 === null ? 'PASSED (Ignored)' : 'FAILED'}\n`);

    // 2. Manually upgrade user to ADMIN for further tests
    console.log('Setting user 12345 to ADMIN for testing...');
    await prisma.user.update({
      where: { telegramId: BigInt(12345) },
      data: { role: Role.ADMIN }
    });

    // 3. Test Income Recording
    console.log('Test 2: Recording Income (+150)');
    const incomeMsg = {
      chat: { id: 12345 },
      from: { id: 12345 },
      text: '150'
    };
    const reply2 = await handleMessage(incomeMsg);
    console.log(`Result: ${reply2?.includes('150') ? 'PASSED' : 'FAILED'} (Reply: ${reply2})\n`);

    // 4. Test Expense Recording
    console.log('Test 3: Recording Expense (-50)');
    const expenseMsg = {
      chat: { id: 12345 },
      from: { id: 12345 },
      text: '-50'
    };
    const reply3 = await handleMessage(expenseMsg);
    console.log(`Result: ${reply3?.includes('-50') ? 'PASSED' : 'FAILED'} (Reply: ${reply3})\n`);

    // 5. Test Profit Query (d)
    console.log('Test 4: Daily Profit Query (d)');
    const profitMsg = {
      chat: { id: 12345 },
      from: { id: 12345 },
      text: 'd'
    };
    const reply4 = await handleMessage(profitMsg);
    console.log(`Result: ${reply4?.includes('100') ? 'PASSED' : 'FAILED'} (Reply: ${reply4})\n`);

    // 6. Test Help Command
    console.log('Test 5: Help Command');
    const helpMsg = {
      chat: { id: 12345 },
      from: { id: 12345 },
      text: 'help'
    };
    const reply5 = await handleMessage(helpMsg);
    console.log(`Result: ${reply5?.includes('قائمة الأوامر') ? 'PASSED' : 'FAILED'}\n`);

    console.log('✅ All simulated logic tests completed.');
  } catch (error) {
    console.error('❌ Test failed with error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testBot();
