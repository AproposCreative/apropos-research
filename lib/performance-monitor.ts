/**
 * Performance Monitor for Apropos AI Pipeline
 * Tracks metrics and performance across all stages
 */

export interface PipelineMetrics {
  stage: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  success: boolean;
  error?: string;
  metadata?: Record<string, any>;
}

export interface PerformanceReport {
  totalDuration: number;
  stages: PipelineMetrics[];
  successRate: number;
  averageStageDuration: number;
  bottlenecks: string[];
}

class PerformanceMonitor {
  private metrics: PipelineMetrics[] = [];
  private currentStage: string | null = null;
  private stageStartTime: number | null = null;

  /**
   * Start monitoring a pipeline stage
   */
  startStage(stage: string, metadata?: Record<string, any>): void {
    if (this.currentStage) {
      this.endStage(false, 'Previous stage not ended');
    }

    this.currentStage = stage;
    this.stageStartTime = Date.now();
    
    console.log(`🚀 Starting stage: ${stage}`, metadata ? `Metadata: ${JSON.stringify(metadata)}` : '');
  }

  /**
   * End monitoring current stage
   */
  endStage(success: boolean = true, error?: string, metadata?: Record<string, any>): void {
    if (!this.currentStage || !this.stageStartTime) {
      console.warn('⚠️ No active stage to end');
      return;
    }

    const endTime = Date.now();
    const duration = endTime - this.stageStartTime;

    const metric: PipelineMetrics = {
      stage: this.currentStage,
      startTime: this.stageStartTime,
      endTime,
      duration,
      success,
      error,
      metadata
    };

    this.metrics.push(metric);

    const status = success ? '✅' : '❌';
    console.log(`${status} Stage completed: ${this.currentStage} (${duration}ms)`, 
      error ? `Error: ${error}` : '', 
      metadata ? `Metadata: ${JSON.stringify(metadata)}` : ''
    );

    this.currentStage = null;
    this.stageStartTime = null;
  }

  /**
   * Add custom metric
   */
  addMetric(stage: string, success: boolean, duration: number, metadata?: Record<string, any>): void {
    const metric: PipelineMetrics = {
      stage,
      startTime: Date.now() - duration,
      endTime: Date.now(),
      duration,
      success,
      metadata
    };

    this.metrics.push(metric);
  }

  /**
   * Generate performance report
   */
  generateReport(): PerformanceReport {
    const totalDuration = this.metrics.reduce((sum, metric) => sum + (metric.duration || 0), 0);
    const successfulStages = this.metrics.filter(m => m.success).length;
    const successRate = this.metrics.length > 0 ? (successfulStages / this.metrics.length) * 100 : 0;
    const averageStageDuration = this.metrics.length > 0 ? totalDuration / this.metrics.length : 0;

    // Identify bottlenecks (stages taking longer than average)
    const bottlenecks = this.metrics
      .filter(m => m.duration && m.duration > averageStageDuration * 1.5)
      .map(m => m.stage);

    return {
      totalDuration,
      stages: [...this.metrics],
      successRate,
      averageStageDuration,
      bottlenecks
    };
  }

  /**
   * Log performance report
   */
  logReport(): void {
    const report = this.generateReport();
    
    console.log('\n📊 PERFORMANCE REPORT');
    console.log('====================');
    console.log(`Total Duration: ${report.totalDuration}ms`);
    console.log(`Success Rate: ${report.successRate.toFixed(1)}%`);
    console.log(`Average Stage Duration: ${report.averageStageDuration.toFixed(1)}ms`);
    
    if (report.bottlenecks.length > 0) {
      console.log(`Bottlenecks: ${report.bottlenecks.join(', ')}`);
    }

    console.log('\nStage Breakdown:');
    report.stages.forEach(stage => {
      const status = stage.success ? '✅' : '❌';
      console.log(`  ${status} ${stage.stage}: ${stage.duration}ms`);
      if (stage.error) {
        console.log(`    Error: ${stage.error}`);
      }
    });
    console.log('====================\n');
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics = [];
    this.currentStage = null;
    this.stageStartTime = null;
  }

  /**
   * Get current metrics
   */
  getMetrics(): PipelineMetrics[] {
    return [...this.metrics];
  }
}

// Export singleton instance
export const performanceMonitor = new PerformanceMonitor();

// Export convenience functions
export const startStage = (stage: string, metadata?: Record<string, any>) => 
  performanceMonitor.startStage(stage, metadata);

export const endStage = (success: boolean = true, error?: string, metadata?: Record<string, any>) => 
  performanceMonitor.endStage(success, error, metadata);

export const addMetric = (stage: string, success: boolean, duration: number, metadata?: Record<string, any>) => 
  performanceMonitor.addMetric(stage, success, duration, metadata);

export const logReport = () => performanceMonitor.logReport();

export const clearMetrics = () => performanceMonitor.clear();

export const getMetrics = () => performanceMonitor.getMetrics();
