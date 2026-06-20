import { handleMessage } from './lib/bot/commands.ts';
import pkg from '@prisma/client';
const { Role } = pkg;
import { prisma } from './lib/db/prisma.ts';

async function testDebtPermissions() {
  console.log('🚀 Starting Debt Permission Tests...\n');

  try {
    const customerId = 88888888;
    // Ensure user exists as CUSTOMER
    await prisma.user.upsert({
      where: { telegramId: BigInt(customerId) },
      update: { role: Role.CUSTOMER },
      create: { telegramId: BigInt(customerId), role: Role.CUSTOMER, firstName: 'TestCustomer' }
    });

    const msg = (text: string) => ({
      chat: { id: customerId },
      from: { id: customerId },
      text
    });

    console.log('Test 1: CUSTOMER attempts "add Ahmed"');
    const reply1 = await handleMessage(msg('add Ahmed'));
    console.log(`Reply: ${reply1}`);
    console.log(`Result: ${reply1 === "⏳ حسابك قيد المراجعة. يرجى الانتظار حتى يتم تفعيلك من قبل المسؤول." ? 'PASSED' : 'FAILED'}\n`);

    console.log('Test 2: CUSTOMER attempts "din"');
    const reply2 = await handleMessage(msg('din'));
    console.log(`Reply: ${reply2}`);
    console.log(`Result: ${reply2 === "⏳ حسابك قيد المراجعة. يرجى الانتظار حتى يتم تفعيلك من قبل المسؤول." ? 'PASSED' : 'FAILED'}\n`);

    console.log('✅ Debt permission tests completed.');
  } catch (error) {
    console.error('❌ Test failed with error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testDebtPermissions();
