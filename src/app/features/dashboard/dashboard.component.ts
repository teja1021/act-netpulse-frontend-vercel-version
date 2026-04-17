import { Component, OnInit, AfterViewInit, OnDestroy, ViewChild, ElementRef, signal, inject } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';
import { LogService, SpeedLog } from '../../core/services/log.service';
import { Chart, registerables } from 'chart.js';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

Chart.register(...registerables);

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [],
  template: `
<div class="hero-banner">
  <h1>Analytics <span>Dashboard</span></h1>
  <p>Network performance trends and insights across all your speed tests</p>
</div>

<div class="db-wrap">

  <!-- Stat cards -->
  <div class="stats-row">
    <div class="stat-card card">
      <div class="sc-lbl">AVG DOWNLOAD</div>
      <div class="sc-val dl-c">{{ stats()?.avgDownload ?? '—' }} <span class="sc-u">Mbps</span></div>
      @if (stats()?.totalTests > 0) { <div class="sc-trend green">↑ From {{ stats()?.totalTests }} tests</div> }
    </div>
    <div class="stat-card card">
      <div class="sc-lbl">AVG UPLOAD</div>
      <div class="sc-val ul-c">{{ stats()?.avgUpload ?? '—' }} <span class="sc-u">Mbps</span></div>
      @if (stats()?.totalTests > 0) { <div class="sc-trend blue">Across all tests</div> }
    </div>
    <div class="stat-card card">
      <div class="sc-lbl">AVG LATENCY</div>
      <div class="sc-val">{{ stats()?.avgLatency ?? '—' }} <span class="sc-u">ms</span></div>
      @if (stats()?.avgLatency) {
        <div class="sc-trend" [class]="stats()?.avgLatency < 30 ? 'green' : 'orange'">
          {{ stats()?.avgLatency < 30 ? '↓ Great latency' : 'Room to improve' }}
        </div>
      }
    </div>
    <div class="stat-card card">
      <div class="sc-lbl">TESTS RUN</div>
      <div class="sc-val">{{ filteredLogs().length }}</div>
      <div class="sc-trend gray">Last {{ selectedDays() }} days</div>
    </div>
  </div>

  @if (loading()) {
    <div class="load-row"><div class="spinner spinner-red"></div><span style="color:var(--text2)">Loading analytics…</span></div>
  }

  @if (!loading() && logs().length === 0) {
    <div class="empty"><div style="font-size:3rem;margin-bottom:12px">📡</div><h3>No data yet</h3><p>Run a speed test to see analytics here.</p></div>
  }

  @if (!loading() && logs().length > 0) {
    <div class="charts-row">
      <div class="card chart-card">
        <div class="ch-head">
          <h3>Speed Trend – Last {{ selectedDays() }} Days</h3>
          <!-- WORKING DAY FILTER -->
          <div class="day-filter">
            @for (d of dayOptions; track d) {
              <button class="day-btn" [class.active]="selectedDays() === d" (click)="setDays(d)">
                {{ d }} Days
              </button>
            }
          </div>
        </div>
        <div class="ch-body"><canvas #lineChart></canvas></div>
      </div>

      <div class="card chart-sm">
        <h3 class="ch-title">Rating Distribution</h3>
        <div class="donut-body"><canvas #pieChart></canvas></div>
        <div class="donut-leg">
          @for (c of catData(); track c.label) {
            <div class="dl-row">
              <div class="dl-dot" [style.background]="c.color"></div>
              <span>{{ c.label }}</span>
              <span class="dl-n">{{ c.count }}</span>
            </div>
          }
        </div>
      </div>
    </div>

    <!-- Plan utilization -->
    <div class="card util-card">
      <h3 class="ch-title" style="margin-bottom:16px">Plan Utilization</h3>
      <div class="util-row">
        <span class="util-lbl">Download</span>
        <div class="util-track"><div class="util-fill util-dl" [style.width.%]="dlUtil()"></div></div>
        <span class="util-pct green-c">{{ dlUtil() }}%</span>
      </div>
      <div class="util-row">
        <span class="util-lbl">Upload</span>
        <div class="util-track"><div class="util-fill util-ul" [style.width.%]="ulUtil()"></div></div>
        <span class="util-pct blue-c">{{ ulUtil() }}%</span>
      </div>
      <div class="util-row">
        <span class="util-lbl">Latency Target</span>
        <div class="util-track"><div class="util-fill util-lat" [style.width.%]="latUtil()"></div></div>
        <span class="util-pct orange-c">{{ latUtil() }}%</span>
      </div>
    </div>

    <!-- Hourly heatmap -->
    <div class="card heatmap-card">
      <h3 class="ch-title" style="margin-bottom:16px">Hourly Performance Heatmap</h3>
      <div class="hm-body"><canvas #heatChart></canvas></div>
    </div>
  }
</div>
  `,
  styles: [`
    .hero-banner { background:linear-gradient(135deg,var(--navy) 0%,var(--navy3) 60%,#2a1040 100%); padding:36px 48px 40px; }
    .hero-banner h1 { font-family:var(--font-d); font-size:2.3rem; font-weight:800; color:#fff; margin-bottom:8px; }
    .hero-banner h1 span { color:var(--red); }
    .hero-banner p { font-size:.88rem; color:rgba(255,255,255,.5); }

    .db-wrap { padding:24px 32px; max-width:1400px; margin:0 auto; display:flex; flex-direction:column; gap:18px; }

    .stats-row { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; }
    .stat-card { padding:22px; }
    .sc-lbl { font-size:.64rem; font-weight:700; letter-spacing:.12em; color:var(--text2); text-transform:uppercase; margin-bottom:8px; }
    .sc-val { font-family:var(--font-d); font-size:1.75rem; font-weight:800; color:var(--text); line-height:1; }
    .sc-u   { font-size:1rem; font-weight:500; color:var(--text2); }
    .sc-trend { font-size:.75rem; margin-top:6px; font-weight:500; }
    .sc-trend.green  { color:var(--green); }
    .sc-trend.blue   { color:var(--blue); }
    .sc-trend.orange { color:var(--orange); }
    .sc-trend.gray   { color:var(--text3); }
    .dl-c { color:var(--green) !important; }
    .ul-c { color:var(--blue) !important; }

    .load-row { display:flex; align-items:center; gap:12px; padding:48px; justify-content:center; }
    .empty { text-align:center; padding:60px; color:var(--text2); }
    .empty h3 { color:var(--text); margin-bottom:8px; }

    .charts-row { display:grid; grid-template-columns:1fr 300px; gap:16px; }
    .chart-card { padding:22px; }

    /* Day filter buttons */
    .ch-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; }
    .ch-head h3 { font-family:var(--font-d); font-size:1rem; font-weight:700; }
    .day-filter { display:flex; gap:4px; }
    .day-btn {
      padding:4px 12px; border:1.5px solid var(--border);
      border-radius:var(--r-md); font-size:.75rem; font-weight:600;
      color:var(--text2); background:var(--white); cursor:pointer;
      transition:all .15s; font-family:var(--font);
    }
    .day-btn:hover { border-color:var(--red); color:var(--red); }
    .day-btn.active { background:var(--red); color:#fff; border-color:var(--red); }

    .ch-body { height:240px; position:relative; }
    .ch-body canvas { width:100%!important; height:100%!important; }

    .chart-sm { padding:22px; }
    .ch-title { font-family:var(--font-d); font-size:1rem; font-weight:700; }
    .donut-body { height:180px; position:relative; }
    .donut-body canvas { width:100%!important; height:100%!important; }
    .donut-leg { display:flex; flex-direction:column; gap:8px; margin-top:12px; }
    .dl-row { display:flex; align-items:center; gap:8px; font-size:.82rem; color:var(--text2); }
    .dl-dot { width:10px; height:10px; border-radius:50%; flex-shrink:0; }
    .dl-n { margin-left:auto; font-weight:600; color:var(--text); }

    .util-card { padding:22px; }
    .util-row { display:flex; align-items:center; gap:12px; margin-bottom:12px; font-size:.85rem; }
    .util-row:last-child { margin-bottom:0; }
    .util-lbl { width:140px; flex-shrink:0; color:var(--text2); }
    .util-track { flex:1; height:10px; background:var(--bg); border-radius:5px; overflow:hidden; }
    .util-fill { height:100%; border-radius:5px; transition:width .6s ease; }
    .util-dl { background:var(--green); }
    .util-ul { background:var(--blue); }
    .util-lat { background:var(--orange); }
    .util-pct { font-weight:700; min-width:44px; text-align:right; font-size:.85rem; }
    .green-c { color:var(--green); }
    .blue-c  { color:var(--blue); }
    .orange-c { color:var(--orange); }

    .heatmap-card { padding:22px; }
    .hm-body { height:220px; position:relative; }
    .hm-body canvas { width:100%!important; height:100%!important; }

    @media(max-width:1100px) {
      .stats-row { grid-template-columns:repeat(2,1fr); }
      .charts-row { grid-template-columns:1fr; }
    }
  `]
})
export class DashboardComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('lineChart') lineRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('pieChart') pieRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('heatChart') heatRef!: ElementRef<HTMLCanvasElement>;

  private auth = inject(AuthService);
  private logSvc = inject(LogService);
  private destroy$ = new Subject<void>();

  logs = signal<SpeedLog[]>([]);
  stats = signal<any>(null);
  loading = signal(true);
  selectedDays = signal(14);                    // ← active filter
  user = this.auth.currentUser;
  dayOptions = [7, 14, 30];                   // ← filter options

  private lc?: Chart;
  private pc?: Chart;
  private hc?: Chart;

  ngOnInit() { this.load(); }
  ngAfterViewInit() { }
  ngOnDestroy() { this.destroy$.next(); this.lc?.destroy(); this.pc?.destroy(); this.hc?.destroy(); }

  // ── Filter logs to selected day range ────────────────────────
  filteredLogs(): SpeedLog[] {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.selectedDays());
    return this.logs().filter(l => new Date(l.createdAt ?? Date.now()) >= cutoff);
  }

  // ── When user clicks a day button ────────────────────────────
  setDays(days: number): void {
    this.selectedDays.set(days);
    // Rebuild charts with new filtered data
    setTimeout(() => this.buildCharts(), 50);
  }

  load() {
    const uid = this.auth.currentUser()?.userId;
    if (!uid) return;
    this.loading.set(true);
    this.logSvc.getAll(uid).pipe(takeUntil(this.destroy$)).subscribe({
      next: r => {
        if (r.success) {
          this.logs.set(r.logs);
          this.stats.set(r.stats);
          setTimeout(() => this.buildCharts(), 80);
        }
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  // ── Category distribution for donut ──────────────────────────
  catData() {
    const d = { Best: 0, Good: 0, Average: 0, Poor: 0 } as Record<string, number>;
    // Use filtered logs for the donut too
    this.filteredLogs().forEach(l => d[l.category]++);
    return [
      { label: 'Best', count: d['Best'], color: '#15803d' },
      { label: 'Good', count: d['Good'], color: '#22c55e' },
      { label: 'Average', count: d['Average'], color: '#d97706' },
      { label: 'Poor', count: d['Poor'], color: '#e2001a' }
    ];
  }

  dlUtil() {
    const fl = this.filteredLogs();
    if (!fl.length) return 0;
    const avg = fl.reduce((s, l) => s + l.download, 0) / fl.length;
    return Math.min(100, Math.round((avg / (this.user()?.plan?.download ?? 1)) * 100));
  }

  ulUtil() {
    const fl = this.filteredLogs();
    if (!fl.length) return 0;
    const avg = fl.reduce((s, l) => s + l.upload, 0) / fl.length;
    return Math.min(100, Math.round((avg / (this.user()?.plan?.upload ?? 1)) * 100));
  }

  latUtil() {
    const fl = this.filteredLogs();
    if (!fl.length) return 0;
    const avg = fl.reduce((s, l) => s + l.latency, 0) / fl.length;
    return Math.min(100, Math.round((50 / avg) * 100));
  }

  // ── Build all charts ──────────────────────────────────────────
  private buildCharts() {
    if (!this.logs().length) return;
    this.buildLine();
    this.buildPie();
    this.buildHeatmap();
  }

  private buildLine() {
    const el = this.lineRef?.nativeElement; if (!el) return;
    this.lc?.destroy();

    // Use filteredLogs — respects the day selector
    const data = [...this.filteredLogs()].reverse();
    const plan = this.user()?.plan?.download ?? 300;
    const labels = data.map(l => {
      const d = new Date(l.createdAt!);
      return `${d.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]}`;
    });

    this.lc = new Chart(el, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Download', data: data.map(l => l.download),
            borderColor: '#16a34a', backgroundColor: 'rgba(22,163,74,.12)',
            fill: true, tension: .4, pointRadius: 4,
            pointBackgroundColor: '#16a34a', pointBorderColor: '#fff', pointBorderWidth: 2
          },
          {
            label: 'Upload', data: data.map(l => l.upload),
            borderColor: '#1e3a8a', backgroundColor: 'rgba(30,58,138,.06)',
            fill: false, tension: .4, pointRadius: 4,
            pointBackgroundColor: '#1e3a8a', pointBorderColor: '#fff', pointBorderWidth: 2
          },
          {
            label: 'Plan', data: data.map(() => plan),
            borderColor: 'rgba(226,0,26,.5)', backgroundColor: 'transparent',
            fill: false, tension: 0, pointRadius: 0,
            borderDash: [6, 4], borderWidth: 2
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: {
              color: '#374151', font: { size: 12 }, boxWidth: 12,
              filter: (i: any) => i.text !== 'Plan'
            }
          }
        },
        scales: {
          x: { ticks: { color: '#9ca3af', font: { size: 10 } }, grid: { color: 'rgba(0,0,0,.04)' } },
          y: { ticks: { color: '#9ca3af', font: { size: 10 } }, grid: { color: 'rgba(0,0,0,.04)' }, beginAtZero: false }
        }
      }
    });
  }

  private buildPie() {
    const el = this.pieRef?.nativeElement; if (!el) return;
    this.pc?.destroy();
    const d = this.catData();
    this.pc = new Chart(el, {
      type: 'doughnut',
      data: {
        labels: d.map(x => x.label),
        datasets: [{ data: d.map(x => x.count), backgroundColor: d.map(x => x.color), borderWidth: 3, borderColor: '#fff' }]
      },
      options: { responsive: true, maintainAspectRatio: false, cutout: '58%', plugins: { legend: { display: false } } }
    });
  }

  private buildHeatmap() {
    const el = this.heatRef?.nativeElement; if (!el) return;
    this.hc?.destroy();

    const byHour: number[][] = Array.from({ length: 24 }, () => []);
    // Use filteredLogs for heatmap too
    this.filteredLogs().forEach(l => {
      const h = new Date(l.createdAt ?? Date.now()).getHours();
      byHour[h].push(l.download);
    });

    const plan = this.user()?.plan?.download ?? 300;
    const labels = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
    const values = byHour.map(arr => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0);
    const barColors = values.map(v => {
      if (v === 0) return 'rgba(229,231,235,.4)';
      const pct = v / plan;
      if (pct >= 0.9) return '#16a34a';
      if (pct >= 0.7) return '#22c55e';
      if (pct >= 0.5) return '#d97706';
      return '#e2001a';
    });

    this.hc = new Chart(el, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Avg Download (Mbps)',
          data: values.map(v => v === 0 ? null : v),
          backgroundColor: barColors,
          borderRadius: 4,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx: any) => ` ${ctx.parsed.y?.toFixed(1) ?? '—'} Mbps` } }
        },
        scales: {
          x: { ticks: { color: '#9ca3af', font: { size: 10 }, maxRotation: 0 }, grid: { display: false } },
          y: { ticks: { color: '#9ca3af', font: { size: 10 } }, grid: { color: 'rgba(0,0,0,.04)' }, beginAtZero: true, max: plan * 1.1 }
        }
      }
    });
  }
}