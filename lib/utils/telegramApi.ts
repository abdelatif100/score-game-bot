/**
 * Helper to call Telegram Bot API sendMessage method.
 */
export async function sendMessage(chatId: string | number, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error('CRITICAL: TELEGRAM_BOT_TOKEN is not defined in environment variables.');
    return;
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
      }),
    });

    const data = await response.json();
    if (!data.ok) {
      console.error('Telegram API Error (sendMessage):', data);
    }
  } catch (error) {
    console.error('Fetch error calling Telegram API:', error);
  }
}
