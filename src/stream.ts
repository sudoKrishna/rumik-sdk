import { promises as fs } from "node:fs";
import WebSocket from "ws";
import { StreamError } from "./error.js";
import { pcmToWav } from "./audio.js";
import type { StreamParams } from "./types.js";

interface DoneMessage {
  type: "done";
  request_id?: string;
  credits_used?: number;
}

interface ErrorMessage {
  type: "error";
  error?: string;
  code?: string;
}

function wsUrl(baseUrl: string, path: string): string {
  const url = new URL(path, baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

export function SpeechStream(
  apiKey: string,
  baseUrl: string,
  params: StreamParams,
) {
  if (!params.text) {
    throw new TypeError("`text` must not be empty.");
  }

  let requestId: string | undefined;
  let creditsUsed: number | undefined;
  let ws: WebSocket | undefined;
  let closed = false;
  let error: unknown;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;

  const chunks: Uint8Array[] = [];
  const queue: (Uint8Array | null)[] = [];
  const waiters: ((value: IteratorResult<Uint8Array>) => void)[] = [];

  const idleTimeoutMs = (params.idleTimeout ?? 30) * 1000;

  function finish(): void {
    if (closed) return;

    closed = true;
    clearTimeout(idleTimer);

    const waiter = waiters.shift();

    if (waiter) {
      waiter({ value: undefined, done: true });
    } else {
      queue.push(null);
    }

    while (waiters.length) {
      waiters.shift()?.({ value: undefined, done: true });
    }
  }

  function fail(err: unknown): void {
    if (closed) return;

    error = err;
    closed = true;
    clearTimeout(idleTimer);

    while (waiters.length) {
      waiters.shift()?.({ value: undefined, done: true });
    }
  }

  function push(chunk: Uint8Array): void {
    const waiter = waiters.shift();

    if (waiter) {
      waiter({ value: chunk, done: false });
    } else {
      queue.push(chunk);
    }
  }

  function resetIdleTimer(): void {
    clearTimeout(idleTimer);

    idleTimer = setTimeout(() => {
      fail(
        StreamError(
          `No audio received for ${idleTimeoutMs / 1000}s (idle timeout).`,
        ),
      );

      ws?.close();
    }, idleTimeoutMs);
  }

  const connected = new Promise<void>((resolve, reject) => {
    const url = wsUrl(baseUrl, "/v1/speech/stream");

    ws = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      handshakeTimeout: params.timeout,
    });

    ws.once("open", () => {
      ws?.send(
        JSON.stringify({
          text: params.text,
          model: params.model ?? "muga",
          description: params.description,
          speaker: params.speaker,
        }),
      );

      resetIdleTimer();
      resolve();
    });

    ws.on("message", (data: Buffer, isBinary: boolean) => {
      resetIdleTimer();

      if (isBinary) {
        const chunk = new Uint8Array(data);
        chunks.push(chunk);
        push(chunk);
        return;
      }

      try {
        const msg = JSON.parse(
          data.toString("utf8"),
        ) as DoneMessage | ErrorMessage;

        if (msg.type === "done") {
          requestId = msg.request_id;
          creditsUsed = msg.credits_used;
          finish();
        } else if (msg.type === "error") {
          fail(StreamError(msg.error ?? "Stream error.", msg));
        }
      } catch {
        return;
      }
    });

    ws.once("error", (err: Error) => {
      const streamError = StreamError(err.message, err);
      reject(streamError);
      fail(streamError);
    });

    ws.once("close", () => {
      clearTimeout(idleTimer);

      if (!closed) {
        finish();
      }
    });
  });

  async function* iterate(): AsyncGenerator<Uint8Array> {
    await connected;

    while (true) {
      if (queue.length > 0) {
        const next = queue.shift()!;

        if (next === null) {
          if (error) throw error;
          return;
        }

        yield next;
        continue;
      }

      if (closed) {
        if (error) throw error;
        return;
      }

      const result = await new Promise<IteratorResult<Uint8Array>>(
        (resolve) => waiters.push(resolve),
      );

      if (result.done) {
        if (error) throw error;
        return;
      }

      yield result.value;
    }
  }

  async function read(): Promise<Uint8Array> {
    for await (const _ of iterate()) {
      void _;
    }

    return concat(chunks);
  }

  async function save(path: string): Promise<void> {
    const pcm = await read();
    await fs.writeFile(path, pcmToWav(pcm));
  }

  function close(): void {
    if (closed) return;

    closed = true;
    clearTimeout(idleTimer);
    ws?.close();

    while (waiters.length) {
      waiters.shift()?.({ value: undefined, done: true });
    }
  }

  async function dispose(): Promise<void> {
    close();
  }

  const stream = {
    get requestId() {
      return requestId;
    },

    get creditsUsed() {
      return creditsUsed;
    },

    read,
    save,
    close,
    [Symbol.asyncIterator]: iterate,
    [Symbol.asyncDispose ?? Symbol.for("asyncDispose")]: dispose,
  };

  return stream;
}

export type SpeechStream = ReturnType<typeof SpeechStream>;

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, chunk) => n + chunk.byteLength, 0);
  const out = new Uint8Array(total);

  let offset = 0;

  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return out;
}