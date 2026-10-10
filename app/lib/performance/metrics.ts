/**
 * Performance Monitoring System
 * Based on Claude.dev's approach: measure everything, then optimize
 *
 * Core User Journeys:
 * - App Launch: Time to interactive on fresh load
 * - Starting Chat: Time to typeable composer
 * - Loading Project: Time to show existing conversation
 * - Sending Message: Time from send to first token
 * - Code Preview: Time to render WebContainer preview
 */

interface PerformanceMetric {
  name: string;
  duration: number;
  timestamp: number;
  metadata?: Record<string, any>;
}

export type { PerformanceMetric };

interface JourneyMarks {
  [key: string]: number;
}

class PerformanceMonitor {
  private _metrics: PerformanceMetric[] = [];
  private _journeyMarks: Map<string, JourneyMarks> = new Map();
  private _enabled =
    typeof window !== 'undefined' &&
    (import.meta.env.DEV || new URLSearchParams(window.location.search).get('profile') === '1');
  private readonly _maxMetrics = 1_000;

  isEnabled() {
    return this._enabled;
  }

  setEnabled(enabled: boolean) {
    this._enabled = enabled;
  }

  /**
   * Mark the start of a user journey
   */
  markStart(journey: string, label: string = 'start') {
    if (!this._enabled) {
      return;
    }

    const markName = `${journey}:${label}`;
    performance.mark(markName);

    if (!this._journeyMarks.has(journey)) {
      this._journeyMarks.set(journey, {});
    }

    const marks = this._journeyMarks.get(journey)!;
    marks[label] = performance.now();
  }

  /**
   * Mark the end of a user journey and record the measurement
   */
  markEnd(journey: string, label: string = 'end', metadata?: Record<string, any>): number | null {
    if (!this._enabled) {
      return null;
    }

    const endMarkName = `${journey}:${label}`;
    performance.mark(endMarkName);

    const marks = this._journeyMarks.get(journey);

    if (!marks || marks.start === undefined) {
      console.warn(`[PERF] No start mark found for journey: ${journey}`);
      return null;
    }

    const startMarkName = `${journey}:start`;
    const measureName = `${journey}:${label}`;

    try {
      performance.measure(measureName, startMarkName, endMarkName);

      const measures = performance.getEntriesByName(measureName, 'measure');
      const measure = measures[measures.length - 1] as PerformanceMeasure | undefined;

      if (!measure) {
        return null;
      }

      const duration = measure.duration;

      // Record the metric
      this.recordMetric(measureName, duration, metadata);

      // Clean up marks for this journey
      this._journeyMarks.delete(journey);
      performance.clearMarks(startMarkName);
      performance.clearMarks(endMarkName);
      performance.clearMeasures(measureName);

      return duration;
    } catch (_error) {
      console.error(`[PERF] Error measuring ${journey}:`, _error);
      return null;
    }
  }

  /**
   * Record a metric directly without marks
   */
  recordMetric(name: string, duration: number, metadata?: Record<string, any>) {
    if (!this._enabled) {
      return;
    }

    const metric: PerformanceMetric = {
      name,
      duration,
      timestamp: Date.now(),
      metadata,
    };

    this._metrics.push(metric);

    if (this._metrics.length > this._maxMetrics) {
      this._metrics.splice(0, this._metrics.length - this._maxMetrics);
    }

    // Log to console in development
    if (import.meta.env.DEV) {
      console.log(`[PERF] ${name}: ${duration.toFixed(2)}ms`, metadata || '');
    }

    // Send to analytics in production
    if (import.meta.env.PROD) {
      this._sendToAnalytics(metric);
    }
  }

  /**
   * Get all recorded metrics
   */
  getMetrics(): PerformanceMetric[] {
    return [...this._metrics];
  }

  getJourneyNames(): string[] {
    return [...new Set(this._metrics.map((metric) => metric.name))];
  }

