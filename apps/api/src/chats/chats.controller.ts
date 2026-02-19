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
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiQuery } from "@nestjs/swagger";
import { Response } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { DemoService } from "../demo/demo.service";
import { ChatsService } from "./chats.service";
import { CreateChatDto } from "./dto/create-chat.dto";
import { EditMessageDto } from "./dto/edit-message.dto";
import { SendMessageDto } from "./dto/send-message.dto";
import { UpdateChatDto } from "./dto/update-chat.dto";
import { loadEnv } from "@repo/config";

const env = loadEnv();
const AI_BASE = `http://localhost:${env.AI_PORT}`;

// Parse token usage from SSE stream chunks
function extractUsageFromLine(line: string): number {
  if (!line.startsWith("data: ") || line === "data: [DONE]") return 0;
  try {
    const parsed = JSON.parse(line.slice(6));
    return parsed.usage?.totalTokens ?? 0;
  } catch {
    return 0;
  }
}

@ApiTags("chats")
@ApiBearerAuth()
@Controller("chats")
@UseGuards(JwtAuthGuard)
export class ChatsController {
  constructor(
    private readonly chatsService: ChatsService,
    private readonly demoService: DemoService,
  ) {}

  @ApiOperation({ summary: "Create a new chat session with a character" })
  @Post()
  async createChat(@Req() req: any, @Body() dto: CreateChatDto) {
    return this.chatsService.createChat(req.user.id, dto.characterId, dto.title);
  }

  @ApiOperation({ summary: "List user chats with pagination" })
  @ApiQuery({ name: "cursor", required: false })
  @ApiQuery({ name: "limit", required: false })
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

  @ApiOperation({ summary: "Get a specific chat session" })
  @Get(":id")
  async getChat(@Req() req: any, @Param("id") id: string) {
    return this.chatsService.getChat(id, req.user.id);
  }

  @ApiOperation({ summary: "Update chat title" })
  @Patch(":id")
  async updateChat(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: UpdateChatDto,
  ) {
    return this.chatsService.updateChat(id, req.user.id, dto.title!);
  }

  @ApiOperation({ summary: "Soft delete a chat" })
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteChat(@Req() req: any, @Param("id") id: string) {
    await this.chatsService.deleteChat(id, req.user.id);
  }

  @ApiOperation({ summary: "Get chat messages with cursor pagination" })
  @ApiQuery({ name: "cursor", required: false })
  @ApiQuery({ name: "limit", required: false })
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

  @ApiOperation({ summary: "Send a message and get streaming AI response (SSE)" })
  @Post(":id/messages")
  async sendMessage(
    @Req() req: any,
    @Res() res: Response,
    @Param("id") id: string,
    @Body() dto: SendMessageDto,
  ) {
    // Check demo limits (throws 429 if exceeded)
    await this.demoService.checkAndIncrementMessage(req.user.id, req.user.subscription);

    const chat = await this.chatsService.getChat(id, req.user.id);

    // Create AiJob record
    const aiJob = await this.chatsService.createAiJob(req.user.id, "chat", {
      chatSessionId: id,
      characterId: chat.characterId,
    });

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

    // Support client abort
    let aborted = false;
    req.on("close", () => { aborted = true; });

    const reader = aiRes.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = "";
    let tokensUsed = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done || aborted) break;

        const text = decoder.decode(value, { stream: true });
        res.write(text);

