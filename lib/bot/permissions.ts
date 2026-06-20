import { prisma } from '../db/prisma';
import pkg from '@prisma/client';
const { Role } = pkg;
import type { User } from '@prisma/client';

export async function getOrCreateUser(telegramId: number, username?: string, firstName?: string): Promise<User> {
  const user = await prisma.user.findUnique({
    where: { telegramId: BigInt(telegramId) },
  });

  if (user) {
    return user;
  }

  // Check if this is the first user
  const userCount = await prisma.user.count();
  const role = userCount === 0 ? Role.ADMIN : Role.CUSTOMER;

  return await prisma.user.create({
    data: {
      telegramId: BigInt(telegramId),
      username,
      firstName,
      role: role,
    },
  });
}

export function isAllowed(user: User, requiredRoles: Role[]): boolean {
  return requiredRoles.includes(user.role);
}
