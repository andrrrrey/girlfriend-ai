import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { S3Service } from "../s3/s3.service";
import { loadEnv } from "@repo/config";

const env = loadEnv();

@Injectable()
export class LikesService {
  constructor(private prisma: PrismaService) {}

  /**
   * Возвращает надбавку лайков (boostLikes) из админки для одной цели.
   * character → Character.boostLikes; short/gallery_item → AiJob.boostLikes.
   */
  private async getBoost(targetType: string, targetId: string): Promise<number> {
    if (targetType === "character") {
      const c = await this.prisma.character.findUnique({
        where: { id: targetId }, select: { boostLikes: true },
      });
      return c?.boostLikes ?? 0;
    }
    if (targetType === "short" || targetType === "gallery_item") {
      const j = await this.prisma.aiJob.findUnique({
        where: { id: targetId }, select: { boostLikes: true },
      });
      return j?.boostLikes ?? 0;
    }
    return 0;
  }

  /** Пакетная версия getBoost: id → надбавка (0, если нет). */
  private async getBoostMap(targetType: string, targetIds: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (targetType === "character") {
      const rows = await this.prisma.character.findMany({
        where: { id: { in: targetIds } }, select: { id: true, boostLikes: true },
      });
      for (const r of rows) map.set(r.id, r.boostLikes);
    } else if (targetType === "short" || targetType === "gallery_item") {
      const rows = await this.prisma.aiJob.findMany({
        where: { id: { in: targetIds } }, select: { id: true, boostLikes: true },
      });
      for (const r of rows) map.set(r.id, r.boostLikes);
    }
    return map;
  }

  async toggle(
    userId: string,
    targetType: string,
    targetId: string,
  ): Promise<{ liked: boolean; count: number }> {
    const existing = await this.prisma.like.findUnique({
      where: {
        userId_targetType_targetId: { userId, targetType, targetId },
      },
    });

    if (existing) {
      await this.prisma.like.delete({ where: { id: existing.id } });
    } else {
      await this.prisma.like.create({
        data: { userId, targetType, targetId },
      });
    }

    const [realCount, boost] = await Promise.all([
      this.prisma.like.count({ where: { targetType, targetId } }),
      this.getBoost(targetType, targetId),
    ]);

    return { liked: !existing, count: realCount + boost };
  }

  async getStatus(
    userId: string | null,
    targetType: string,
    targetId: string,
  ): Promise<{ liked: boolean; count: number }> {
    const [count, liked, boost] = await Promise.all([
      this.prisma.like.count({ where: { targetType, targetId } }),
      userId
        ? this.prisma.like
            .findUnique({
              where: {
                userId_targetType_targetId: { userId, targetType, targetId },
              },
            })
            .then((r) => !!r)
        : Promise.resolve(false),
      this.getBoost(targetType, targetId),
    ]);

    return { liked, count: count + boost };
  }

  async getCount(
    targetType: string,
    targetId: string,
  ): Promise<{ count: number }> {
    const [count, boost] = await Promise.all([
      this.prisma.like.count({ where: { targetType, targetId } }),
      this.getBoost(targetType, targetId),
    ]);
    return { count: count + boost };
  }

  async batchStatus(
    userId: string,
    targetType: string,
    targetIds: string[],
  ): Promise<Record<string, { liked: boolean; count: number }>> {
    const [counts, userLikes, boostMap] = await Promise.all([
      this.prisma.like.groupBy({
        by: ["targetId"],
        where: { targetType, targetId: { in: targetIds } },
        _count: true,
      }),
      this.prisma.like.findMany({
        where: { userId, targetType, targetId: { in: targetIds } },
        select: { targetId: true },
      }),
      this.getBoostMap(targetType, targetIds),
    ]);

    const countMap = new Map(counts.map((c) => [c.targetId, c._count]));
    const likedSet = new Set(userLikes.map((l) => l.targetId));

    const result: Record<string, { liked: boolean; count: number }> = {};
    for (const id of targetIds) {
      result[id] = {
        liked: likedSet.has(id),
        count: (countMap.get(id) ?? 0) + (boostMap.get(id) ?? 0),
      };
    }
    return result;
  }

  private async toSignedUrl(url: string | undefined | null): Promise<string | null> {
    if (!url) return null;
    const publicBase = env.S3_PUBLIC_URL || env.S3_ENDPOINT;
    if (publicBase) {
      const key = S3Service.extractKeyFromUrl(url, publicBase, env.S3_BUCKET ?? "media");
      if (key) return `/api-proxy/media/stream?key=${encodeURIComponent(key)}`;
    }
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return `/api-proxy/media/proxy?url=${encodeURIComponent(url)}`;
    }
    return url;
  }

  private async signOutput(output: unknown): Promise<unknown> {
    if (!output || typeof output !== "object") return output;
    const o = output as Record<string, unknown>;
    if (typeof o["url"] === "string") {
      return { ...o, url: await this.toSignedUrl(o["url"] as string) };
    }
    return output;
  }

  async getMyLiked(
    userId: string,
    targetType: string,
    page: number = 1,
    limit: number = 20,
  ) {
    const skip = (page - 1) * limit;

    const [likes, total] = await Promise.all([
      this.prisma.like.findMany({
        where: { userId, targetType },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.like.count({ where: { userId, targetType } }),
    ]);

    const targetIds = likes.map((l) => l.targetId);

    let items: any[] = [];

    if (targetType === "character") {
      const characters = await this.prisma.character.findMany({
        where: { id: { in: targetIds }, deletedAt: null },
      });
      const charMap = new Map(characters.map((c) => [c.id, c]));
      items = likes
        .map((l) => charMap.get(l.targetId))
        .filter(Boolean);
    } else if (
      targetType === "gallery_item" ||
      targetType === "short"
    ) {
      const jobs = await this.prisma.aiJob.findMany({
        where: { id: { in: targetIds }, status: "completed" },
        include: { user: { select: { id: true, nickname: true, avatarUrl: true } } },
      });
      const jobMap = new Map(jobs.map((j) => [j.id, j]));
      const rawItems = likes
        .map((l) => jobMap.get(l.targetId))
        .filter((j): j is NonNullable<typeof j> => !!j);
      items = await Promise.all(rawItems.map(async (job) => ({
        ...job,
        output: await this.signOutput(job.output),
      })));
    }

    return { items, total };
  }
}
