import {
  Component, OnDestroy, AfterViewInit,
  ViewChild, ElementRef, signal, computed, inject
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../../core/services/auth.service';
import { SpeedTestService } from '../../core/services/speed-test.service';
import { LogService } from '../../core/services/log.service';

@Component({
  selector: 'app-speed-test',
  standalone: true,
  imports: [],
  template: `
@if (offline()) {
<!-- Full-page offline screen -->
<div class="offline-page">
  <div class="op-card">
    <div class="op-icon">
      <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <line x1="1" y1="1" x2="23" y2="23"/>
        <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
        <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
        <path d="M10.71 5.05A16 16 0 0 1 22.56 9"/>
        <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
        <line x1="12" y1="20" x2="12.01" y2="20"/>
      </svg>
    </div>
    <h2 class="op-title">No Internet Connection</h2>
    <p class="op-desc">It looks like you're offline. Please check your Wi-Fi or network cable and make sure you have an active internet connection.</p>
    <div class="op-tips">
      <div class="op-tip">💡 Check if your Wi-Fi is turned on</div>
      <div class="op-tip">🔌 Verify your router/modem is working</div>
      <div class="op-tip">📡 Try moving closer to your router</div>
    </div>
    <button class="op-retry" (click)="retryConnection()">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
      Try Again
    </button>
  </div>
</div>
} @else {
<!-- Hero -->
<div class="hero-banner">
  <h1>Internet <span>Speed Test</span></h1>
  <p>Real-time download, upload &amp; latency measurement against your subscribed plan</p>
</div>

<div class="st-layout">

  <!-- LEFT CARD: Meter + metrics + steps -->
  <div class="card st-left">

    <div class="meter-title">DOWNLOAD SPEED</div>

    <!-- Canvas Speedometer -->
    <div class="canvas-wrap">
      <canvas #meterCvs width="320" height="195"></canvas>
      <div class="speed-center">
        <div class="speed-big">{{ smooth().toFixed(0) }}</div>
        <div class="speed-unit">Mbps</div>
      </div>
    </div>

    <!-- 3 Metric boxes -->
    <div class="metric-row">
      <div class="metric-box">
        <div class="mb-label">DOWNLOAD</div>
        <div class="mb-line dl-line"></div>
        <div class="mb-val dl-val">{{ st().download > 0 ? st().download : '' }}</div>
        <div class="mb-unit">Mbps</div>
      </div>
      <div class="metric-box">
        <div class="mb-label">UPLOAD</div>
        <div class="mb-line ul-line"></div>
        <div class="mb-val ul-val">{{ st().upload > 0 ? st().upload : '' }}</div>
        <div class="mb-unit">Mbps</div>
      </div>
      <div class="metric-box">
        <div class="mb-label">LATENCY</div>
        <div class="mb-line lat-line"></div>
        <div class="mb-val lat-val">{{ st().latency > 0 ? st().latency : '' }}</div>
        <div class="mb-unit">ms</div>
      </div>
    </div>

    <!-- Progress bar while testing -->
    @if (st().phase !== 'idle' && st().phase !== 'done') {
      <div class="prog-wrap">
        <div class="prog-bar"><div class="prog-fill" [style.width.%]="st().progress"></div></div>
      </div>
    }

    <!-- START button -->
    <button class="start-btn" (click)="startTest()" [disabled]="testing()">
      @if (testing()) {
        <div class="spin-white"></div> TESTING…
      } @else {
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        {{ st().phase === 'done' ? 'RUN AGAIN' : 'START SPEED TEST' }}
      }
    </button>

    <!-- Steps list (shown while testing or idle) -->
    @if (st().phase !== 'done') {
      <div class="steps-list">
        @for (step of steps; track step.n) {
          <div class="step-item" [class.step-active]="step.phase === st().phase" [class.step-done]="isStepDone(step.phase)">
            <div class="step-num">{{ isStepDone(step.phase) ? '✓' : step.n }}</div>
            <span>{{ step.label }}</span>
          </div>
        }
      </div>
    }

    <!-- Jitter info after test -->
    @if (st().phase === 'done' && st().jitter > 0) {
      <div class="jitter-row">
        <span class="jitter-label">Jitter</span>
        <span class="jitter-val">{{ st().jitter }} ms</span>
        <span class="jitter-sep">·</span>
        <span class="jitter-label">Server</span>
        <span class="jitter-val">{{ st().server ? st().server!.city + ', ' + st().server!.country + ' (M-Lab)' : 'Localhost' }}</span>
      </div>
    }

    <!-- ═══════════════════════════════════════════════
         SPEED SUMMARY CARD (only after test completes)
         ═══════════════════════════════════════════════ -->
    @if (st().phase === 'done' && st().download > 0) {
      <div class="card speed-summary-card">

        <div class="ssc-head">
          <span class="ssc-icon">⚡</span>
          <h3>Speed Summary</h3>
        </div>

        <div class="info-title">
          <span class="info-icon">🌐</span>
          <span>How is my internet connection?</span>
        </div>

        <div class="speed-result-box" [class]="speedSummaryClass()">
          <div class="srb-content">
            <div class="srb-title">{{ speedGrade().title }}</div>
          </div>
          <div class="srb-mbps">{{ st().download }}<span>Mbps</span></div>
        </div>

        <div class="what-title">
          <span class="what-icon">?</span>
          What can I do with this connection?
        </div>
        <div class="what-box">
          <div class="speed-detail-text" [innerHTML]="speedGrade().desc"></div>
        </div>

      </div>
    }

  </div>

  <!-- RIGHT COLUMN -->
  <div class="st-right">

    <!-- Plan Comparison Card -->
    <div class="card plan-card">
      <div class="pc-head">
        <span class="pc-ic">📋</span>
        <h3>Plan Comparison</h3>
      </div>

      <!-- Plan box with red border -->
      <div class="plan-box">
        <div class="pb-label">YOUR PLAN — {{ user()?.plan?.name?.toUpperCase() }}</div>
        <div class="pb-speed">
          <strong>{{ user()?.plan?.download }}</strong>
          <span class="pb-mbps">Mbps</span>
        </div>
        <!-- Download bar -->
        <div class="plan-bar-row">
          <span class="pbr-label">Download</span>
          <div class="pbr-track"><div class="pbr-fill dl-fill" [style.width.%]="dlPct()"></div></div>
          <span class="pbr-pct">{{ st().download > 0 ? dlPct() + '%' : '—%' }}</span>
        </div>
        <!-- Upload bar -->
        <div class="plan-bar-row">
          <span class="pbr-label">Upload</span>
          <div class="pbr-track"><div class="pbr-fill ul-fill" [style.width.%]="ulPct()"></div></div>
          <span class="pbr-pct">{{ st().upload > 0 ? ulPct() + '%' : '—%' }}</span>
        </div>
      </div>

      <!-- Circular indicators -->
      <div class="circle-row">
        <div class="circ-item">
          <div class="circ-svg-wrap">
            <svg viewBox="0 0 80 80" width="90" height="90">
              <circle cx="40" cy="40" r="32" fill="none" stroke="#e5e7eb" stroke-width="6"/>
              <circle cx="40" cy="40" r="32" fill="none"
                stroke="#16a34a" stroke-width="6" stroke-linecap="round"
                stroke-dasharray="201.06"
                [attr.stroke-dashoffset]="201.06 - 201.06 * dlPct() / 100"
                transform="rotate(-90 40 40)"/>
            </svg>
            <div class="circ-pct">{{ dlPct() }}%</div>
          </div>
          <div class="circ-lbl">Download</div>
        </div>
        <div class="circ-item">
          <div class="circ-svg-wrap">
            <svg viewBox="0 0 80 80" width="90" height="90">
              <circle cx="40" cy="40" r="32" fill="none" stroke="#e5e7eb" stroke-width="6"/>
              <circle cx="40" cy="40" r="32" fill="none"
                stroke="#1e40af" stroke-width="6" stroke-linecap="round"
                stroke-dasharray="201.06"
                [attr.stroke-dashoffset]="201.06 - 201.06 * ulPct() / 100"
                transform="rotate(-90 40 40)"/>
            </svg>
            <div class="circ-pct">{{ ulPct() }}%</div>
          </div>
          <div class="circ-lbl">Upload</div>
        </div>
      </div>
    </div>

    <div>

  </div>
    <!-- Performance Rating Card -->
    <div class="card perf-card">
      <div class="pc-head">
        <span class="pc-ic">🏅</span>
        <h3>Performance Rating</h3>
      </div>

      @if (st().phase === 'done') {
        <!-- After test: show result -->
        <div class="perf-result" [class]="'pr-' + cat().toLowerCase()">
          <div class="pr-emoji">{{ catEmoji() }}</div>
          <div>
            <div class="pr-grade">{{ cat() }}</div>
            <div class="pr-desc">{{ perfDesc() }}</div>
          </div>
          <div class="pr-pct">{{ dlPct() }}%</div>
        </div>
        <div class="perf-stats">
          <div class="ps-row"><span>↓ Download</span><strong class="dl-val">{{ st().download }} Mbps</strong></div>
          <div class="ps-row"><span>↑ Upload</span>  <strong class="ul-val">{{ st().upload }} Mbps</strong></div>
          <div class="ps-row"><span>⚡ Latency</span><strong class="lat-val">{{ st().latency }} ms</strong></div>
          <div class="ps-row"><span>📊 Plan %</span> <strong>{{ dlPct() }}%</strong></div>
        </div>
        @if (autoSaved()) {
          <div class="saved-notice">✓ Result saved to history automatically</div>
        }
      } @else {
        <!-- Before test: awaiting state -->
        <div class="perf-awaiting">
          <div class="pa-icon">⏳</div>
          <div class="pa-title">Awaiting Test</div>
          <div class="pa-desc">Run a test to see your network health score</div>
        </div>
        <div class="grade-legend">
          <div class="gl-row"><span class="gl-dot best"></span><span><strong>Best</strong> — ≥ 90% of plan speed</span></div>
          <div class="gl-row"><span class="gl-dot good"></span><span><strong>Good</strong> — 70–89% of plan speed</span></div>
          <div class="gl-row"><span class="gl-dot avg"></span><span><strong>Average</strong> — 50–69% of plan speed</span></div>
          <div class="gl-row"><span class="gl-dot poor"></span><span><strong>Poor</strong> — &lt; 50% of plan speed</span></div>
        </div>
      }
    </div>

    <!-- ISP Info Card -->
    <div class="card isp-card">
      <div class="isp-icon">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
          <path d="M1.75 7.75a10.5 10.5 0 0 1 20.5 0"/>
          <path d="M5.25 11.25a7 7 0 0 1 13.5 0"/>
          <path d="M8.75 14.75a3.5 3.5 0 0 1 6.5 0"/>
          <circle cx="12" cy="18" r="1" fill="white"/>
        </svg>
      </div>
      <div>
        <div class="isp-name">{{ user()?.plan?.isp }} — {{ user()?.plan?.city }}</div>
        <div class="isp-sub">{{ user()?.plan?.name }}</div>
      </div>
    </div>
  </div>
</div>
}
  `,
})
export class SpeedTestComponent implements AfterViewInit, OnDestroy {
  @ViewChild('meterCvs') cvs!: ElementRef<HTMLCanvasElement>;
  private auth = inject(AuthService);
  private svc = inject(SpeedTestService);
  private log = inject(LogService);

  st = toSignal(this.svc.state$, { initialValue: this.svc.state$.value });
  user = this.auth.currentUser;
  testing = signal(false);
  autoSaved = signal(false);
  smooth = signal(0);
  offline = signal(false);

  private _raf = 0;
  private _d = 0;

  steps = [
    { n: 1, label: 'Measuring latency & ping', phase: 'ping' },
    { n: 2, label: 'Testing download speed', phase: 'download' },
    { n: 3, label: 'Testing upload speed', phase: 'upload' },
    { n: 4, label: 'Analyzing results', phase: 'done' }
  ];

  dlPct = computed(() => Math.min(100, Math.round((this.st().download / (this.user()?.plan?.download ?? 1)) * 100)));
  ulPct = computed(() => Math.min(100, Math.round((this.st().upload / (this.user()?.plan?.upload ?? 1)) * 100)));

  cat = computed<'Best' | 'Good' | 'Average' | 'Poor'>(() => {
    const p = this.dlPct();
    return p >= 90 ? 'Best' : p >= 70 ? 'Good' : p >= 50 ? 'Average' : 'Poor';
  });

  catEmoji = computed(() => ({ Best: '🏆', Good: '✅', Average: '⚠️', Poor: '🔴' })[this.cat()]);

  perfDesc = computed(() => {
    const p = this.dlPct();
    if (p >= 90) return 'Excellent! Delivering near-plan speed.';
    if (p >= 70) return 'Good performance from your plan.';
    if (p >= 50) return 'Average — speeds are below plan expectations.';
    return 'Below average. Consider contacting your Act\'s Network Engineer.';
  });

  speedGrade = computed(() => {
    const dl = this.st().download;
    if (dl >= 300) return {
      grade: 'Looks Outstanding',
      title: 'Your internet connection is outstanding.',
      desc: 'Your connection should effortlessly handle ultra-fast downloads, many simultaneous users, online gaming, and 4K/8K streaming all at the same time.'
    };
    if (dl >= 100) return {
      grade: 'Looks Excellent',
      title: 'Your internet connection is excellent.',
      desc: 'Your connection should comfortably support multiple 4K video streams, intense gaming, fast downloads, and numerous connected devices.'
    };
    if (dl >= 50) return {
      grade: 'Looks Very Good',
      title: 'Your internet connection is very fast.',
      desc: 'Your connection should handle 4K video streaming, online gaming, fast downloads, and support several devices simultaneously.'
    };
    if (dl >= 25) return {
      grade: 'Looks Good',
      title: 'Your internet connection is fast.',
      desc: 'Your connection should handle HD video streaming, video calls, online gaming, and multiple devices at the same time.'
    };
    if (dl >= 10) return {
      grade: 'Looks Fair',
      title: 'Your internet connection is fair.',
      desc: 'Your connection should handle HD videos and video calls on 1–2 devices. Smooth performance for standard streaming.'
    };
    if (dl >= 5) return {
      grade: 'Looks Slow',
      title: 'Your internet connection is slow.',
      desc: 'Your connection should handle basic web browsing and lower-quality video streaming on one device at a time.'
    };
    return {
      grade: 'Looks Very Slow',
      title: 'Your internet connection is very slow.',
      desc: 'Your connection is suitable for basic browsing and messaging. Video streaming may experience buffering.'
    };
  });

  speedSummaryClass = computed(() => {
    const grade = this.speedGrade().grade
      .replace(/^looks\s+/i, '')
      .toLowerCase()
      .replace(/\s+/g, '-');
    return 'ss-' + grade;
  });

  isStepDone(phase: string): boolean {
    const order = ['ping', 'download', 'upload', 'done'];
    return order.indexOf(this.st().phase) > order.indexOf(phase);
  }

  ngAfterViewInit() { this.draw(0); this.loop(); }
  ngOnDestroy() { cancelAnimationFrame(this._raf); }

  async startTest() {
    if (this.testing()) return;
    this.offline.set(false);
    this.testing.set(true);
    this.autoSaved.set(false);
    this._d = 0;
    this.svc.reset();
    try {
      const result = await this.svc.runTest();
      this.autoSave(result);
    } catch (e: any) {
      if (e?.message === 'OFFLINE') {
        this.offline.set(true);
      }
    } finally {
      this.testing.set(false);
    }
  }

  dismissOffline() { this.offline.set(false); }

  retryConnection() {
    this.offline.set(false);
    this.startTest();
  }

  private autoSave(s: { download: number; upload: number; latency: number; jitter: number; downloadPath: string; uploadPath: string; server?: { city?: string; country?: string; machine?: string } }) {
    const u = this.user();
    if (!u) return;

    let testPath: 'mlab' | 'cdn' | 'backend' | 'mixed' = 'backend';
    if (s.downloadPath === 'mlab' && s.uploadPath === 'mlab') testPath = 'mlab';
    else if (s.downloadPath === 'cdn' && s.uploadPath === 'cdn') testPath = 'cdn';
    else if (s.downloadPath !== 'backend' || s.uploadPath !== 'backend') testPath = 'mixed';

    const serverLabel = s.server
      ? `${s.server.city || ''}${s.server.country ? ', ' + s.server.country : ''} (${s.server.machine || 'M-Lab'})`
      : '';

    this.log.save({
      userId: u.userId,
      download: s.download,
      upload: s.upload,
      latency: s.latency,
      jitter: s.jitter,
      server: serverLabel,
      testPath,
      planDownload: u.plan.download,
      planUpload: u.plan.upload
    }).subscribe({
      next: () => this.autoSaved.set(true),
      error: (err) => console.error('[SpeedTest] Failed to save results:', err.status, err.message)
    });
  }

  private loop() {
    const frame = () => {
      const target = this.svc.state$.value.liveSpeed;
      this._d += (target - this._d) * 0.10;
      if (Math.abs(this._d - target) < 0.05) this._d = target;
      this.smooth.set(this._d);
      this.draw(this._d);
      this._raf = requestAnimationFrame(frame);
    };
    this._raf = requestAnimationFrame(frame);
  }

  private draw(spd: number) {
    const cv = this.cvs?.nativeElement;
    if (!cv) return;
    const ctx = cv.getContext('2d')!;
    const W = cv.width, H = cv.height, cx = W / 2, cy = H - 20, R = 128;
    ctx.clearRect(0, 0, W, H);

    const max = this.user()?.plan?.download ?? 300;
    const frac = Math.min(1, spd / max);
    const sA = Math.PI, nA = sA + frac * Math.PI;

    ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI, 2 * Math.PI);
    ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 20; ctx.lineCap = 'round'; ctx.stroke();

    const zones = [
      { from: 0, to: .5, color: '#fecaca' },
      { from: .5, to: .7, color: '#fde68a' },
      { from: .7, to: .9, color: '#bbf7d0' },
      { from: .9, to: 1.0, color: '#86efac' }
    ];
    zones.forEach(z => {
      ctx.beginPath();
      ctx.arc(cx, cy, R, sA + z.from * Math.PI, sA + z.to * Math.PI);
      ctx.strokeStyle = z.color; ctx.lineWidth = 16; ctx.lineCap = 'butt'; ctx.stroke();
    });

    [{ at: .5, c: '#f59e0b' }, { at: .7, c: '#22c55e' }, { at: .9, c: '#16a34a' }].forEach(d => {
      const a = sA + d.at * Math.PI;
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * R, cy + Math.sin(a) * R, 5, 0, 2 * Math.PI);
      ctx.fillStyle = d.c; ctx.fill();
    });

    ctx.beginPath(); ctx.arc(cx + Math.cos(sA) * R, cy + Math.sin(sA) * R, 6, 0, 2 * Math.PI);
    ctx.fillStyle = '#e2001a'; ctx.fill();
    ctx.beginPath(); ctx.arc(cx + Math.cos(2 * Math.PI) * R, cy + Math.sin(2 * Math.PI) * R, 6, 0, 2 * Math.PI);
    ctx.fillStyle = '#16a34a'; ctx.fill();

    for (let i = 0; i <= 10; i++) {
      const a = Math.PI + (i / 10) * Math.PI, maj = i % 2 === 0;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (R - 22), cy + Math.sin(a) * (R - 22));
      ctx.lineTo(cx + Math.cos(a) * (R - (maj ? 36 : 28)), cy + Math.sin(a) * (R - (maj ? 36 : 28)));
      ctx.strokeStyle = maj ? '#9ca3af' : '#d1d5db'; ctx.lineWidth = maj ? 2 : 1; ctx.stroke();
      if (maj) {
        ctx.fillStyle = '#6b7280'; ctx.font = '500 10px Inter,sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(Math.round(i / 10 * max)), cx + Math.cos(a) * (R - 50), cy + Math.sin(a) * (R - 50));
      }
    }

    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.2)'; ctx.shadowBlur = 5;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(nA - .04) * 11, cy + Math.sin(nA - .04) * 11);
    ctx.lineTo(cx + Math.cos(nA) * (R - 24), cy + Math.sin(nA) * (R - 24));
    ctx.lineTo(cx + Math.cos(nA + .04) * 11, cy + Math.sin(nA + .04) * 11);
    ctx.closePath(); ctx.fillStyle = '#111827'; ctx.fill(); ctx.restore();

    ctx.beginPath(); ctx.arc(cx, cy, 11, 0, 2 * Math.PI); ctx.fillStyle = '#1f2937'; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, 5, 0, 2 * Math.PI); ctx.fillStyle = '#fff'; ctx.fill();
  }
}