class PCMPlayer extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = [];
    this.readIdx = 0;
    this.up = sampleRate / 16000; // usually 3
    this.current = new Float32Array(0);
    this.packets = 0;
    this.lastLog = currentTime;
    this.LOG_EVERY_SEC = 2;
    this.port.onmessage = (e) => {
      const buf = e.data; // Float32Array @16k expected
      // Upsample by nearest-neighbor to device rate
      const out = new Float32Array(buf.length * this.up);
      for (let i = 0; i < out.length; i++) out[i] = buf[Math.floor(i / this.up)] || 0;
      this.queue.push(out);
      this.packets++;
    };
  }
  process(_, outputs) {
    const outL = outputs[0][0];
    if (!outL) return true;
    let i = 0;
    while (i < outL.length) {
      if (this.current.length === 0) {
        this.current = this.queue.shift() || new Float32Array(outL.length);
        this.readIdx = 0;
      }
      const copy = Math.min(outL.length - i, this.current.length - this.readIdx);
      outL.set(this.current.subarray(this.readIdx, this.readIdx + copy), i);
      i += copy;
      this.readIdx += copy;
      if (this.readIdx >= this.current.length) this.current = new Float32Array(0);
    }
    if (currentTime - this.lastLog > this.LOG_EVERY_SEC) {
      this.port.postMessage({ type: 'player-stats', buffered: this.queue.length, packets: this.packets, timeSec: currentTime });
      this.lastLog = currentTime;
    }
    return true;
  }
}
registerProcessor('pcm-player', PCMPlayer);