        // Extract content and token usage from SSE data
        const lines = text.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ") && line !== "data: [DONE]") {
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed.content) fullContent += parsed.content;
              if (parsed.usage?.totalTokens) tokensUsed = parsed.usage.totalTokens;
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

    // Record job completion and usage
    await this.chatsService.completeAiJob(aiJob.id, tokensUsed || undefined);
    await this.chatsService.logUsage(req.user.id, "chat_message", tokensUsed || undefined);

    res.end();
  }

  // ─── Voice message: upload audio → STT → AI response (streamed) ───

  @ApiOperation({ summary: "Send voice message: audio → STT → AI response (SSE)" })
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

    // STT/TTS blocked for free/demo users
    this.demoService.checkVoiceAllowed(req.user.subscription);

    try {
      const chat = await this.chatsService.getChat(id, req.user.id);

      // 1. Send audio to AI service for STT (Whisper)
      const audioBuffer = Buffer.from(file.buffer);
      const formData = new FormData();
      formData.append(
        "audio",
        new Blob([audioBuffer], { type: file.mimetype }),
        file.originalname || "audio.webm",
      );

      const sttRes = await fetch(`${AI_BASE}/ai/stt`, {
        method: "POST",
        body: formData,
      });

      if (!sttRes.ok) {
        const err = await sttRes.json().catch(() => ({ error: "STT failed" }));
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
      await this.chatsService.logUsage(req.user.id, "stt");

      // 3. Get history and stream AI response
      const history = await this.chatsService.getMessageHistory(id);

      const aiJob = await this.chatsService.createAiJob(req.user.id, "chat", {
        chatSessionId: id,
        characterId: chat.characterId,
      });

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

      let aborted = false;
      req.on("close", () => { aborted = true; });

      const reader = aiRes.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";
      let tokensUsed = 0;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done || aborted) break;

          const text = decoder.decode(value, { stream: true });
          res.write(text);

          const lines = text.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ") && line !== "data: [DONE]") {
              try {
                const parsed = JSON.parse(line.slice(6));
                if (parsed.content) fullContent += parsed.content;
                if (parsed.usage?.totalTokens) tokensUsed = parsed.usage.totalTokens;
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

      await this.chatsService.completeAiJob(aiJob.id, tokensUsed || undefined);
      await this.chatsService.logUsage(req.user.id, "chat_message", tokensUsed || undefined);

      res.end();
    } catch (err: any) {
      if (!res.headersSent) {
        res.status(500).json({ error: "Voice processing failed", details: err.message });
      } else {
        res.end();
      }
    }
  }

  // ─── TTS: generate speech for a message via ElevenLabs → S3 ────────

  @ApiOperation({ summary: "Generate TTS audio for a message. Returns URL (S3) or binary fallback" })
  @Post(":id/messages/:msgId/tts")
  async messageTTS(
    @Req() req: any,
    @Res() res: Response,
    @Param("id") chatId: string,
    @Param("msgId") msgId: string,
  ) {
    // TTS blocked for free/demo users
    this.demoService.checkVoiceAllowed(req.user.subscription);

    try {
      const chat = await this.chatsService.getChat(chatId, req.user.id);
      const message = await this.chatsService.getMessage(msgId, chatId, req.user.id);

      const voiceId = chat.character?.voiceId || undefined;

      const ttsRes = await fetch(`${AI_BASE}/ai/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: message.content,
          voiceId,
        }),
      });

      if (!ttsRes.ok) {
        const err = await ttsRes.json().catch(() => ({ error: "TTS failed" }));
        res.status(ttsRes.status || 502).json(err);
        return;
      }

      const contentType = ttsRes.headers.get("content-type") || "";

      // If AI service returned JSON with URL (S3 path)
      if (contentType.includes("application/json")) {
        const data = await ttsRes.json() as { url: string; key: string };
        await this.chatsService.logUsage(req.user.id, "tts");
        res.json(data);
        return;
      }

      // Binary fallback (S3 not configured)
      const audioBuffer = Buffer.from(await ttsRes.arrayBuffer());
      await this.chatsService.logUsage(req.user.id, "tts");
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Content-Length", audioBuffer.length);
      res.send(audioBuffer);
    } catch (err: any) {
      if (!res.headersSent) {
        res.status(500).json({ error: "TTS processing failed", details: err.message });
      }
    }
  }

  // ─── Copy message (audit log) ────────────────────────────────

  @ApiOperation({ summary: "Record copy action for a message (audit)" })
  @Post(":id/messages/:msgId/copy")
  @HttpCode(HttpStatus.OK)
  async copyMessage(
    @Req() req: any,
    @Param("id") chatId: string,
    @Param("msgId") msgId: string,
  ) {
    // Verify message belongs to user's chat
    await this.chatsService.getMessage(msgId, chatId, req.user.id);
    await this.chatsService.recordCopy(msgId, req.user.id);
    return { ok: true };
  }

  @ApiOperation({ summary: "Soft delete a message" })
  @Delete(":id/messages/:msgId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMessage(
    @Req() req: any,
    @Param("id") chatId: string,
    @Param("msgId") msgId: string,
  ) {
    await this.chatsService.deleteMessage(msgId, chatId, req.user.id);
  }

  // ─── Edit message: update content + soft-delete subsequent messages + stream new AI response ───

  @ApiOperation({ summary: "Edit a message and stream regenerated AI response (SSE)" })
  @Patch(":id/messages/:msgId")
  async editMessage(
    @Req() req: any,
    @Res() res: Response,
    @Param("id") chatId: string,
    @Param("msgId") msgId: string,
    @Body() dto: EditMessageDto,
  ) {
    // Check demo limits (editing sends a new AI request)
    await this.demoService.checkAndIncrementMessage(req.user.id, req.user.subscription);

    const chat = await this.chatsService.getChat(chatId, req.user.id);

    // Update message content and soft-delete messages after it
    await this.chatsService.updateMessageContent(msgId, chatId, req.user.id, dto.content);

    // Create AiJob record
    const aiJob = await this.chatsService.createAiJob(req.user.id, "chat", {
      chatSessionId: chatId,
      characterId: chat.characterId,
    });

    // Get updated history and stream new AI response
    const history = await this.chatsService.getMessageHistory(chatId);

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

    let aborted = false;
    req.on("close", () => { aborted = true; });

    const reader = aiRes.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = "";
    let tokensUsed = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done || aborted) break;

        const text = decoder.decode(value, { stream: true });
        res.write(text);

        const lines = text.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ") && line !== "data: [DONE]") {
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed.content) fullContent += parsed.content;
              if (parsed.usage?.totalTokens) tokensUsed = parsed.usage.totalTokens;
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

    await this.chatsService.completeAiJob(aiJob.id, tokensUsed || undefined);
    await this.chatsService.logUsage(req.user.id, "chat_message", tokensUsed || undefined);

    res.end();
  }

  @ApiOperation({ summary: "Regenerate AI response for a message (SSE)" })
  @Post(":id/messages/:msgId/regenerate")
  async regenerateMessage(
    @Req() req: any,
    @Res() res: Response,
    @Param("id") chatId: string,
    @Param("msgId") msgId: string,
  ) {
    // Check demo limits (regenerating counts as a new message)
    await this.demoService.checkAndIncrementMessage(req.user.id, req.user.subscription);

    const chat = await this.chatsService.getChat(chatId, req.user.id);

    // Soft-delete the target message and everything after it
    const after = await this.chatsService.getMessagesAfter(chatId, msgId);
    const idsToDelete = [msgId, ...after.map((m) => m.id)];
    await this.chatsService.softDeleteMessages(idsToDelete);

    // Get remaining history
    const history = await this.chatsService.getMessageHistory(chatId);

    const aiJob = await this.chatsService.createAiJob(req.user.id, "chat", {
      chatSessionId: chatId,
      characterId: chat.characterId,
    });

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

    let aborted = false;
    req.on("close", () => { aborted = true; });

    const reader = aiRes.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = "";
    let tokensUsed = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done || aborted) break;

        const text = decoder.decode(value, { stream: true });
        res.write(text);

        const lines = text.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ") && line !== "data: [DONE]") {
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed.content) fullContent += parsed.content;
              if (parsed.usage?.totalTokens) tokensUsed = parsed.usage.totalTokens;
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

    await this.chatsService.completeAiJob(aiJob.id, tokensUsed || undefined);
    await this.chatsService.logUsage(req.user.id, "chat_message", tokensUsed || undefined);

    res.end();
  }
}
