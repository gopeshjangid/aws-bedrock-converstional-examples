class PCM16Worklet extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = [];
    this.ratio = sampleRate / 16000; // usually 48000/16000 = 3
    this.acc = 0;
    this.frames = 0;
    this.samplesOut = 0;
    this.lastLog = currentTime; // audio clock seconds
    this.LOG_EVERY_SEC = 2;     // worklet-side heartbeat
  }
  process(inputs) {
    const input = inputs[0][0];
    if (!input) return true;
    // Downsample to 16k using simple accumulator
    for (let i = 0; i < input.length; i++) {
      this.acc += 1;
      if (this.acc >= this.ratio) {
        const s = Math.max(-1, Math.min(1, input[i]));
        const i16 = Math.round(s * 32767);
        this.buffer.push(i16);
        this.acc -= this.ratio;
        this.samplesOut++;
      }
    }
    // Emit ~32ms frames (512 samples @16k)
    const samplesPerFrame = 16000 * 0.032;
    while (this.buffer.length >= samplesPerFrame) {
      const frame = this.buffer.splice(0, samplesPerFrame);
      const arr = new Int16Array(frame);
      // Send as transferable inside an envelope so main thread can distinguish
      this.port.postMessage({ type: 'frame', buffer: arr.buffer }, [arr.buffer]);
      this.frames++;
    }
    // Heartbeat
    if (currentTime - this.lastLog > this.LOG_EVERY_SEC) {
      this.port.postMessage({
        type: 'stats',
        frames: this.frames,
        samplesOut: this.samplesOut,
        timeSec: currentTime,
      });
      this.lastLog = currentTime;
    }
    return true;
  }
}
registerProcessor('pcm16-worklet', PCM16Worklet);