export type SseMessage = { event: string; data: unknown };

/** Parses complete SSE frames out of a buffer; returns the unparsed remainder. */
export function parseSseFrames(buffer: string): { messages: SseMessage[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const frames = normalized.split("\n\n");
  const rest = frames.pop() ?? "";
  const messages: SseMessage[] = [];
  for (const frame of frames) {
    let event = "message";
    const data: string[] = [];
    for (const line of frame.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
    }
    if (!data.length) continue;
    try {
      messages.push({ event, data: JSON.parse(data.join("\n")) });
    } catch {
      // Skip frames that are not JSON; the server only sends JSON.
    }
  }
  return { messages, rest };
}

export async function readEventStream(
  body: ReadableStream<Uint8Array>,
  onMessage: (message: SseMessage) => void,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parsed = parseSseFrames(buffer);
    buffer = parsed.rest;
    parsed.messages.forEach(onMessage);
  }
  const tail = parseSseFrames(`${buffer}${decoder.decode()}\n\n`);
  tail.messages.forEach(onMessage);
}