  getJourneyStats(journey: string) {
    const durations = this._metrics
      .filter((metric) => metric.name === journey)
      .map((metric) => metric.duration)
      .sort((a, b) => a - b);

    if (durations.length === 0) {
      return null;
    }

    const percentile = (p: number) => durations[Math.max(0, Math.ceil((durations.length * p) / 100) - 1)];

    return {
      count: durations.length,
      min: durations[0],
      max: durations[durations.length - 1],
      avg: durations.reduce((sum, duration) => sum + duration, 0) / durations.length,
      p50: percentile(50),
      p75: percentile(75),
      p95: percentile(95),
      p99: percentile(99),
    };
  }

  exportEvents(): string {
    return JSON.stringify(this._metrics, null, 2);
  }

  /**
   * Get metrics for a specific journey
   */
  getJourneyMetrics(journey: string): PerformanceMetric[] {
    return this._metrics.filter((m) => m.name.startsWith(journey));
  }

  /**
   * Calculate percentiles for a set of durations
   */
  calculatePercentiles(durations: number[]): { p50: number; p75: number; p95: number; p99: number } {
    if (durations.length === 0) {
      return { p50: 0, p75: 0, p95: 0, p99: 0 };
    }

    const sorted = [...durations].sort((a, b) => a - b);

    return {
      p50: this._percentile(sorted, 50),
      p75: this._percentile(sorted, 75),
      p95: this._percentile(sorted, 95),
      p99: this._percentile(sorted, 99),
    };
  }

