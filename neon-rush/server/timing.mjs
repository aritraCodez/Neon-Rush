export class FixedClock {
  constructor(rate, maxSteps = 5) { this.dt = 1 / rate; this.accumulator = 0; this.maxSteps = maxSteps; this.droppedMs = 0; }
  advance(elapsed, step) {
    this.accumulator += Math.max(0, elapsed);
    const limit = this.dt * this.maxSteps;
    if (this.accumulator > limit) { this.droppedMs += (this.accumulator - limit) * 1000; this.accumulator = limit; }
    let steps = 0;
    while (this.accumulator + 1e-9 >= this.dt) {
      step(this.dt); this.accumulator -= this.dt; steps++;
    }
    return steps;
  }
}
