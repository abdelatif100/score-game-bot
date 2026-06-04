import { prisma } from '@/lib/db/prisma';
import { Role, User } from '@prisma/client';

export async function getOrCreateUser(telegramId: number, username?: string, firstName?: string): Promise<User> {
  const user = await prisma.user.findUnique({
    where: { telegramId: BigInt(telegramId) },
  });

  if (user) {
    return user;
  }

  return await prisma.user.create({
    data: {
      telegramId: BigInt(telegramId),
      username,
      firstName,
      role: Role.CUSTOMER,
    },
  });
}

export function isAllowed(user: User, requiredRoles: Role[]): boolean {
  return requiredRoles.includes(user.role);
}