  private _percentile(sorted: number[], p: number): number {
    const index = Math.ceil((sorted.length * p) / 100) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Send metrics to analytics service
   */
  private _sendToAnalytics(metric: PerformanceMetric) {
    /*
     * Integration point for analytics services
     * Could be sent to: Datadog, New Relic, custom backend, etc.
     */
    if (typeof window !== 'undefined' && (window as any).__PERFORMANCE_ANALYTICS__) {
      (window as any).__PERFORMANCE_ANALYTICS__(metric);
    }
  }

  /**
   * Clear all metrics
   */
  clear() {
    this._metrics = [];
    this._journeyMarks.clear();
    performance.clearMarks();
    performance.clearMeasures();
  }

  clearEvents() {
    this.clear();
  }

  /**
   * Generate a performance report
   */
  generateReport(): string {
    const journeys = new Map<string, number[]>();

    this._metrics.forEach((metric) => {
      const journey = metric.name;

      if (!journeys.has(journey)) {
        journeys.set(journey, []);
      }

      journeys.get(journey)!.push(metric.duration);
    });

    let report = '=== Performance Report ===\n\n';

    journeys.forEach((durations, journey) => {
      const stats = this.calculatePercentiles(durations);
      const avg = durations.reduce((a, b) => a + b, 0) / durations.length;

      report += `${journey}:\n`;
      report += `  Count: ${durations.length}\n`;
      report += `  Average: ${avg.toFixed(2)}ms\n`;
      report += `  p50: ${stats.p50.toFixed(2)}ms\n`;
      report += `  p75: ${stats.p75.toFixed(2)}ms\n`;
      report += `  p95: ${stats.p95.toFixed(2)}ms\n`;
      report += `  p99: ${stats.p99.toFixed(2)}ms\n\n`;
    });

    return report;
  }
}

// Export singleton instance
export const performanceMonitor = new PerformanceMonitor();

// Core journey measurement helpers
export const journeys = {
  /**
   * App Launch Journey: Fresh page load to interactive
   */
  appLaunch: {
    start: () => performanceMonitor.markStart('app-launch'),
    htmlParsed: () => performanceMonitor.markStart('app-launch', 'html-parsed'),
    reactHydrated: () => performanceMonitor.markStart('app-launch', 'react-hydrated'),
    interactive: (metadata?: Record<string, any>) => performanceMonitor.markEnd('app-launch', 'interactive', metadata),
  },

  /**
   * Composer Journey: From mount to typeable
   */
  composer: {
    start: () => performanceMonitor.markStart('composer'),
    mounted: () => performanceMonitor.markStart('composer', 'mounted'),
    typeable: (metadata?: Record<string, any>) => performanceMonitor.markEnd('composer', 'typeable', metadata),
  },

  /**
   * Message Send Journey: From send click to first token
   */
  messageSend: {
    start: (messageId: string) => performanceMonitor.markStart(`message-send-${messageId}`),
    requestSent: (messageId: string) => performanceMonitor.markStart(`message-send-${messageId}`, 'request-sent'),
    firstToken: (messageId: string, metadata?: Record<string, any>) =>
      performanceMonitor.markEnd(`message-send-${messageId}`, 'first-token', metadata),
  },

  /**
   * Project Load Journey: From navigation to visible
   */
  projectLoad: {
    start: (projectId: string) => performanceMonitor.markStart(`project-load-${projectId}`),
    dataLoaded: (projectId: string) => performanceMonitor.markStart(`project-load-${projectId}`, 'data-loaded'),
    rendered: (projectId: string, metadata?: Record<string, any>) =>
      performanceMonitor.markEnd(`project-load-${projectId}`, 'rendered', metadata),
  },

  /**
   * WebContainer Boot Journey
   */
  webContainer: {
    start: () => performanceMonitor.markStart('webcontainer-boot'),
    apiLoaded: () => performanceMonitor.markStart('webcontainer-boot', 'api-loaded'),
    booted: (metadata?: Record<string, any>) => performanceMonitor.markEnd('webcontainer-boot', 'booted', metadata),
  },

  /**
   * Code Preview Journey: From code change to visible preview
   */
  preview: {
    start: (fileId: string) => performanceMonitor.markStart(`preview-${fileId}`),
    compiled: (fileId: string) => performanceMonitor.markStart(`preview-${fileId}`, 'compiled'),
    rendered: (fileId: string, metadata?: Record<string, any>) =>
      performanceMonitor.markEnd(`preview-${fileId}`, 'rendered', metadata),
  },
};

let webVitalsObserversStarted = false;
let longTaskObserverStarted = false;

// Web Vitals integration
export function observeWebVitals() {
  if (typeof window === 'undefined' || !performanceMonitor.isEnabled() || webVitalsObserversStarted) {
    return;
  }

  webVitalsObserversStarted = true;

  void import('web-vitals')
    .then(({ onCLS, onFCP, onINP, onLCP, onTTFB }) => {
      onCLS((metric) => performanceMonitor.recordMetric('web-vitals:cls', metric.value, { rating: metric.rating }));
      onFCP((metric) => performanceMonitor.recordMetric('web-vitals:fcp', metric.value, { rating: metric.rating }));
      onINP((metric) => performanceMonitor.recordMetric('web-vitals:inp', metric.value, { rating: metric.rating }));
      onLCP((metric) => performanceMonitor.recordMetric('web-vitals:lcp', metric.value, { rating: metric.rating }));
      onTTFB((metric) => performanceMonitor.recordMetric('web-vitals:ttfb', metric.value, { rating: metric.rating }));
    })
    .catch((error) => {
      webVitalsObserversStarted = false;
      console.warn('Failed to load web-vitals:', error);
    });

  if (
    !longTaskObserverStarted &&
    typeof PerformanceObserver !== 'undefined' &&
    PerformanceObserver.supportedEntryTypes?.includes('longtask')
  ) {
    longTaskObserverStarted = true;

    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        performanceMonitor.recordMetric('main-thread:long-task', entry.duration, {
          startTime: entry.startTime,
          attribution: (entry as PerformanceEntry & { attribution?: Array<{ name?: string }> }).attribution?.map(
            (item) => item.name,
          ),
        });
      }
    });

    observer.observe({ type: 'longtask', buffered: true });
  }
}

// Export for debugging in console
if (typeof window !== 'undefined') {
  (window as any).__BOLT_PERFORMANCE__ = {
    monitor: performanceMonitor,
    journeys,
    report: () => console.log(performanceMonitor.generateReport()),
  };

  /*
   * In development, profiling is on by default. In production, enable it with
   * `?profile=1` or the dashboard shortcut to avoid collecting routine data.
   */
  if (new URLSearchParams(window.location.search).get('profile') === '1') {
    performanceMonitor.setEnabled(true);
  }
}
