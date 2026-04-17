import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { LogService, SpeedLog } from '../../core/services/log.service';
import { forkJoin, of } from 'rxjs';

@Component({
  selector: 'app-history',
  standalone: true,
  imports: [DatePipe, FormsModule],
  template: `
<div class="hero-banner">
  <h1>Test <span>History</span></h1>
  <p>Complete log of all speed tests with timestamps and performance categories</p>
</div>

<div class="hs-content">
  <div class="card hs-card">

    <div class="hs-head">
      <h3>All Speed Tests <span class="count-badge">{{ filtered().length }}</span></h3>
      <div class="hs-head-right">

        <!-- Category filter — bound to signal via (change) -->
        <div class="cat-dropdown">
          <select [value]="filter()" (change)="setFilter($any($event.target).value)">
            <option value="All">All Categories</option>
            <option value="Best">Best</option>
            <option value="Good">Good</option>
            <option value="Average">Average</option>
            <option value="Poor">Poor</option>
          </select>
          <svg class="sel-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>

        <!-- Clear All — deletes from backend too -->
        @if (logs().length > 0) {
          <button class="btn-clear-all" (click)="clearAll()" [disabled]="clearing()">
            @if (clearing()) { Clearing… } @else { Clear All }
          </button>
        }

        <!-- Refresh -->
        <button class="btn-refresh" (click)="load()" title="Refresh">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
        </button>
      </div>
    </div>

    @if (loading()) {
      <div class="load-row">
        <div class="spinner spinner-red"></div>
        <span style="color:var(--text2)">Loading…</span>
      </div>
    }

    @if (!loading() && logs().length === 0) {
      <div class="empty">
        <div style="font-size:2.5rem;margin-bottom:12px">📋</div>
        <p>No test records yet. Run a speed test to see results here.</p>
      </div>
    }

    @if (!loading() && logs().length > 0 && filtered().length === 0) {
      <div class="empty">
        <div style="font-size:2rem;margin-bottom:10px">🔍</div>
        <p>No results for <strong>{{ filter() }}</strong> category.</p>
        <button class="btn-ghost-sm" (click)="setFilter('All')">Show all</button>
      </div>
    }

    @if (!loading() && filtered().length > 0) {
      <table>
        <thead>
          <tr>
            <th class="th-s" (click)="sort('createdAt')">
              DATE &amp; TIME
              @if (sortF() === 'createdAt') { <span class="sort-ic">{{ sortD()==='desc'?'↓':'↑' }}</span> }
            </th>
            <th class="th-s" (click)="sort('download')">
              DOWNLOAD
              @if (sortF() === 'download') { <span class="sort-ic">{{ sortD()==='desc'?'↓':'↑' }}</span> }
            </th>
            <th class="th-s" (click)="sort('upload')">
              UPLOAD
              @if (sortF() === 'upload') { <span class="sort-ic">{{ sortD()==='desc'?'↓':'↑' }}</span> }
            </th>
            <th class="th-s" (click)="sort('latency')">
              LATENCY
              @if (sortF() === 'latency') { <span class="sort-ic">{{ sortD()==='desc'?'↓':'↑' }}</span> }
            </th>
            <th class="th-s" (click)="sort('jitter')">
              JITTER
              @if (sortF() === 'jitter') { <span class="sort-ic">{{ sortD()==='desc'?'↓':'↑' }}</span> }
            </th>
            <th>SERVER</th>
            <th>PLAN %</th>
            <th>RATING</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          @for (row of paged(); track row._id) {
            <tr class="tr">
              <td>
                <div class="td-dt">{{ row.createdAt | date:'dd MMM yyyy' }}</div>
                <div class="td-tm">{{ row.createdAt | date:'hh:mm a' }}</div>
              </td>
              <td><span class="sv dl">{{ row.download }}</span><span class="su">Mbps</span></td>
              <td><span class="sv ul">{{ row.upload }}</span><span class="su">Mbps</span></td>
              <td><span class="sv lat">{{ row.latency }}</span><span class="su">ms</span></td>
              <td><span class="sv jit">{{ row.jitter || 0 }}</span><span class="su">ms</span></td>
              <td><span class="td-srv">{{ row.server || '—' }}</span></td>
              <td class="td-pct">{{ row.planPercentage }}%</td>
              <td>
                <span class="grade-badge" [class]="'gb-'+row.category.toLowerCase()">
                  {{ row.category.toUpperCase() }}
                </span>
              </td>
              <td>
                <button class="del-btn" (click)="del(row._id!)" title="Delete">✕</button>
              </td>
            </tr>
          }
        </tbody>
      </table>

      @if (totalPages() > 1) {
        <div class="pagination">
          <button class="pg-btn" [disabled]="page()===1" (click)="page.set(page()-1)">‹ Prev</button>
          <div class="pg-nums">
            @for (p of pageRange(); track p) {
              <button class="pg-num" [class.active]="p===page()" (click)="page.set(p)">{{ p }}</button>
            }
          </div>
          <button class="pg-btn" [disabled]="page()===totalPages()" (click)="page.set(page()+1)">Next ›</button>
        </div>
      }
    }
  </div>
</div>
  `,
  styles: [`
    .hero-banner{background:linear-gradient(135deg,var(--navy) 0%,var(--navy3) 60%,#2a1040 100%);padding:36px 48px 40px}
    .hero-banner h1{font-family:var(--font-d);font-size:2.3rem;font-weight:800;color:#fff;margin-bottom:8px}
    .hero-banner h1 span{color:var(--red)}
    .hero-banner p{font-size:.88rem;color:rgba(255,255,255,.5)}

    .hs-content{padding:24px 32px;max-width:1400px;margin:0 auto}
    .hs-card{padding:0;overflow:hidden}

    .hs-head{display:flex;align-items:center;justify-content:space-between;padding:18px 24px;border-bottom:1px solid var(--border);flex-wrap:wrap;gap:10px}
    .hs-head h3{font-family:var(--font-d);font-size:1.1rem;font-weight:700;display:flex;align-items:center;gap:8px}
    .count-badge{font-size:.72rem;font-weight:700;padding:2px 9px;background:var(--bg);border:1px solid var(--border);border-radius:20px;color:var(--text2)}
    .hs-head-right{display:flex;align-items:center;gap:10px}

    .cat-dropdown{position:relative;display:flex;align-items:center}
    .cat-dropdown select{
      appearance:none;padding:7px 32px 7px 12px;
      border:1.5px solid var(--border);border-radius:var(--r-md);
      font-size:.82rem;color:var(--text);background:var(--white);
      cursor:pointer;outline:none;font-family:var(--font);
      transition:border-color .15s;
    }
    .cat-dropdown select:focus{border-color:var(--red)}
    .sel-arrow{position:absolute;right:10px;pointer-events:none;color:var(--text2)}

    .btn-clear-all{
      padding:6px 14px;background:none;border:1.5px solid rgba(226,0,26,.3);
      border-radius:var(--r-md);color:var(--red);font-size:.8rem;font-weight:600;
      cursor:pointer;transition:all .15s;font-family:var(--font);
    }
    .btn-clear-all:hover:not(:disabled){background:var(--red);color:#fff}
    .btn-clear-all:disabled{opacity:.5;cursor:not-allowed}

    .btn-refresh{
      display:flex;align-items:center;padding:7px;background:none;
      border:1.5px solid var(--border);border-radius:var(--r-md);
      color:var(--text2);cursor:pointer;transition:all .15s;
    }
    .btn-refresh:hover{border-color:var(--red);color:var(--red)}

    .load-row{display:flex;align-items:center;gap:12px;padding:48px;justify-content:center}
    .empty{padding:48px;text-align:center;color:var(--text2)}
    .btn-ghost-sm{margin-top:10px;padding:6px 16px;background:none;border:1.5px solid var(--border);border-radius:var(--r-md);font-size:.82rem;cursor:pointer;font-family:var(--font);transition:all .15s}
    .btn-ghost-sm:hover{border-color:var(--red);color:var(--red)}

    table{width:100%;border-collapse:collapse}
    thead tr{border-bottom:1px solid var(--border)}
    th{padding:11px 24px;font-size:.65rem;font-weight:700;letter-spacing:.1em;color:var(--text2);text-align:left;white-space:nowrap;background:var(--bg)}
    th.th-s{cursor:pointer;user-select:none}
    th.th-s:hover{color:var(--text)}
    .sort-ic{margin-left:3px;color:var(--red)}

    .tr{border-bottom:1px solid var(--border);transition:background .12s}
    .tr:hover{background:#f9fafb}
    .tr:last-child{border-bottom:none}
    td{padding:14px 24px;vertical-align:middle}

    .td-dt{font-size:.9rem;font-weight:600;color:var(--text)}
    .td-tm{font-size:.75rem;color:var(--text2);margin-top:2px}
    .sv{font-family:var(--font-d);font-size:1.25rem;font-weight:700}
    .sv.dl{color:#16a34a}.sv.ul{color:#1e40af}.sv.lat{color:#d97706}.sv.jit{color:#7c3aed}
    .su{font-size:.75rem;color:var(--text2);margin-left:4px}
    .td-pct{font-weight:700;color:var(--text);font-size:.95rem}
    .td-srv{font-size:.75rem;color:var(--text2);max-width:140px;display:inline-block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

    .grade-badge{display:inline-block;padding:4px 12px;border-radius:20px;font-size:.72rem;font-weight:800;letter-spacing:.07em}
    .gb-best{background:rgba(22,163,74,.1);color:#16a34a;border:1.5px solid rgba(22,163,74,.25)}
    .gb-good{background:rgba(30,64,175,.1);color:#1e40af;border:1.5px solid rgba(30,64,175,.2)}
    .gb-average{background:rgba(217,119,6,.1);color:#d97706;border:1.5px solid rgba(217,119,6,.2)}
    .gb-poor{background:rgba(226,0,26,.08);color:var(--red);border:1.5px solid rgba(226,0,26,.2)}

    .del-btn{background:none;border:none;color:var(--text3);cursor:pointer;font-size:.85rem;padding:4px 8px;border-radius:4px;transition:all .15s}
    .del-btn:hover{background:#fee2e2;color:var(--red)}

    .pagination{display:flex;align-items:center;justify-content:center;gap:8px;padding:14px;border-top:1px solid var(--border)}
    .pg-btn{padding:6px 14px;border:1.5px solid var(--border);border-radius:var(--r-md);background:var(--white);color:var(--text2);font-size:.82rem;cursor:pointer;transition:all .15s;font-family:var(--font);font-weight:600}
    .pg-btn:hover:not(:disabled){border-color:var(--red);color:var(--red)}
    .pg-btn:disabled{opacity:.35;cursor:not-allowed}
    .pg-nums{display:flex;gap:4px}
    .pg-num{width:30px;height:30px;border:1.5px solid var(--border);border-radius:var(--r-sm);background:var(--white);color:var(--text2);font-size:.8rem;cursor:pointer;transition:all .15s;display:flex;align-items:center;justify-content:center;font-family:var(--font)}
    .pg-num.active{background:var(--red);border-color:var(--red);color:#fff;font-weight:700}
    .pg-num:hover:not(.active){border-color:var(--red);color:var(--red)}

    @media(max-width:900px){
      .hs-head{flex-direction:column;align-items:flex-start;gap:12px;padding:14px 16px}
      .hs-head-right{width:100%;flex-wrap:wrap}
    }

    @media(max-width:680px){
      .hero-banner{padding:24px 16px 28px}
      .hero-banner h1{font-size:1.6rem}
      .hero-banner p{font-size:.78rem}
      .hs-content{padding:14px 10px}
      .hs-card{overflow:visible}
      table{display:block;overflow-x:auto;-webkit-overflow-scrolling:touch;white-space:nowrap}
      thead{display:table;width:100%;table-layout:auto}
      tbody{display:table;width:100%;table-layout:auto}
      th{padding:10px 14px;font-size:.58rem}
      td{padding:10px 14px;font-size:.8rem}
      .sv{font-size:1rem}
      .td-dt{font-size:.8rem}
      .td-tm{font-size:.68rem}
      .grade-badge{font-size:.65rem;padding:3px 8px}
      .pagination{flex-wrap:wrap;gap:6px;padding:10px}
      .pg-btn{padding:5px 10px;font-size:.76rem}
      .pg-num{width:26px;height:26px;font-size:.72rem}
    }
  `]
})
export class HistoryComponent implements OnInit {
  private auth = inject(AuthService);
  private logSvc = inject(LogService);

