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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
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

  // ─── Voice message: upload audio → STT → AI response (streamed) ───

  @Post(":id/voice")
  @UseInterceptors(FileInterceptor("audio", { limits: { fileSize: 25 * 1024 * 1024 } }))
  async sendVoiceMessage(
    @Req() req: any,
    @Res() res: Response,
    @Param("id") id: string,
    @UploadedFile() file: { buffer: Buffer; mimetype: string; originalname: string },
  ) {
    if (!file) {
      res.status(400).json({ error: "Audio file is required" });
      return;
    }

    try {
      const chat = await this.chatsService.getChat(id, req.user.id);

      // 1. Send audio to AI service for STT (Whisper)
      // Copy buffer to avoid Node.js Buffer pool issues with Blob
      const audioBuffer = Buffer.from(file.buffer);
      const formData = new FormData();
      formData.append(
        "audio",
        new Blob([audioBuffer], { type: file.mimetype }),
        file.originalname || "audio.webm",
      );

      console.log("[voice] Sending STT request to AI service...");
      const sttRes = await fetch(`${AI_BASE}/ai/stt`, {
        method: "POST",
        body: formData,
      });
      console.log("[voice] STT response status:", sttRes.status);

      if (!sttRes.ok) {
        const err = await sttRes.json().catch(() => ({ error: "STT failed" }));
        console.error("[voice] STT failed:", err);
        res.status(sttRes.status || 502).json(err);
        return;
      }

      const { text: transcribedText } = (await sttRes.json()) as { text: string };

      if (!transcribedText) {
        res.status(400).json({ error: "Could not transcribe audio" });
        return;
      }

      // 2. Save user voice message
      await this.chatsService.saveMessage(id, "user", transcribedText, { type: "audio" });

      // 3. Get history and stream AI response
      const history = await this.chatsService.getMessageHistory(id);

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

      // Send transcribed text first so frontend can display it
      res.write(`data: ${JSON.stringify({ transcription: transcribedText })}\n\n`);

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
        await this.chatsService.saveMessage(id, "assistant", fullContent);
      }

      res.end();
    } catch (err: any) {
      console.error("[voice] Error:", err.message, err.cause || "");
      if (!res.headersSent) {
        res.status(500).json({ error: "Voice processing failed", details: err.message });
      } else {
        res.end();
      }
    }
  }

  // ─── TTS: generate speech for a message via ElevenLabs ────────

  @Post(":id/messages/:msgId/tts")
  async messageTTS(
    @Req() req: any,
    @Res() res: Response,
    @Param("id") chatId: string,
    @Param("msgId") msgId: string,
  ) {
    try {
      const chat = await this.chatsService.getChat(chatId, req.user.id);
      const message = await this.chatsService.getMessage(msgId, chatId, req.user.id);

      // Use character's voiceId if available
      const voiceId = chat.character?.voiceId || undefined;

      const ttsRes = await fetch(`${AI_BASE}/ai/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: message.content,
          voiceId,
        }),
      });

      if (!ttsRes.ok || !ttsRes.body) {
        const err = await ttsRes.json().catch(() => ({ error: "TTS failed" }));
        res.status(ttsRes.status || 502).json(err);
        return;
      }

      const audioBuffer = Buffer.from(await ttsRes.arrayBuffer());
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Content-Length", audioBuffer.length);
      res.send(audioBuffer);
    } catch (err: any) {
      if (!res.headersSent) {
        res.status(500).json({ error: "TTS processing failed", details: err.message });
      }
    }
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
