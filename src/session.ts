import WebSocket from "ws";
import { StreamError } from "./error.js";
import type { SessionEvent, SessionParams } from "./types.js";

interface ServerEventMessage {
  type: "utterance_done" | "utterance_cancelled" | "error";
  request_id?: string;
  credits_used?: number;
  reason?: "interrupt" | "cancel";
  error?: string;
  code?: string;
}

function wsUrl(baseUrl: string, path: string): string {
  const url = new URL(path, baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

export function SpeechSession(
  apiKey: string,
  baseUrl: string,
  params: SessionParams,
) {
  let lastRequestId: string | undefined;
  let lastCreditsUsed: number | undefined;
  let ws: WebSocket | undefined;
  let closed = false;
  let error: unknown;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;

  const queue: (SessionEvent | null)[] = [];
  const waiters: ((value: IteratorResult<SessionEvent>) => void)[] = [];
  const idleTimeoutMs = (params.idleTimeout ?? 30) * 1000;

  function emit(event: SessionEvent): void {
    const waiter = waiters.shift();

    if (waiter) {
      waiter({ value: event, done: false });
    } else {
      queue.push(event);
    }
  }

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

  function resetIdleTimer(): void {
    clearTimeout(idleTimer);

    idleTimer = setTimeout(() => {
      fail(
        StreamError(
          `No audio for ${idleTimeoutMs / 1000}s (idle timeout).`,
        ),
      );
      ws?.close();
    }, idleTimeoutMs);
  }

  const ready = new Promise<void>((resolve, reject) => {
    const url = wsUrl(baseUrl, "/v1/speech/session");

    ws = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      handshakeTimeout: params.timeout,
    });

    ws.once("open", () => {
      ws?.send(
        JSON.stringify({
          type: "configure",
          model: params.model ?? "muga",
          description: params.description,
          speaker: params.speaker,
        }),
      );

      resolve();
    });

    ws.on("message", (data: Buffer, isBinary: boolean) => {
      resetIdleTimer();

      if (isBinary) {
        emit({
          type: "audio_chunk",
          data: new Uint8Array(data),
        });
        return;
      }

      try {
        const msg = JSON.parse(
          data.toString("utf8"),
        ) as ServerEventMessage;

        if (msg.type === "utterance_done") {
          lastRequestId = msg.request_id;
          lastCreditsUsed = msg.credits_used;

          emit({
            type: "utterance_done",
            requestId: msg.request_id,
            creditsUsed: msg.credits_used,
          });
        } else if (msg.type === "utterance_cancelled") {
          lastRequestId = msg.request_id;

          emit({
            type: "utterance_cancelled",
            requestId: msg.request_id,
            reason: msg.reason ?? "cancel",
          });
        } else if (msg.type === "error") {
          fail(StreamError(msg.error ?? "Session error.", msg));
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
      finish();
    });
  });

  async function send(text: string): Promise<void> {
    if (!text) {
      throw new TypeError("`text` must not be empty.");
    }

    await ready;

    if (closed) {
      throw StreamError("Session is closed.");
    }

    ws!.send(JSON.stringify({ type: "send", text }));
    resetIdleTimer();
  }

  async function interrupt(): Promise<void> {
    await ready;

    if (closed) return;

    ws!.send(JSON.stringify({ type: "interrupt" }));
  }

  function close(): void {
    if (closed) return;

    ws?.close();
    finish();
  }

  async function* iterate(): AsyncGenerator<SessionEvent> {
    await ready;

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

      const result = await new Promise<IteratorResult<SessionEvent>>(
        (resolve) => waiters.push(resolve),
      );

      if (result.done) {
        if (error) throw error;
        return;
      }

      yield result.value;
    }
  }

  async function* iterAudio(): AsyncGenerator<Uint8Array> {
    for await (const event of iterate()) {
      if (event.type === "audio_chunk") {
        yield event.data;
      }
    }
  }

  async function dispose(): Promise<void> {
    close();
  }

  return {
    get lastRequestId() {
      return lastRequestId;
    },

    get lastCreditsUsed() {
      return lastCreditsUsed;
    },

    send,
    interrupt,
    close,
    iterAudio,
    [Symbol.asyncIterator]: iterate,
    [Symbol.asyncDispose ?? Symbol.for("asyncDispose")]: dispose,
  };
}

export type SpeechSession = ReturnType<typeof SpeechSession>;