  logs = signal<SpeedLog[]>([]);
  loading = signal(true);
  clearing = signal(false);

  // ── FIX 1: filter is now a SIGNAL so computed() reacts to changes ──
  filter = signal('All');
  sortF = signal('createdAt');
  sortD = signal<'asc' | 'desc'>('desc');
  page = signal(1);
  ps = 10;

  ngOnInit() { this.load(); }

  load() {
    const uid = this.auth.currentUser()?.userId;
    if (!uid) return;
    this.loading.set(true);
    this.logSvc.getAll(uid).subscribe({
      next: r => { if (r.success) this.logs.set(r.logs); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  // ── FIX 1: setFilter updates the signal → computed() reacts ──
  setFilter(val: string) {
    this.filter.set(val);
    this.page.set(1);
  }

  // ── FIX 2: clearAll deletes every log from backend ──
  clearAll() {
    if (!confirm('Are you sure you want to clear all test history? This action cannot be undone.')) return;
    const all = this.logs();
    if (!all.length) return;
    this.clearing.set(true);

    // Delete all records from backend in parallel
    const deletes = all
      .filter(l => l._id)
      .map(l => this.logSvc.delete(l._id!));

    if (deletes.length === 0) {
      this.logs.set([]);
      this.clearing.set(false);
      return;
    }

    forkJoin(deletes).subscribe({
      next: () => {
        this.logs.set([]);        // clear UI after backend confirms
        this.clearing.set(false);
        this.page.set(1);
      },
      error: () => {
        // Even if some fail, refresh from backend to show true state
        this.clearing.set(false);
        this.load();
      }
    });
  }

  // ── computed() now reacts because filter, sortF, sortD are all signals ──
  filtered = computed(() => {
    let d = [...this.logs()];

    // Apply category filter
    if (this.filter() !== 'All') {
      d = d.filter(l => l.category === this.filter());
    }

    // Apply sort
    const f = this.sortF() as keyof SpeedLog;
    d.sort((a, b) => {
      const av = a[f] as any, bv = b[f] as any;
      return this.sortD() === 'desc'
        ? (av > bv ? -1 : av < bv ? 1 : 0)
        : (av > bv ? 1 : av < bv ? -1 : 0);
    });

    return d;
  });

  paged = computed(() => this.filtered().slice((this.page() - 1) * this.ps, this.page() * this.ps));
  totalPages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.ps)));
  pageRange = computed(() => Array.from({ length: this.totalPages() }, (_, i) => i + 1));

  sort(f: string) {
    if (this.sortF() === f) {
      this.sortD.update(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortF.set(f);
      this.sortD.set('desc');
    }
    this.page.set(1);
  }

  // Delete single record from backend + UI
  del(id: string) {
    this.logSvc.delete(id).subscribe({
      next: () => this.logs.update(all => all.filter(l => l._id !== id)),
      error: () => { } // silent fail — record stays in UI
    });
  }
}