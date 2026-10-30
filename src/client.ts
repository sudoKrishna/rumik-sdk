import { HttpClient } from "./http.js";
import { Audio } from "./audio.js";
import { SpeechStream } from "./stream.js";
import { SpeechSession } from "./session.js";
import type {
  CreateParams,
  StreamParams,
  SessionParams,
} from "./types.js";

export interface RumikOptions {
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
  defaultHeaders?: Record<string, string>;
}

const DEFAULT_BASE_URL = "https://silk-api.rumik.ai";

export function Speech(http: HttpClient) {
  async function create(params: CreateParams): Promise<Audio> {
    if (!params.text) {
      throw new TypeError("`text` must not be empty.");
    }

    const res = await http.request({
      path: "/v1/speech",
      method: "POST",
      responseType: "binary",
      timeout: params.timeout,
      extraHeaders: params.extraHeaders,
      body: {
        text: params.text,
        model: params.model ?? "muga",
        description: params.description,
        speaker: params.speaker,
        temperature: params.temperature,
        top_p: params.topP,
        top_k: params.topK,
        repetition_penalty: params.repetitionPenalty,
        max_new_tokens: params.maxNewTokens,
      },
    });

    return Audio(res.bytes ?? new Uint8Array(), {
      contentType: res.contentType,
      requestId: res.requestId,
    });
  }

  function stream(params: StreamParams) {
    return SpeechStream(http.apiKey, http.baseUrl, params);
  }

  function session(params: SessionParams = {}) {
    return SpeechSession(http.apiKey, http.baseUrl, params);
  }

  return {
    create,
    stream,
    session,
  };
}

export type Speech = ReturnType<typeof Speech>;

export function Rumik(options: RumikOptions = {}) {
  const apiKey = options.apiKey ?? process.env.RUMIK_API_KEY;

  if (!apiKey) {
    throw new TypeError(
      "No API key provided. Pass `apiKey` or set the RUMIK_API_KEY environment variable.",
    );
  }

  const baseUrl =
    options.baseUrl ??
    process.env.RUMIK_BASE_URL ??
    DEFAULT_BASE_URL;

  const http = HttpClient({
    apiKey,
    baseUrl,
    timeout: options.timeout ?? 60_000,
    maxRetries: options.maxRetries ?? 2,
    defaultHeaders: options.defaultHeaders ?? {},
  });

  const speech = Speech(http);

  async function close(): Promise<void> {}

  async function dispose(): Promise<void> {
    await close();
  }

  return {
    speech,
    close,
    [Symbol.asyncDispose ?? Symbol.for("asyncDispose")]: dispose,
  };
}

export type Rumik = ReturnType<typeof Rumik>;