# score-game-bot

This project is a Telegram bot designed for managing shop finances and broadcasting status updates. It allows administrators and partners to track income, expenses, and withdrawals, as well as notify customers about the shop's operational status.

## Project Overview

*   **Purpose:** Financial tracking (Income/Expense/Withdrawals) and shop status broadcasting.
*   **Target Audience:** Shop owners (Admins), Partners, Employees, and Customers.
*   **Main Technologies:** Next.js 16 (App Router), Prisma ORM, PostgreSQL, Telegram Bot API.

## Architecture

*   **Webhook Handler:** `app/api/telegram/route.ts` handles incoming updates from Telegram.
*   **Command Logic:** `lib/bot/commands.ts` parses messages and executes corresponding actions.
*   **Permissions:** `lib/bot/permissions.ts` manages role-based access control (RBAC).
*   **Broadcaster:** `lib/bot/broadcaster.ts` handles asynchronous message delivery to all registered users.
*   **Database:** Prisma handles interactions with a PostgreSQL database, defined in `prisma/schema.prisma`.

## User Roles

1.  **ADMIN:** Full access (financials, status broadcasts, announcements).
2.  **PARTNER:** Access to financials and profit queries.
3.  **EMPLOYEE:** Can register income/expenses (implied by `handleMessage` logic, though primarily restricted to non-customer roles).
4.  **CUSTOMER:** Default role; ignored by the bot except for receiving broadcasts.

## Bot Commands

*   **Financial Tracking:**
    *   `[Positive Number]` (e.g., `100`): Records income.
    *   `[Negative Number]` (e.g., `-50`): Records expense.
    *   `p-[Amount]` (e.g., `p-200`): Records partner withdrawal (Admin/Partner only).
*   **Profit Queries (Admin/Partner only):**
    *   `d`: Profits for the current day.
    *   `d-[Day]` (e.g., `d-15`): Profits for a specific day of the current month.
    *   `h`: Profits for the current hour.
    *   `h-[Hour]` (e.g., `h-14`): Profits for a specific hour (0-23).
*   **Broadcasting (Admin only):**
    *   `o`: Broadcasts "Shop is Open".
    *   `c`: Broadcasts "Shop is Closed".
    *   `o-c`: Broadcasts "Shop is Closed Temporarily".
    *   `ad [Message]`: Broadcasts a custom announcement.
*   **General:**
    *   `help` or `مساعدة`: Shows available commands based on user role.

## Building and Running

*   **Development:** `npm run dev`
*   **Build:** `npm run build`
*   **Start:** `npm run start`
*   **Lint:** `npm run lint`
*   **Post-install:** `prisma generate` is run automatically.
*   **Database Migrations:** Use `npx prisma migrate dev` for development.

## Testing

*   A basic logic test script is available at `test-bot-logic.ts`.
*   To run it (requires configured database): `npx ts-node test-bot-logic.ts` (Note: `ts-node` might need to be configured for Next.js/Prisma).

## Development Conventions

*   **Role-Based Access:** Always check permissions using `isAllowed` in `lib/bot/permissions.ts` before sensitive operations.
*   **BigInt Handling:** Telegram IDs are stored as `BigInt`. Use `.toString()` when sending to APIs or JSON.
*   **Rate Limiting:** The `broadcastMessage` function includes a 100ms delay between messages to respect Telegram's rate limits.
*   **Language:** The bot responds in Arabic, but commands are mixed (English abbreviations and Arabic).
