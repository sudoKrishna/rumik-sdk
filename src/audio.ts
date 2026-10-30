import { promises as fs } from "node:fs";

export function pcmToWav(
  pcm: Uint8Array,
  options: {
    sampleRate?: number;
    channels?: number;
    bitsPerSample?: number;
  } = {},
): Uint8Array {
  const sampleRate = options.sampleRate ?? 24000;
  const channels = options.channels ?? 1;
  const bitsPerSample = options.bitsPerSample ?? 16;

  const blockAlign = (channels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcm.byteLength;

  const header = new ArrayBuffer(44);
  const view = new DataView(header);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  const wav = new Uint8Array(44 + dataSize);
  wav.set(new Uint8Array(header), 0);
  wav.set(pcm, 44);

  return wav;
}

function writeString(
  view: DataView,
  offset: number,
  value: string,
): void {
  for (let i = 0; i < value.length; i++) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}

function isWav(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x41 &&
    bytes[10] === 0x56 &&
    bytes[11] === 0x45
  );
}

export interface AudioOptions {
  contentType?: string;
  requestId?: string;
}

export function Audio(
  data: Uint8Array,
  options: AudioOptions = {},
) {
  const contentType = options.contentType ?? "audio/wav";
  const requestId = options.requestId;

  return {
    contentType,
    requestId,

    get isWav(): boolean {
      return isWav(data);
    },

    get length(): number {
      return data.byteLength;
    },

    bytes(): Uint8Array {
      return data;
    },

    async save(path: string): Promise<void> {
      await fs.writeFile(path, data);
    },
  };
}

export type Audio = ReturnType<typeof Audio>;