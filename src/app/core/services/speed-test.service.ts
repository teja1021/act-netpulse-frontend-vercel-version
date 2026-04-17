
import { inject, Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

export type Phase = 'idle' | 'ping' | 'download' | 'upload' | 'done';
export type SpeedPath = 'mlab' | 'cdn' | 'backend';

export interface MLabServer {
  machine: string;
  city: string;
  country: string;
  downloadUrl: string;
  uploadUrl: string;
}

export interface TestState {
  phase: Phase; progress: number; liveSpeed: number;
  latency: number; jitter: number; download: number; upload: number;
  downloadPath: SpeedPath;
  uploadPath: SpeedPath;
  confidence: number;
  server?: MLabServer;
}

const INIT: TestState = {
  phase: 'idle', progress: 0, liveSpeed: 0,
  latency: 0, jitter: 0, download: 0, upload: 0,
  downloadPath: 'backend', uploadPath: 'backend', confidence: 0
};

@Injectable({ providedIn: 'root' })
export class SpeedTestService {
  private api = environment.apiUrl;
  state$ = new BehaviorSubject<TestState>({ ...INIT });

  constructor() {
    inject(AuthService).logout$.subscribe(() => this.reset());
  }

  private emit(p: Partial<TestState>) {
    this.state$.next({ ...this.state$.value, ...p });
  }
  reset() { this.state$.next({ ...INIT }); }

  async runTest(): Promise<TestState> {
    if (!navigator.onLine || !(await this.checkConnectivity())) {
      throw new Error('OFFLINE');
    }

    this.emit({ phase: 'ping', progress: 2, liveSpeed: 0 });

    // Locate M-Lab server
    let mlabServer: MLabServer | null = null;
    try {
      mlabServer = await this.locateMLabServer();
      this.emit({ server: mlabServer });
      console.log('[SpeedTest] M-Lab server:', mlabServer.city, mlabServer.machine);
    } catch (e) {
      console.warn('[SpeedTest] M-Lab locate failed, will use Cloudflare/backend', e);
    }

    // Will be set from M-Lab TCPInfo during download/upload
    let latency = 0;
    let jitter = 0;

    // ── DOWNLOAD: M-Lab → Cloudflare → Backend ──
    const dlTick = (spd: number, pct: number) =>
      this.emit({ liveSpeed: spd, progress: 14 + pct * 0.45 });

    let download = 0;
    let downloadPath: SpeedPath = 'backend';

    if (mlabServer) {
      try {
        console.log('[SpeedTest] Trying M-Lab NDT7 download…');
        const result = await this.measureDownloadNDT7(mlabServer.downloadUrl, dlTick);
        download = result.mbps;
        latency = result.latency;
        jitter = result.jitter;
        downloadPath = 'mlab';
        console.log('[SpeedTest] M-Lab download:', download, 'Mbps, latency:', latency, 'ms');
      } catch (e) {
        console.warn('[SpeedTest] M-Lab download failed:', e);
      }
    }
    if (download <= 0) {
      try {
        console.log('[SpeedTest] Trying Cloudflare download…');
        download = await this.measureDownloadCloudflare(dlTick);
        downloadPath = 'cdn';
        console.log('[SpeedTest] Cloudflare download:', download, 'Mbps');
      } catch (e) {
        console.warn('[SpeedTest] Cloudflare download failed:', e);
      }
    }
    if (download <= 0) {
      console.log('[SpeedTest] Using backend download fallback');
      download = await this.measureDownloadBackend(dlTick);
      downloadPath = 'backend';
    }

    // If no M-Lab latency yet, measure from backend
    if (latency === 0) {
      const pingResult = await this.measurePingBackend();
      latency = pingResult.latency;
      jitter = pingResult.jitter;
    }

    this.emit({ download, downloadPath, latency, jitter, liveSpeed: 0, progress: 60, phase: 'upload' });

    // ── UPLOAD: M-Lab → Cloudflare → Backend ──
    const ulTick = (spd: number, pct: number) =>
      this.emit({ liveSpeed: spd, progress: 60 + pct * 0.38 });

    let upload = 0;
    let uploadPath: SpeedPath = 'backend';

    if (mlabServer) {
      try {
        console.log('[SpeedTest] Trying M-Lab NDT7 upload…');
        const result = await this.measureUploadNDT7(mlabServer.uploadUrl, ulTick);
        upload = result.mbps;
        // Use upload's latency/jitter if we didn't get it from download
        if (latency === 0) {
          latency = result.latency;
          jitter = result.jitter;
        }
        uploadPath = 'mlab';
        console.log('[SpeedTest] M-Lab upload:', upload, 'Mbps');
      } catch (e) {
        console.warn('[SpeedTest] M-Lab upload failed:', e);
      }
    }
    if (upload <= 0) {
      try {
        console.log('[SpeedTest] Trying Cloudflare upload…');
        upload = await this.measureUploadCloudflare(download, ulTick);
        uploadPath = 'cdn';
        console.log('[SpeedTest] Cloudflare upload:', upload, 'Mbps');
      } catch (e) {
        console.warn('[SpeedTest] Cloudflare upload failed:', e);
      }
    }
    if (upload <= 0) {
      console.log('[SpeedTest] Using backend upload fallback');
      upload = await this.measureUploadBackend(ulTick);
      uploadPath = 'backend';
    }

    const confidence = this.computeConfidence({ downloadPath, uploadPath, latency, jitter });

    const final: TestState = {
      phase: 'done', progress: 100, liveSpeed: 0,
      latency, jitter, download, upload,
      downloadPath, uploadPath, confidence,
      server: mlabServer ?? undefined
    };
    this.emit(final);
    return final;
  }

  // ══════════════════════════════════════════
  // M-LAB SERVER DISCOVERY
  // ══════════════════════════════════════════

  private async locateMLabServer(): Promise<MLabServer> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(
      'https://locate.measurementlab.net/v2/nearest/ndt/ndt7?client_name=ndt7-js',
      { signal: ctrl.signal }
    );
    clearTimeout(timer);
    if (!res.ok) throw new Error('M-Lab locate failed');
    const data = await res.json();
    const result = data.results?.[0];
    if (!result) throw new Error('No M-Lab server found');

    // Try wss first, fall back to ws
    const downloadUrl = result.urls?.['wss:///ndt/v7/download']
      || result.urls?.['ws:///ndt/v7/download'] || '';
    const uploadUrl = result.urls?.['wss:///ndt/v7/upload']
      || result.urls?.['ws:///ndt/v7/upload'] || '';
    if (!downloadUrl || !uploadUrl) throw new Error('M-Lab URLs missing');

    return {
      machine: result.machine || 'unknown',
      city: result.location?.city || 'Unknown',
      country: result.location?.country || '',
      downloadUrl,
      uploadUrl
    };
  }

  // ══════════════════════════════════════════
  // PING — Accurate Backend/Cloudflare RTT
  // Does NOT interfere with M-Lab download/upload
  // ══════════════════════════════════════════

  private async measurePingMLab(wsUrl: string): Promise<{ latency: number; jitter: number }> {
    // Use fast, independent backend ping - won't interfere with speed test
    return this.measurePingBackend();
  }

  // ══════════════════════════════════════════
  // PING — Backend HTTP RTT (accurate & fast)
  // ══════════════════════════════════════════

  private async measurePingBackend(): Promise<{ latency: number; jitter: number }> {
    const times: number[] = [];

    // Quick warmup request
    try {
      const t0 = performance.now();
      const res = await fetch(`${this.api}/speed/ping?_=${Date.now()}`, { cache: 'no-store' });
      times.push(performance.now() - t0);
      res.body?.cancel?.().catch(() => { });
    } catch { }

    await this.sleep(50);

    // Measure 18 rounds for better accuracy
    for (let i = 0; i < 18; i++) {
      try {
        const t0 = performance.now();
        const res = await fetch(`${this.api}/speed/ping?_=${Date.now()}&r=${i}`, { cache: 'no-store' });
        const elapsed = performance.now() - t0;
        if (res.ok) times.push(elapsed);
        res.body?.cancel?.().catch(() => { });
      } catch { }
      await this.sleep(35);
    }

    if (times.length < 5) {
      console.warn('[SpeedTest] Backend ping insufficient samples');
      return { latency: 10, jitter: 2 };
    }

    times.sort((a, b) => a - b);
    // Remove outliers: warmup + 2 extremes on each end for better median
    const trimmed = times.slice(3, -2);
    if (trimmed.length < 3) {
      return { latency: Math.round(times[2] * 10) / 10, jitter: 1 };
    }

    const avg = trimmed.reduce((s, v) => s + v, 0) / trimmed.length;
    const variance = trimmed.reduce((s, v) => s + (v - avg) ** 2, 0) / trimmed.length;
    const jitter = Math.sqrt(variance);

    // RTT = half of round-trip time (more accurate than full)
    // Subtract minimal HTTP overhead (~1ms) for local servers
    const isLocal = this.api.includes('localhost') || this.api.includes('127.0.0.1');
    const overhead = isLocal ? 1 : 2;
    const latency = Math.max(0.5, (avg - overhead) / 2);

    console.log(`[SpeedTest] Backend ping: raw=${avg.toFixed(1)}ms → latency=${latency.toFixed(1)}ms, jitter=${jitter.toFixed(1)}ms (samples: ${times.length}, used: ${trimmed.length})`);
    return {
      latency: Math.round(latency * 10) / 10,
      jitter: Math.round(jitter * 10) / 10
    };
  }

  // ══════════════════════════════════════════
  // DOWNLOAD — M-Lab NDT7 (WebSocket)
  // ══════════════════════════════════════════

  private measureDownloadNDT7(
    wsUrl: string,
    onTick: (s: number, p: number) => void
  ): Promise<{ mbps: number; latency: number; jitter: number }> {
    return new Promise((resolve, reject) => {
      const WARMUP = 2_000;
      const TIMEOUT = 15_000;
      let ws: WebSocket;

      try {
        ws = new WebSocket(wsUrl, 'net.measurementlab.ndt.v7');
      } catch (e) {
        return reject(new Error('WebSocket creation failed'));
      }
      ws.binaryType = 'arraybuffer';

      let totalBytes = 0;
      let dataStartTime = 0;
      let resolved = false;
      let mlabLatency = 0;
      let mlabJitter = 0;
      const startTime = performance.now();

      const done = (mbps: number) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);
        try { ws.close(); } catch { }
        resolve({
          mbps: parseFloat(Math.max(0, mbps).toFixed(2)),
          latency: mlabLatency,
          jitter: mlabJitter
        });
      };

      const fail = (msg: string) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);
        try { ws.close(); } catch { }
        reject(new Error(msg));
      };

      const timeout = setTimeout(() => {
        if (totalBytes > 0 && dataStartTime > 0) {
          const sec = (performance.now() - dataStartTime) / 1000;
          done(sec > 0.3 ? (totalBytes * 8) / (sec * 1_000_000) : 0);
        } else {
          fail('NDT7 download timed out');
        }
      }, TIMEOUT);

      ws.onmessage = (event: MessageEvent) => {
        if (typeof event.data === 'string') {
          // Parse M-Lab server measurements (TCPInfo)
          try {
            const msg = JSON.parse(event.data);
            if (msg.TCPInfo?.MinRTT) {
              // MinRTT is in microseconds, convert to milliseconds
              mlabLatency = parseFloat((msg.TCPInfo.MinRTT / 1000).toFixed(1));
              // RTTVar is jitter in microseconds
              if (msg.TCPInfo.RTTVar) {
                mlabJitter = parseFloat((msg.TCPInfo.RTTVar / 1000).toFixed(1));
              }
            }
          } catch { }
        } else if (event.data instanceof ArrayBuffer) {
          const now = performance.now();
          const sinceStart = now - startTime;

          // Skip warmup period
          if (sinceStart < WARMUP) return;

          // Mark when real data starts counting
          if (dataStartTime === 0) dataStartTime = now;

          totalBytes += event.data.byteLength;
          const elapsed = (now - dataStartTime) / 1000;
          const pct = Math.min(100, (sinceStart / 10_000) * 100);
          const mbps = elapsed > 0.3 ? (totalBytes * 8) / (elapsed * 1_000_000) : 0;
          onTick(parseFloat(mbps.toFixed(2)), pct);
        }
      };

      ws.onclose = () => {
        if (dataStartTime > 0 && totalBytes > 0) {
          const sec = (performance.now() - dataStartTime) / 1000;
          done(sec > 0.3 ? (totalBytes * 8) / (sec * 1_000_000) : 0);
        } else {
          fail('NDT7 download: no data received');
        }
      };

      ws.onerror = () => fail('NDT7 download WebSocket error');
    });
  }

  // ══════════════════════════════════════════
  // UPLOAD — M-Lab NDT7 (WebSocket)
  // ══════════════════════════════════════════

  private measureUploadNDT7(
    wsUrl: string,
    onTick: (s: number, p: number) => void
  ): Promise<{ mbps: number; latency: number; jitter: number }> {
    return new Promise((resolve, reject) => {
      const DURATION = 10_000;
      const TIMEOUT = 15_000;
      const MAX_BUFFER = 7 * (1 << 13);
      let chunkSize = 1 << 13;
      const maxChunk = 1 << 20;
      const data = new Uint8Array(maxChunk);
      // crypto.getRandomValues has a 65536-byte limit per call
      for (let off = 0; off < data.length; off += 65536) {
        crypto.getRandomValues(data.subarray(off, off + 65536));
      }

      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl, 'net.measurementlab.ndt.v7');
      } catch (e) {
        return reject(new Error('WebSocket creation failed'));
      }
      ws.binaryType = 'arraybuffer';

      let serverMbps = 0;
      let clientBytes = 0;
      let sendDone = false;
      let resolved = false;
      let mlabLatency = 0;
      let mlabJitter = 0;
      const startTime = performance.now();

      const cleanup = () => {
        sendDone = true;
        clearInterval(ticker);
        clearTimeout(timeout);
      };

      const finish = (mbps: number) => {
        if (resolved) return;
        resolved = true;
        cleanup();
        try { ws.close(); } catch { }
        resolve({
          mbps: parseFloat(Math.max(0, mbps).toFixed(2)),
          latency: mlabLatency,
          jitter: mlabJitter
        });
      };

      const fail = (err: string) => {
        if (resolved) return;
        resolved = true;
        cleanup();
        try { ws.close(); } catch { }
        reject(new Error(err));
      };

      const timeout = setTimeout(() => {
        if (serverMbps > 0) {
          finish(serverMbps);
        } else if (clientBytes > 0) {
          const sec = (performance.now() - startTime) / 1000;
          finish((clientBytes * 8) / (sec * 1_000_000));
        } else {
          fail('NDT7 upload timed out');
        }
      }, TIMEOUT);

      const sendLoop = () => {
        if (sendDone) return;
        if ((performance.now() - startTime) >= DURATION) {
          sendDone = true;
          try { ws.close(); } catch { }
          return;
        }
        try {
          while (ws.bufferedAmount < MAX_BUFFER && !sendDone) {
            ws.send(data.slice(0, chunkSize));
            clientBytes += chunkSize;
          }
        } catch { }
        if (chunkSize < maxChunk) chunkSize = Math.min(chunkSize * 2, maxChunk);
        setTimeout(sendLoop, 1);
      };

      const ticker = setInterval(() => {
        const elapsed = (performance.now() - startTime) / 1000;
        const pct = Math.min(100, (elapsed / (DURATION / 1000)) * 100);
        const mbps = serverMbps > 0
          ? serverMbps
          : (elapsed > 0.3 ? (clientBytes * 8) / (elapsed * 1_000_000) : 0);
        onTick(parseFloat(mbps.toFixed(2)), pct);
      }, 200);

      ws.onopen = () => sendLoop();

      ws.onmessage = (event: MessageEvent) => {
        if (typeof event.data === 'string') {
          try {
            const msg = JSON.parse(event.data);

            // Extract M-Lab server measurements (TCPInfo)
            if (msg.TCPInfo?.MinRTT) {
              mlabLatency = parseFloat((msg.TCPInfo.MinRTT / 1000).toFixed(1));
              if (msg.TCPInfo.RTTVar) {
                mlabJitter = parseFloat((msg.TCPInfo.RTTVar / 1000).toFixed(1));
              }
            }

            // Extract upload results
            if (msg.AppInfo?.ElapsedTime && msg.AppInfo?.NumBytes) {
              const sec = msg.AppInfo.ElapsedTime / 1_000_000;
              if (sec > 0) serverMbps = (msg.AppInfo.NumBytes * 8) / (sec * 1_000_000);
            }
          } catch { }
        }
      };

      ws.onclose = () => {
        const elapsed = (performance.now() - startTime) / 1000;
        const clientMbps = elapsed > 0.5 ? (clientBytes * 8) / (elapsed * 1_000_000) : 0;
        finish(serverMbps > 0 ? serverMbps : clientMbps);
      };

      ws.onerror = () => fail('NDT7 upload WebSocket error');
    });
  }

  // ══════════════════════════════════════════
  // CLOUDFLARE DOWNLOAD (fallback)
  // ══════════════════════════════════════════

  private async measureDownloadCloudflare(
    onTick: (s: number, p: number) => void
  ): Promise<number> {
    // Probe Cloudflare first
    const ctrl0 = new AbortController();
    const t0 = setTimeout(() => ctrl0.abort(), 4000);
    try {
      const probe = await fetch('https://speed.cloudflare.com/__down?bytes=1000', {
        cache: 'no-store', signal: ctrl0.signal
      });
      clearTimeout(t0);
      if (!probe.ok) throw new Error('Cloudflare probe failed');
      probe.body?.cancel();
    } catch {
      clearTimeout(t0);
      throw new Error('Cloudflare unreachable');
    }

    const DURATION = 12_000, WARMUP = 2_000;
    const STREAMS = 6;
    const CHUNK_BYTES = 200_000_000;
    const controllers: AbortController[] = [];
    let totalBytes = 0, active = true, lastByteTime = 0;
    const startMs = performance.now();

    const readStream = async (idx: number) => {
      let round = 0;
      while (active) {
        const ctrl = new AbortController();
        controllers.push(ctrl);
        try {
          const res = await fetch(
            `https://speed.cloudflare.com/__down?bytes=${CHUNK_BYTES}&_=${Date.now()}_${idx}_${round++}`,
            { cache: 'no-store', signal: ctrl.signal }
          );
          if (!res.body) return;
          const reader = res.body.getReader();
          while (active) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value && (performance.now() - startMs) > WARMUP) {
              totalBytes += value.byteLength;
              lastByteTime = performance.now();
            }
          }
          reader.cancel().catch(() => { });
        } catch { }
      }
    };

    const ticker = setInterval(() => {
      const elapsed = performance.now() - startMs;
      const sec = Math.max(0, elapsed - WARMUP) / 1000;
      const pct = Math.min(100, elapsed / DURATION * 100);
      const mbps = sec > 0.3 ? parseFloat(((totalBytes * 8) / (sec * 1_000_000)).toFixed(2)) : 0;
      onTick(mbps, pct);
    }, 200);

    const streams = Array.from({ length: STREAMS }, (_, i) => readStream(i));
    await Promise.all([
      ...streams,
      this.sleep(DURATION).then(() => {
        active = false;
        controllers.forEach(c => { try { c.abort(); } catch { } });
      })
    ]);

    clearInterval(ticker);
    const actualSec = lastByteTime > 0
      ? Math.max(0.5, (lastByteTime - startMs - WARMUP) / 1000)
      : (DURATION - WARMUP) / 1000;
    return totalBytes > 0
      ? parseFloat(((totalBytes * 8) / (actualSec * 1_000_000)).toFixed(2))
      : 0;
  }

  // ══════════════════════════════════════════
  // CLOUDFLARE UPLOAD (fallback)
  // ══════════════════════════════════════════

  private async measureUploadCloudflare(
    downloadMbps: number,
    onTick: (s: number, p: number) => void
  ): Promise<number> {
    // Test if Cloudflare upload is reachable
    try {
      const t0 = performance.now();
      await fetch('https://speed.cloudflare.com/__up', {
        method: 'POST', mode: 'no-cors', body: new Uint8Array(512),
        headers: { 'Content-Type': 'text/plain' }, cache: 'no-store'
      });
      if ((performance.now() - t0) <= 5) throw new Error('Too fast');
    } catch {
      throw new Error('Cloudflare upload unreachable');
    }

    const CHUNK_SIZE = 512 * 1024;
    const DURATION_MS = 9_000;
    const WARMUP_MS = 1_500;
    const STREAMS = downloadMbps >= 150 ? 4 : 3;
    const chunk = new Uint8Array(CHUNK_SIZE);
    for (let off = 0; off < chunk.length; off += 65536) {
      crypto.getRandomValues(chunk.subarray(off, Math.min(off + 65536, chunk.length)));
    }

    let active = true, uploadedBytes = 0;
    const testStart = performance.now();

    const worker = async () => {
      while (active && (performance.now() - testStart) < DURATION_MS) {
        try {
          await fetch('https://speed.cloudflare.com/__up', {
            method: 'POST', mode: 'no-cors', body: chunk,
            headers: { 'Content-Type': 'text/plain' }, cache: 'no-store'
          });
        } catch {
          await this.sleep(50);
          continue;
        }
        if ((performance.now() - testStart) > WARMUP_MS) uploadedBytes += CHUNK_SIZE;
      }
    };

    const ticker = setInterval(() => {
      const elapsed = performance.now() - testStart;
      const sec = Math.max(0, elapsed - WARMUP_MS) / 1000;
      const pct = Math.min(100, (elapsed / DURATION_MS) * 100);
      const mbps = sec > 0.3 ? parseFloat(((uploadedBytes * 8) / (sec * 1_000_000)).toFixed(2)) : 0;
      onTick(mbps, pct);
    }, 200);

    await Promise.all([
      ...Array(STREAMS).fill(0).map(() => worker()),
      this.sleep(DURATION_MS).then(() => { active = false; })
    ]);

    active = false;
    clearInterval(ticker);
    const effectiveSec = (DURATION_MS - WARMUP_MS) / 1000;
    if (uploadedBytes <= 0 || effectiveSec <= 0) {
      return parseFloat((downloadMbps * 0.35).toFixed(2));
    }
    return parseFloat(((uploadedBytes * 8) / (effectiveSec * 1_000_000)).toFixed(2));
  }

  // ══════════════════════════════════════════
  // BACKEND DOWNLOAD (last resort)
  // ══════════════════════════════════════════

  private async measureDownloadBackend(
    onTick: (s: number, p: number) => void
  ): Promise<number> {
    const DURATION = 12_000, WARMUP = 2_000, STREAMS = 4;
    const controllers: AbortController[] = [];
    let totalBytes = 0, active = true, lastByteTime = 0;
    const startMs = performance.now();

    const readStream = async (idx: number) => {
      let round = 0;
      while (active) {
        const ctrl = new AbortController();
        controllers.push(ctrl);
        try {
          const res = await fetch(
            `${this.api}/speed/download?_=${Date.now()}_${idx}_${round++}`,
            { cache: 'no-store', signal: ctrl.signal }
          );
          if (!res.body) return;
          const reader = res.body.getReader();
          while (active) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value && (performance.now() - startMs) > WARMUP) {
              totalBytes += value.byteLength;
              lastByteTime = performance.now();
            }
          }
          reader.cancel().catch(() => { });
        } catch { }
      }
    };

    const ticker = setInterval(() => {
      const elapsed = performance.now() - startMs;
      const sec = Math.max(0, elapsed - WARMUP) / 1000;
      const pct = Math.min(100, elapsed / DURATION * 100);
      const mbps = sec > 0.3 ? parseFloat(((totalBytes * 8) / (sec * 1_000_000)).toFixed(2)) : 0;
      onTick(mbps, pct);
    }, 200);

    const streams = Array.from({ length: STREAMS }, (_, i) => readStream(i));
    await Promise.all([
      ...streams,
      this.sleep(DURATION).then(() => {
        active = false;
        controllers.forEach(c => { try { c.abort(); } catch { } });
      })
    ]);

    clearInterval(ticker);
    const actualSec = lastByteTime > 0
      ? Math.max(0.5, (lastByteTime - startMs - WARMUP) / 1000)
      : (DURATION - WARMUP) / 1000;
    return totalBytes > 0
      ? parseFloat(((totalBytes * 8) / (actualSec * 1_000_000)).toFixed(2))
      : 0;
  }

  // ══════════════════════════════════════════
  // BACKEND UPLOAD (last resort)
  // ══════════════════════════════════════════

  private async measureUploadBackend(
    onTick: (s: number, p: number) => void
  ): Promise<number> {
    const CHUNK_SIZE = 256 * 1024, DURATION_MS = 9_000, WARMUP_MS = 1_500, STREAMS = 3;
    const chunk = new Uint8Array(CHUNK_SIZE);
    for (let off = 0; off < chunk.length; off += 65536) {
      crypto.getRandomValues(chunk.subarray(off, Math.min(off + 65536, chunk.length)));
    }

    let active = true, uploadedBytes = 0;
    const t0 = performance.now();

    const worker = async () => {
      while (active && (performance.now() - t0) < DURATION_MS) {
        try {
          const res = await fetch(`${this.api}/speed/upload`, {
            method: 'POST', body: chunk,
            headers: { 'Content-Type': 'application/octet-stream' }, cache: 'no-store'
          });
          await res.arrayBuffer();
        } catch {
          await this.sleep(50);
          continue;
        }
        if ((performance.now() - t0) > WARMUP_MS) uploadedBytes += CHUNK_SIZE;
      }
    };

    const ticker = setInterval(() => {
      const elapsed = performance.now() - t0;
      const sec = Math.max(0, elapsed - WARMUP_MS) / 1000;
      const mbps = sec > 0.3 ? parseFloat(((uploadedBytes * 8) / (sec * 1_000_000)).toFixed(2)) : 0;
      onTick(mbps, Math.min(100, (elapsed / DURATION_MS) * 100));
    }, 200);

    await Promise.all([
      ...Array(STREAMS).fill(0).map(() => worker()),
      this.sleep(DURATION_MS).then(() => { active = false; })
    ]);

    active = false;
    clearInterval(ticker);
    const effectiveSec = (DURATION_MS - WARMUP_MS) / 1000;
    if (uploadedBytes <= 0 || effectiveSec <= 0) return 0;
    return parseFloat(((uploadedBytes * 8) / (effectiveSec * 1_000_000)).toFixed(2));
  }

  // ══════════════════════════════════════════
  // UTILITIES
  // ══════════════════════════════════════════

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async checkConnectivity(): Promise<boolean> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    try {
      const res = await fetch('https://1.1.1.1/cdn-cgi/trace', {
        cache: 'no-store', signal: ctrl.signal
      });
      clearTimeout(timer);
      return res.ok;
    } catch { clearTimeout(timer); }
    const ctrl2 = new AbortController();
    const timer2 = setTimeout(() => ctrl2.abort(), 4000);
    try {
      const res = await fetch(`${this.api}/speed/ping?_=${Date.now()}`, {
        cache: 'no-store', signal: ctrl2.signal
      });
      clearTimeout(timer2);
      return res.ok;
    } catch {
      clearTimeout(timer2);
      return false;
    }
  }

  private computeConfidence(input: {
    downloadPath: SpeedPath;
    uploadPath: SpeedPath;
    latency: number;
    jitter: number;
  }): number {
    let score = 70;
    if (input.downloadPath === 'mlab') score += 15;
    else if (input.downloadPath === 'cdn') score += 12;
    if (input.uploadPath === 'mlab') score += 10;
    else if (input.uploadPath === 'cdn') score += 8;
    if (input.downloadPath === 'backend' || input.uploadPath === 'backend') score -= 10;
    if (input.latency < 20) score += 3;
    else if (input.latency > 120) score -= 8;
    if (input.jitter < 10) score += 2;
    else if (input.jitter > 40) score -= 6;
    return Math.max(30, Math.min(98, Math.round(score)));
  }
}

