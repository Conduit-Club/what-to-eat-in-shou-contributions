/** Clock 端口的默认实现：直接使用系统时间。 */
export class SystemClock {
  constructor({ now = () => new Date().toISOString() } = {}) {
    this.now = now;
  }
}
