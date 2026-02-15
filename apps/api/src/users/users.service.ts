import { Injectable, UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../prisma.service";

const BCRYPT_ROUNDS = 10;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        nickname: true,
        avatarUrl: true,
        role: true,
        subscription: true,
        lang: true,
        createdAt: true,
        socialLinks: {
          select: { provider: true, url: true },
        },
      },
    });
    return user;
  }

  async updateProfile(
    userId: string,
    data: { nickname?: string; avatarUrl?: string; lang?: string },
  ) {
    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        email: true,
        nickname: true,
        avatarUrl: true,
        role: true,
        subscription: true,
        lang: true,
      },
    });
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException("Current password is incorrect");
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
  }

  async upsertSocialLink(userId: string, provider: string, url: string) {
    return this.prisma.socialLink.upsert({
      where: { userId_provider: { userId, provider } },
      update: { url },
      create: { userId, provider, url },
      select: { provider: true, url: true },
    });
  }

  async deleteSocialLink(userId: string, provider: string) {
    await this.prisma.socialLink.deleteMany({
      where: { userId, provider },
    });
  }

  async getSocialLinks(userId: string) {
    return this.prisma.socialLink.findMany({
      where: { userId },
      select: { provider: true, url: true },
    });
  }
}
