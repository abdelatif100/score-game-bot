import { NextRequest, NextResponse } from 'next/server';
import { handleMessage } from '../../../lib/bot/commands';
import { sendMessage } from '../../../lib/utils/telegramApi';

/**
 * Telegram Webhook Handler
 * Endpoint: POST /api/telegram
 */
export async function POST(req: NextRequest) {
  // 1. Verify webhook secret if configured
  const secretToken = req.headers.get('X-Telegram-Bot-Api-Secret-Token');
  const expectedToken = process.env.WEBHOOK_SECRET;

  if (expectedToken && secretToken !== expectedToken) {
    console.warn('Unauthorized webhook request blocked.');
    return new NextResponse('Unauthorized', { status: 403 });
  }

  try {
    const body = await req.json();
    
    // We only care about 'message' updates for now
    const message = body.message;

    if (!message || !message.text) {
      // Respond 200 to Telegram for non-message updates or messages without text
      return NextResponse.json({ ok: true });
    }

    // 2. Process the command and get a response
    // handleMessage returns the text to reply, or null if no reply is needed (e.g., CUSTOMER role)
    const replyText = await handleMessage(message);

    if (replyText) {
      // 3. Send the reply back to the user
      // We await this to ensure the message is sent before the serverless function finishes,
      // though for heavy tasks, we might move this to a background process.
      await sendMessage(message.chat.id.toString(), replyText);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error processing Telegram webhook:', error);
    // Always return 200 to Telegram so it doesn't keep retrying failed updates
    return NextResponse.json({ ok: true });
  }
}

/**
 * Handle other methods gracefully
 */
export async function GET() {
  return new NextResponse('Bot is running...', { status: 200 });
}
