import { prisma } from '@/lib/db/prisma';
import { getOrCreateUser, isAllowed } from './permissions';
import { Role, TransactionType } from '@prisma/client';
import { broadcastMessage } from './broadcaster';

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

  // b) Partner Withdrawal (p-<amount>)
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

  // f) Help Command (help or مساعدة)
  if (text.toLowerCase() === 'help' || text === 'مساعدة') {
    let helpText = "📋 قائمة الأوامر:\n";
    helpText += "• رقم موجب (مثال: 100) ➔ تسجيل إيراد\n";
    helpText += "• رقم سالب (مثال: -45) ➔ تسجيل مصروف\n";

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
