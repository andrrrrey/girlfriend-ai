import { Injectable, ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../prisma.service";

@Injectable()
export class CommentsService {
  constructor(private prisma: PrismaService) {}

  async list(
    characterId: string,
    cursor?: string,
    limit: number = 20,
    userId?: string,
  ) {
    const comments = await this.prisma.comment.findMany({
      where: { characterId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        user: {
          select: { id: true, nickname: true, avatarUrl: true },
        },
      },
    });

    const hasMore = comments.length > limit;
    const items = hasMore ? comments.slice(0, limit) : comments;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    const commentIds = items.map((c) => c.id);

    const [likeCounts, userLikes] = await Promise.all([
      this.prisma.like.groupBy({
        by: ["targetId"],
        where: { targetType: "comment", targetId: { in: commentIds } },
        _count: true,
      }),
      userId
        ? this.prisma.like.findMany({
            where: {
              userId,
              targetType: "comment",
              targetId: { in: commentIds },
            },
            select: { targetId: true },
          })
        : Promise.resolve([]),
    ]);

    const countMap = new Map(likeCounts.map((c) => [c.targetId, c._count]));
    const likedSet = new Set(userLikes.map((l) => l.targetId));

    const enriched = items.map((c) => ({
      id: c.id,
      content: c.content,
      createdAt: c.createdAt.toISOString(),
      user: c.user,
      likeCount: countMap.get(c.id) ?? 0,
      liked: likedSet.has(c.id),
    }));

    return { items: enriched, nextCursor };
  }

  async create(userId: string, characterId: string, content: string) {
    const comment = await this.prisma.comment.create({
      data: { userId, characterId, content },
      include: {
        user: {
          select: { id: true, nickname: true, avatarUrl: true },
        },
      },
    });

    return {
      id: comment.id,
      content: comment.content,
      createdAt: comment.createdAt.toISOString(),
      user: comment.user,
      likeCount: 0,
      liked: false,
    };
  }

  async remove(userId: string, commentId: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
    });

    if (!comment || comment.userId !== userId) {
      throw new ForbiddenException();
    }

    await this.prisma.comment.update({
      where: { id: commentId },
      data: { deletedAt: new Date() },
    });
  }

  async getCount(characterId: string): Promise<{ count: number }> {
    const count = await this.prisma.comment.count({
      where: { characterId, deletedAt: null },
    });
    return { count };
  }
}
