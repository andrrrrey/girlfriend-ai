jest.mock("@repo/config", () => ({ loadEnv: () => ({ AI_HOST: "ai", AI_PORT: 8081 }) }));

import { parseSse } from "./ai-client";

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
}

async function collect(chunks: string[]) {
  const out: Record<string, unknown>[] = [];
  for await (const e of parseSse(streamOf(chunks))) out.push(e);
  return out;
}

describe("parseSse", () => {
  it("собирает событие, разрезанное между чанками", async () => {
    const events = await collect(['data: {"cont', 'ent":"При', 'вет"}\n\n', 'data: {"done":true}\n\n']);
    expect(events).toEqual([{ content: "Привет" }, { done: true }]);
  });

  it("останавливается на [DONE] и пропускает невалидные строки", async () => {
    const events = await collect(['data: oops\n\ndata: {"content":"a"}\n\ndata: [DONE]\n\ndata: {"content":"b"}\n\n']);
    expect(events).toEqual([{ content: "a" }]);
  });

  it("понимает CRLF и последнюю строку без перевода строки", async () => {
    const events = await collect(['data: {"content":"a"}\r\n\r\n', 'data: {"content":"b"}']);
    expect(events).toEqual([{ content: "a" }, { content: "b" }]);
  });
});
