export class BackoffStrategy {
  calculateDelay(attempts: number): number {
    return Math.min(5000 * Math.pow(2, attempts), 60000);
  }
}
