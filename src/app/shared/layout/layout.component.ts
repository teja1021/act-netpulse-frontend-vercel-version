import { Component, OnInit, OnDestroy, computed, signal, HostListener } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { NgComponentOutlet } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { AiPanelService } from '../../features/ai-insights/ai-panel.service';
import type { AiInsightsComponent } from '../../features/ai-insights/ai-insights.component';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgComponentOutlet],
  template: `
@if (isOffline()) {
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
    <button class="op-retry" (click)="checkOnline()">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
      Try Again
    </button>
  </div>
</div>
} @else {
<div class="shell">

  <!-- NAVBAR -->
  <nav class="navbar">
    <div class="nav-inner">
      <a routerLink="/speed-test" class="logo">
       
        <img class="logo-np" src="/assets/images/net%20pulse%20logo%203.png" alt="NetPulse logo" />
      </a>

      <div class="nav-links">
        <!-- Speed Test always visible -->
        <a routerLink="/speed-test" routerLinkActive="nav-active" class="nav-link nav-pinned">Speed Test</a>

        <!-- Other links: visible on desktop, hidden in menu on mobile -->
        @for (item of menuItems; track item.path) {
          <a [routerLink]="item.path" routerLinkActive="nav-active" class="nav-link nav-menu-item">{{ item.label }}</a>
        }

        <!-- Hamburger button (mobile only, inside center group) -->
        <button class="hamburger" (click)="toggleMenu()" [class.ham-open]="menuOpen()">
          <span></span><span></span><span></span>
        </button>
      </div>

      <!-- Mobile dropdown menu -->
      @if (menuOpen()) {
        <div class="mobile-menu">
          @for (item of menuItems; track item.path) {
            <a [routerLink]="item.path" routerLinkActive="nav-active" class="mm-link" (click)="menuOpen.set(false)">{{ item.label }}</a>
          }
        </div>
      }

      <div class="nav-right">
        <div class="plan-pill">
          <span class="plan-dot"></span>
          {{ user()?.plan?.isp }} · {{ user()?.plan?.download }} Mbps
        </div>

        <!-- Profile avatar -->
        <div class="profile-wrap" (click)="toggleProfile()">
          <div class="profile-av">{{ initial() }}</div>
          @if (profileOpen()) {
            <div class="profile-dropdown" (click)="$event.stopPropagation()">
              <div class="pd-user">
                <div class="pd-av">{{ initial() }}</div>
                <div>
                  <div class="pd-name">{{ user()?.name }}</div>
                  <div class="pd-id">{{ user()?.userId }}</div>
                </div>
              </div>
              <div class="pd-divider"></div>
              <div class="pd-row"><span class="pd-lbl">Plan</span><span class="pd-val">{{ user()?.plan?.name }}</span></div>
              <div class="pd-row"><span class="pd-lbl">City</span><span class="pd-val">{{ user()?.plan?.city }}</span></div>
              <div class="pd-divider"></div>
              <button class="pd-logout" (click)="logout()">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                Sign Out
              </button>
            </div>
          }
        </div>
      </div>
    </div>
  </nav>

  <!-- PAGE CONTENT -->
  <div class="page-area" (click)="closeProfile()">
    <router-outlet />
  </div>

  <!-- FOOTER -->
  <footer class="footer">
    <div class="ft-row">
      <!-- LEFT: Brand -->
      <div class="ft-left">
        <div class="ft-brand">
          <a href="https://www.actcorp.in/" target="_blank" rel="noopener noreferrer" class="ft-act-link">ACT</a>
          <span class="ft-netpulse">NetPulse</span>
        </div>
      </div>

      <!-- CENTER: Social icons -->
      <div class="ft-center">
        <div class="ft-social">
          <a href="https://www.facebook.com/ACTFibernet" target="_blank" rel="noopener noreferrer" title="Facebook">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
          </a>
          <a href="https://www.linkedin.com/company/atria-convergence-technologies/" target="_blank" rel="noopener noreferrer" title="LinkedIn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
          </a>
          <a href="https://x.com/ACTFibernet" target="_blank" rel="noopener noreferrer" title="X (Twitter)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
          </a>
          <a href="https://www.instagram.com/ACTfibernet_india/" target="_blank" rel="noopener noreferrer" title="Instagram">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>
          </a>
          <a href="https://www.youtube.com/user/ACTBroadband" target="_blank" rel="noopener noreferrer" title="YouTube">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
          </a>
        </div>
      </div>

      <!-- RIGHT: Info -->
      <div class="ft-right">
        <div class="ft-tagline">MEAN Stack Internet Speed Monitor · Built for transparent network performance analytics</div>
      </div>
    </div>

    <!-- Divider -->
    <div class="ft-divider"></div>

    <!-- Bottom: official website -->
    <div class="ft-bottom">
      <a href="https://www.actcorp.in/" target="_blank" rel="noopener noreferrer" class="ft-official">actcorp.in</a>
      <span class="ft-dot">·</span>
      <span class="ft-official-text">ACT Fibernet Official Website</span>
    </div>
  </footer>

  <!-- AI FLOATING BUTTON -->
    <button class="ai-fab" (click)="aiSvc.toggle()" [class.fab-open]="aiSvc.open()" title="AI Network Assistant">
      @if (aiSvc.open()) {
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      } @else {
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <span>AI</span>
      }
    </button>
    

  <!-- AI PANEL -->
  @if (aiSvc.open()) {
    <div class="ai-overlay" (click)="aiSvc.close()"></div>
    <div class="ai-panel">
      @if (aiComp) {
        <ng-container *ngComponentOutlet="aiComp" />
      }
    </div>
  }
</div>
}
  `
})
export class LayoutComponent implements OnInit, OnDestroy {
  constructor(
    public aiSvc: AiPanelService,
    private auth: AuthService,
    private router: Router
  ) { }

  user = this.auth.currentUser;
  initial = computed(() => (this.user()?.name ?? 'U').charAt(0).toUpperCase());
  profileOpen = signal(false);
  menuOpen = signal(false);
  isOffline = signal(!navigator.onLine);
  aiComp: any = null;

  private onOnline = () => this.isOffline.set(false);
  private onOffline = () => this.isOffline.set(true);

  navItems = [
    { path: '/speed-test', label: 'Speed Test' },
    { path: '/dashboard', label: 'Dashboard' },
    { path: '/history', label: 'History' },
    { path: '/settings', label: 'Settings' }
  ];

  menuItems = [
    { path: '/dashboard', label: 'Dashboard' },
    { path: '/history', label: 'History' },
    { path: '/settings', label: 'Settings' }
  ];

  ngOnInit() {
    window.addEventListener('online', this.onOnline);
    window.addEventListener('offline', this.onOffline);
    this.router.events.subscribe(() => this.profileOpen.set(false));
    import('../../features/ai-insights/ai-insights.component')
      .then(m => this.aiComp = m.AiInsightsComponent);
  }

  ngOnDestroy() {
    window.removeEventListener('online', this.onOnline);
    window.removeEventListener('offline', this.onOffline);
  }

  checkOnline() {
    this.isOffline.set(!navigator.onLine);
  }

  toggleProfile() { this.profileOpen.update(v => !v); }
  closeProfile() { this.profileOpen.set(false); }
  toggleMenu() { this.menuOpen.update(v => !v); }
  logout() { this.auth.logout(); this.profileOpen.set(false); }

  @HostListener('document:click', ['$event'])
  onDocClick(e: Event) {
    const t = e.target as HTMLElement;
    if (this.menuOpen() && !t.closest('.hamburger') && !t.closest('.mobile-menu')) {
      this.menuOpen.set(false);
    }
  }
}
