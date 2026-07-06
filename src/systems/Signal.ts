/**
 * Signal — lightweight typed event/callback utility.
 *
 * A minimal publish/subscribe primitive used by the dialogue and quest
 * systems to emit events without pulling in a heavyweight event library.
 * Listeners are simple functions invoked synchronously on emit.
 *
 * Usage:
 *   const s = new Signal<[number, string]>();
 *   s.on((n, str) => console.log(n, str));
 *   s.emit(42, 'hello');
 */

export class Signal<T extends unknown[] = []> {
  private listeners: ((...args: T) => void)[] = [];

  /** Subscribe a listener. Returns this for chaining. */
  on(listener: (...args: T) => void): this {
    this.listeners.push(listener);
    return this;
  }

  /** Subscribe a listener that fires only once. */
  once(listener: (...args: T) => void): this {
    const wrapper: (...args: T) => void = (...args) => {
      this.off(wrapper);
      listener(...args);
    };
    this.listeners.push(wrapper);
    return this;
  }

  /** Unsubscribe a listener. Returns this for chaining. */
  off(listener: (...args: T) => void): this {
    this.listeners = this.listeners.filter((l) => l !== listener);
    return this;
  }

  /** Emit the signal, invoking all listeners synchronously. */
  emit(...args: T): void {
    // Copy the array so listeners can unsubscribe during emit without
    // skipping subsequent listeners.
    const snapshot = [...this.listeners];
    for (const l of snapshot) {
      l(...args);
    }
  }

  /** Remove all listeners. */
  clear(): void {
    this.listeners = [];
  }

  /** Number of subscribed listeners. */
  get count(): number {
    return this.listeners.length;
  }
}