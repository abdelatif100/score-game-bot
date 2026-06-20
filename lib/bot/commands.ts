import { prisma } from '@/lib/db/prisma';
import { getOrCreateUser, isAllowed } from './permissions';
import { Role, TransactionType } from '@prisma/client';
import { broadcastMessage } from './broadcaster';
import { sendMessage } from '@/lib/utils/telegramApi';

interface TelegramMessage {
  chat: { id: number };
  from: { id: number; username?: string; first_name?: string };
  text?: string;
}

/**
 * Main command handler for the Telegram bot.
 * Processes incoming messages and returns a response string or null.
 */
export async function handleMessage(msg: TelegramMessage): Promise<string | null> {
  const from = msg.from;
  const text = msg.text?.trim();

  if (!text) return null;

  // Get or register the user
  const user = await getOrCreateUser(from.id, from.username, from.first_name);

  // If user.role === 'CUSTOMER' → ignore transactions but allow help
  if (user.role === Role.CUSTOMER && text.toLowerCase() !== 'help' && text !== 'مساعدة') {
    return "⏳ حسابك قيد المراجعة. يرجى الانتظار حتى يتم تفعيلك من قبل المسؤول.";
  }

  // a) Numeric Income / Expense (e.g., 100 or -45)
  const numRegex = /^-?\d+(\.\d+)?$/;
  if (numRegex.test(text)) {
    const amount = parseFloat(text);
    const type = amount >= 0 ? TransactionType.INCOME : TransactionType.EXPENSE;

    await prisma.transaction.create({
      data: {
        userId: user.id,
        amount: amount,
        type: type,
      },
    });

    return amount >= 0
      ? `✅ تم تسجيل الإيراد: +${amount}`
      : `✅ تم تسجيل المصروف: ${amount}`;
  }

  // b) Add Debtor (add <name>)
  if (text.toLowerCase().startsWith('add ')) {
    const name = text.substring(4).trim();
    if (!name) return "❓ يرجى كتابة اسم المدين بعد 'add'.";

    try {
      const debtor = await prisma.debtor.create({
        data: { name, balance: 0 },
      });
      return `✅ تم إضافة ${debtor.name} إلى قائمة الديون (رقم #${debtor.id}).`;
    } catch (error: any) {
      if (error.code === 'P2002') {
        return "⚠️ هذا الاسم موجود بالفعل في قائمة الديون.";
      }
      console.error('Error adding debtor:', error);
      return "❌ حدث خطأ أثناء إضافة المدين.";
    }
  }

  // c) Debt Tracking (din or din <id> <amount>)
  if (text.toLowerCase() === 'din' || text.toLowerCase().startsWith('din ')) {
    const parts = text.split(/\s+/);
    
    // din alone: List all debtors
    if (parts.length === 1) {
      const debtors = await prisma.debtor.findMany({
        orderBy: { id: 'asc' },
      });

      if (debtors.length === 0) return "📭 لا يوجد مدينون مسجلون.";

      let response = "📋 قائمة الديون:\n";
      let totalDebt = 0;
      for (const d of debtors) {
        const bal = Number(d.balance);
        totalDebt += bal;
        response += `${d.id}. ${d.name}: ${bal >= 0 ? '+' : ''}${bal}\n`;
      }
      response += `\n💰 إجمالي الديون: ${totalDebt >= 0 ? '+' : ''}${totalDebt}`;
      return response;
    }

    // din <id> <amount>
    if (parts.length === 3) {
      const id = parseInt(parts[1]);
      const amount = parseFloat(parts[2]);

      if (isNaN(id) || isNaN(amount)) {
        return "❓ صيغة غير صحيحة. استخدم: din <رقم> <المبلغ>";
      }

      try {
        const debtor = await prisma.debtor.findUnique({ where: { id } });
        if (!debtor) return "❌ لم يتم العثور على مدين بهذا الرقم.";

        const newBalance = Number(debtor.balance) + amount;

        await prisma.$transaction([
          prisma.debtor.update({
            where: { id },
            data: { balance: newBalance },
          }),
          prisma.debtTransaction.create({
            data: { debtorId: id, amount: amount },
          }),
        ]);

        return `✅ تم تحديث حساب ${debtor.name}.\nالرصيد السابق: ${debtor.balance}\nالتعديل: ${amount >= 0 ? '+' : ''}${amount}\nالرصيد الحالي: ${newBalance}`;
      } catch (error) {
        console.error('Error updating debt:', error);
        return "❌ حدث خطأ أثناء تحديث الدين.";
      }
    }

    return "❓ صيغة غير صحيحة. استخدم 'din' للعرض أو 'din <رقم> <المبلغ>' للتسجيل.";
  }

  // d) Partner Withdrawal (p-<amount>)
  if (text.toLowerCase().startsWith('p-')) {
    if (!isAllowed(user, [Role.ADMIN, Role.PARTNER])) {
      return "⛔ ليست لديك صلاحية.";
    }
    const amountStr = text.substring(2);
    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) {
      return "❓ مبلغ غير صحيح. استخدم p-المبلغ (مثال: p-100).";
    }

    await prisma.transaction.create({
      data: {
        userId: user.id,
        amount: -amount,
        type: TransactionType.PARTNER_WITHDRAWAL,
      },
    });

    return `✅ تم تسجيل سحبك بمبلغ ${amount}.`;
  }

  // c) Profit Queries (d, d-<day>, h, h-<hour>)
  if (text === 'd' || text.startsWith('d-')) {
    if (!isAllowed(user, [Role.ADMIN, Role.PARTNER])) {
      return "⛔ ليست لديك صلاحية.";
    }

    let start: Date;
    let end: Date;
    const now = new Date();

    if (text === 'd') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    } else {
      const day = parseInt(text.substring(2));
      if (isNaN(day) || day < 1 || day > 31) return "❓ يوم غير صحيح.";
      
      start = new Date(now.getFullYear(), now.getMonth(), day);
      end = new Date(now.getFullYear(), now.getMonth(), day + 1);
      
      if (start > now) return "📅 لا توجد بيانات لهذا اليوم بعد.";
    }

    // Check DailySummary first
    const summary = await prisma.dailySummary.findUnique({
      where: { date: start },
    });

    if (summary) {
      const sum = Number(summary.totalProfit);
      const dayNum = text === 'd' ? now.getDate() : parseInt(text.substring(2));
      const prefix = text === 'd' ? "💰 أرباح اليوم (مسجلة): " : `💰 أرباح يوم ${dayNum}: `;
      return sum >= 0 ? `${prefix}+${sum}` : `${prefix}${sum}`;
    }

    const result = await prisma.transaction.aggregate({
      where: {
        timestamp: {
          gte: start,
          lt: end,
        },
      },
      _sum: {
        amount: true,
      },
    });

    const sum = Number(result._sum.amount || 0);
    if (sum === 0) return "💤 لا توجد أرباح بعد.";
    return sum > 0 ? `💰 الأرباح: +${sum}` : `💸 الخسارة: ${sum}`;
  }

  if (text === 'h' || text.startsWith('h-')) {
    if (!isAllowed(user, [Role.ADMIN, Role.PARTNER])) {
      return "⛔ ليست لديك صلاحية.";
    }

    let start: Date;
    let end: Date;
    const now = new Date();

    if (text === 'h') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1);
    } else {
      const hour = parseInt(text.substring(2));
      if (isNaN(hour) || hour < 0 || hour > 23) return "❓ ساعة غير صحيحة.";
      
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour + 1);
      
      if (start > now) return "⏰ لا توجد بيانات لهذه الساعة بعد.";
    }

    const result = await prisma.transaction.aggregate({
      where: {
        timestamp: {
          gte: start,
          lt: end,
        },
      },
      _sum: {
        amount: true,
      },
    });

    const sum = Number(result._sum.amount || 0);
    if (sum === 0) return "💤 لا توجد أرباح بعد.";
    return sum > 0 ? `💰 الأرباح: +${sum}` : `💸 الخسارة: ${sum}`;
  }

  // d) Settlement Command (s)
  if (text.toLowerCase() === 's') {
    if (!isAllowed(user, [Role.ADMIN, Role.PARTNER])) {
      return "⛔ ليست لديك صلاحية.";
    }

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    // 1. Calculate net profit
    const result = await prisma.transaction.aggregate({
      where: {
        timestamp: {
          gte: startOfDay,
          lt: endOfDay,
        },
      },
      _sum: {
        amount: true,
      },
    });

    const sum = result._sum.amount;
    if (sum === null) {
      return "📭 لا توجد معاملات اليوم لتسويتها.";
    }

    const totalProfit = Number(sum);

    // 2. Create or update DailySummary
    await prisma.dailySummary.upsert({
      where: { date: startOfDay },
      update: { totalProfit: totalProfit },
      create: { date: startOfDay, totalProfit: totalProfit },
    });

    // 3. Delete transactions for today
    await prisma.transaction.deleteMany({
      where: {
        timestamp: {
          gte: startOfDay,
          lt: endOfDay,
        },
      },
    });

    const sign = totalProfit >= 0 ? "+" : "";
    return `✅ تم تسوية اليوم. إجمالي أرباح اليوم: ${sign}${totalProfit}`;
  }

  // e) Store Status Broadcasts (o, c, o-c)
  if (['o', 'c', 'o-c'].includes(text.toLowerCase())) {
    if (user.role !== Role.ADMIN) {
      return "⛔ هذا الأمر للمسؤول فقط.";
    }

    let statusText = '';
    const cmd = text.toLowerCase();
    if (cmd === 'o') statusText = "🟢 المحل مفتوح الآن";
    else if (cmd === 'c') statusText = "🔴 المحل مغلق الآن";
    else if (cmd === 'o-c') statusText = "🟡 المحل مغلق مؤقتاً";

    broadcastMessage(statusText); // Fire-and-forget
    return "📢 تم إرسال إشعار الحالة لجميع المستخدمين.";
  }

  // e) Admin Announcement (ad <message>)
  if (text.toLowerCase().startsWith('ad ')) {
    if (user.role !== Role.ADMIN) {
      return "⛔ هذا الأمر للمسؤول فقط.";
    }
    const announcement = text.substring(3).trim();
    if (!announcement) return "❓ الرجاء كتابة نص الإعلان بعد 'ad'.";

    broadcastMessage(announcement); // Fire-and-forget
    return "📢 تم إرسال الإعلان.";
  }

  // f) Promote to Worker (w-<telegramId>)
  if (text.toLowerCase().startsWith('w-')) {
    if (user.role !== Role.ADMIN) {
      return "⛔ هذا الأمر للمسؤول فقط.";
    }
    const targetIdStr = text.substring(2).trim();
    if (!/^\d+$/.test(targetIdStr)) {
      return "❌ صيغة الأمر غير صحيحة. استخدم: w-<رقم_المعرف>";
    }
    const targetId = BigInt(targetIdStr);

    try {
      const targetUser = await prisma.user.findUnique({
        where: { telegramId: targetId },
      });

      if (!targetUser) {
        return "❌ لم يتم العثور على مستخدم بهذا المعرف.";
      }

      if (targetUser.role === Role.EMPLOYEE) {
        return "ℹ️ هذا المستخدم عامل بالفعل.";
      }

      if (targetUser.role === Role.ADMIN) {
        return "⛔ لا يمكن تغيير صلاحية مشرف.";
      }

      const updatedUser = await prisma.user.update({
        where: { telegramId: targetId },
        data: { role: Role.EMPLOYEE },
      });

      const name = updatedUser.username ? `@${updatedUser.username}` : (updatedUser.firstName || updatedUser.telegramId.toString());
      return `✅ تم ترقية المستخدم ${name} إلى عامل.`;
    } catch (error) {
      console.error('Error promoting user:', error);
      return "❌ حدث خطأ أثناء تعديل الصلاحية. حاول مرة أخرى.";
    }
  }

  // g) List Users Command (list)
  if (text.toLowerCase() === 'list') {
    if (user.role !== Role.ADMIN) {
      return "⛔ هذا الأمر للمسؤول فقط.";
    }

    const allUsers = await prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
    });

    if (allUsers.length === 0) {
      return "📭 لا يوجد مستخدمون مسجلون.";
    }

    const grouped = {
      ADMIN: allUsers.filter((u) => u.role === Role.ADMIN),
      PARTNER: allUsers.filter((u) => u.role === Role.PARTNER),
      EMPLOYEE: allUsers.filter((u) => u.role === Role.EMPLOYEE),
      CUSTOMER: allUsers.filter((u) => u.role === Role.CUSTOMER),
    };

    const roleHeaders: Record<Role, string> = {
      ADMIN: '👑 المشرفون:',
      PARTNER: '🤝 الشركاء:',
      EMPLOYEE: '👤 الموظفون:',
      CUSTOMER: '🛒 الزبائن:',
    };

    const roleArabicLabels: Record<Role, string> = {
      ADMIN: 'مشرف',
      PARTNER: 'شريك',
      EMPLOYEE: 'موظف',
      CUSTOMER: 'زبون',
    };

    const messages: string[] = [];
    let currentMessage = '📋 قائمة المستخدمين المسجلين:\n';

    for (const role of [Role.ADMIN, Role.PARTNER, Role.EMPLOYEE, Role.CUSTOMER] as Role[]) {
      const usersInRole = grouped[role];
      if (usersInRole.length === 0) continue;

      currentMessage += `\n${roleHeaders[role]}\n`;
      for (const u of usersInRole) {
        const roleArabic = roleArabicLabels[role];
        const name = u.username ? `@${u.username}` : (u.firstName || 'بدون اسم');
        const line = `${u.telegramId.toString()} (${roleArabic}) ${name}\n`;

        if (currentMessage.length + line.length > 4000) {
          messages.push(currentMessage);
          currentMessage = line;
        } else {
          currentMessage += line;
        }
      }
    }
    messages.push(currentMessage);

    for (const msg of messages) {
      await sendMessage(user.telegramId.toString(), msg);
    }
    return null;
  }

  // g) Help Command (help or مساعدة)
  if (text.toLowerCase() === 'help' || text === 'مساعدة') {
    let helpText = "📋 قائمة الأوامر:\n";
    helpText += "• رقم موجب (مثال: 100) ➔ تسجيل إيراد\n";
    helpText += "• رقم سالب (مثال: -45) ➔ تسجيل مصروف\n";
    helpText += "• add الاسم ➔ إضافة مدين جديد\n";
    helpText += "• din ➔ عرض قائمة الديون\n";
    helpText += "• din رقم مبلغ ➔ تسجيل دين أو سداد\n";

    if (isAllowed(user, [Role.ADMIN, Role.PARTNER])) {
      helpText += "• p-المبلغ (مثال: p-456) ➔ سحب شريك\n";
      helpText += "• d ➔ أرباح اليوم الحالي\n";
      helpText += "• d-رقم اليوم ➔ أرباح يوم معين\n";
      helpText += "• h ➔ أرباح الساعة الحالية\n";
      helpText += "• h-رقم ➔ أرباح ساعة معينة\n";
      helpText += "• s ➔ تسوية اليوم (حفظ الأرباح ومسح المعاملات)\n";
    }

    if (user.role === Role.ADMIN) {
      helpText += "• o ➔ المحل مفتوح (بث للجميع)\n";
      helpText += "• c ➔ المحل مغلق (بث)\n";
      helpText += "• o-c ➔ مغلق مؤقتاً (بث)\n";
      helpText += "• ad نص ➔ إعلان للجميع\n";
      helpText += "• list ➔ عرض قائمة المستخدمين المسجلين\n";
    }

    helpText += "• help ➔ هذه القائمة";
    return helpText;
  }

  // g) Future AI Placeholder (a ...)
  if (text.toLowerCase() === 'a' || text.toLowerCase().startsWith('a ')) {
    return "🤖 المساعد الذكي غير مفعّل بعد.";
  }

  // h) Unknown Commands
  return "❓ أمر غير معروف. اكتب help لرؤية الأوامر المتاحة.";
}
