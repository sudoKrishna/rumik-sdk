export type SpeechModel = "muga" | "mulberry";

export interface BaseSpeechParams {
  model?: SpeechModel;
  description?: string;
  speaker?: string;
  timeout?: number;
}

export interface CreateParams extends BaseSpeechParams {
  text: string;
  temperature?: number;
  topP?: number;
  topK?: number;
  repetitionPenalty?: number;
  maxNewTokens?: number;
  extraHeaders?: Record<string, string>;
}

export interface StreamParams extends BaseSpeechParams {
  text: string;
  idleTimeout?: number;
}

export interface SessionParams extends BaseSpeechParams {
  idleTimeout?: number;
}

export interface AudioChunk {
  type: "audio_chunk";
  data: Uint8Array;
}

export interface UtteranceDone {
  type: "utterance_done";
  requestId?: string;
  creditsUsed?: number;
}

export interface UtteranceCancelled {
  type: "utterance_cancelled";
  requestId?: string;
  reason: "interrupt" | "cancel";
}

export type SessionEvent =
  | AudioChunk
  | UtteranceDone
  | UtteranceCancelled;

export function isAudioChunk(event: SessionEvent): event is AudioChunk {
  return event.type === "audio_chunk";
}

export function isUtteranceDone(event: SessionEvent): event is UtteranceDone {
  return event.type === "utterance_done";
}

export function isUtteranceCancelled(
  event: SessionEvent,
): event is UtteranceCancelled {
  return event.type === "utterance_cancelled";
}