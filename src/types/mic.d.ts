declare module "mic" {
  import { Readable } from "node:stream";

  export interface MicOptions {
    rate?: string | number;
    channels?: string | number;
    bitwidth?: string | number;
    endian?: "big" | "little";
    encoding?: "signed-integer" | "unsigned-integer" | "floating-point";
    device?: string;
    exitOnSilence?: number;
    debug?: boolean;
    fileType?: "wav" | "raw" | "au";
    fileName?: string; // not used for streaming, but library supports it
    // You can extend with other flags you use
  }

  export interface MicInstance {
    start(): void;
    stop(): void;
    pause(): void;
    resume(): void;
    getAudioStream(): Readable;
  }

  // mic is a CommonJS default export (function)
  function mic(options?: MicOptions): MicInstance;

  export = mic;
}