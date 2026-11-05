export { Rumik, type RumikOptions } from "./client.js";
export { Audio, pcmToWav } from "./audio.js";
export { SpeechStream } from "./stream.js";
export { SpeechSession } from "./session.js";

export type {
  SpeechModel,
  BaseSpeechParams,
  CreateParams,
  StreamParams,
  SessionParams,
  SessionEvent,
  AudioChunk,
  UtteranceDone,
  UtteranceCancelled,
} from "./types.js";
export { isAudioChunk, isUtteranceDone, isUtteranceCancelled } from "./types.js";

export {
  RumikError,
  APIConnectionError,
  APITimeoutError,
  APIStatusError,
  BadRequestError,
  AuthenticationError,
  PermissionDeniedError,
  NotFoundError,
  UnprocessableEntityError,
  RateLimitError,
  InternalServerError,
  ServiceUnavailableError,
  StreamError,
  type APIErrorBody,
} from "./error.js";
