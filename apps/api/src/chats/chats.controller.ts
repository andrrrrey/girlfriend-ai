import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Response } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ChatsService } from "./chats.service";
import { CreateChatDto } from "./dto/create-chat.dto";
import { SendMessageDto } from "./dto/send-message.dto";
import { UpdateChatDto } from "./dto/update-chat.dto";
import { loadEnv } from "@repo/config";

const env = loadEnv();
const AI_BASE = `http://localhost:${env.AI_PORT}`;

@Controller("chats")
@UseGuards(JwtAuthGuard)
export class ChatsController {
  constructor(private readonly chatsService: ChatsService) {}

  @Post()
  async createChat(@Req() req: any, @Body() dto: CreateChatDto) {
    return this.chatsService.createChat(req.user.id, dto.characterId, dto.title);
  }

  @Get()
  async listChats(
    @Req() req: any,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    return this.chatsService.getUserChats(
      req.user.id,
      cursor,
      limit ? parseInt(limit, 10) : undefined,
    );
  }

  @Get(":id")
  async getChat(@Req() req: any, @Param("id") id: string) {
    return this.chatsService.getChat(id, req.user.id);
  }

  @Patch(":id")
  async updateChat(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: UpdateChatDto,
  ) {
    return this.chatsService.updateChat(id, req.user.id, dto.title!);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteChat(@Req() req: any, @Param("id") id: string) {
    await this.chatsService.deleteChat(id, req.user.id);
  }

  @Get(":id/messages")
  async getMessages(
    @Req() req: any,
    @Param("id") id: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    return this.chatsService.getMessages(
      id,
      req.user.id,
      cursor,
      limit ? parseInt(limit, 10) : undefined,
    );
  }

  @Post(":id/messages")
  async sendMessage(
    @Req() req: any,
    @Res() res: Response,
    @Param("id") id: string,
    @Body() dto: SendMessageDto,
  ) {
    const chat = await this.chatsService.getChat(id, req.user.id);

    // Save user message
    await this.chatsService.saveMessage(id, "user", dto.content);

    // Get recent history for context
    const history = await this.chatsService.getMessageHistory(id);

    // Stream from AI service
    const aiRes = await fetch(`${AI_BASE}/ai/chat/completion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: history.map((m) => ({ role: m.role, content: m.content })),
        characterId: chat.characterId,
      }),
    });

    if (!aiRes.ok || !aiRes.body) {
      const err = await aiRes.json().catch(() => ({ error: "AI service unavailable" }));
      res.status(aiRes.status || 502).json(err);
      return;
    }

    // Forward SSE stream to client
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const reader = aiRes.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        res.write(text);

        // Extract content from SSE data for saving
        const lines = text.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ") && line !== "data: [DONE]") {
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed.content) fullContent += parsed.content;
            } catch {
              // ignore parse errors
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Save assistant's full response
    if (fullContent) {
      await this.chatsService.saveMessage(id, "assistant", fullContent);
    }

    res.end();
  }

  @Delete(":id/messages/:msgId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMessage(
    @Req() req: any,
    @Param("id") chatId: string,
    @Param("msgId") msgId: string,
  ) {
    await this.chatsService.deleteMessage(msgId, chatId, req.user.id);
  }

  @Post(":id/messages/:msgId/regenerate")
  async regenerateMessage(
    @Req() req: any,
    @Res() res: Response,
    @Param("id") chatId: string,
    @Param("msgId") msgId: string,
  ) {
    const chat = await this.chatsService.getChat(chatId, req.user.id);

    // Soft-delete the target message and everything after it
    const after = await this.chatsService.getMessagesAfter(chatId, msgId);
    const idsToDelete = [msgId, ...after.map((m) => m.id)];
    await this.chatsService.softDeleteMessages(idsToDelete);

    // Get remaining history
    const history = await this.chatsService.getMessageHistory(chatId);

    // Stream new AI response
    const aiRes = await fetch(`${AI_BASE}/ai/chat/completion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: history.map((m) => ({ role: m.role, content: m.content })),
        characterId: chat.characterId,
      }),
    });

    if (!aiRes.ok || !aiRes.body) {
      const err = await aiRes.json().catch(() => ({ error: "AI service unavailable" }));
      res.status(aiRes.status || 502).json(err);
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const reader = aiRes.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        res.write(text);

        const lines = text.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ") && line !== "data: [DONE]") {
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed.content) fullContent += parsed.content;
            } catch {
              // ignore
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (fullContent) {
      await this.chatsService.saveMessage(chatId, "assistant", fullContent);
    }

    res.end();
  }

}
