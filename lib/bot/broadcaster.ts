import { prisma } from '../db/prisma.ts';
import { sendMessage } from '../utils/telegramApi.ts';

/**
 * Broadcasts a message to all registered users in the database.
 * This is done asynchronously with a small delay between messages
 * to respect Telegram's rate limits.
 */
export async function broadcastMessage(text: string): Promise<void> {
  try {
    const users = await prisma.user.findMany({
      select: { telegramId: true },
    });

    console.log(`Starting broadcast to ${users.length} users.`);

    for (const user of users) {
      try {
        // Use .toString() for BigInt to avoid JSON.stringify issues and maintain precision
        await sendMessage(user.telegramId.toString(), text);
        
        // Slight delay to respect rate limits (30 messages per second is Telegram's limit)
        // 100ms delay = 10 messages per second, which is very safe.
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Failed to broadcast to user ${user.telegramId}:`, error);
      }
    }
    
    console.log('Broadcast finished.');
  } catch (error) {
    console.error('Error during broadcastMessage:', error);
  }
}
