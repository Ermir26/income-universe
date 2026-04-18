// In-memory mock queue for when Redis is unavailable
// Processes jobs synchronously with simulated delay

type JobHandler = (data: unknown) => Promise<void>;

interface MockJob {
  id: string;
  name: string;
  data: unknown;
  status: "waiting" | "active" | "completed" | "failed";
  error?: string;
}

let jobCounter = 0;

export class MockQueue {
  name: string;
  private jobs: MockJob[] = [];

  constructor(name: string) {
    this.name = name;
  }

  async add(jobName: string, data: unknown): Promise<MockJob> {
    const job: MockJob = {
      id: String(++jobCounter),
      name: jobName,
      data,
      status: "waiting",
    };
    this.jobs.push(job);
    console.log(`[MOCK QUEUE: ${this.name}] Job added: ${jobName} (#${job.id})`);
    return job;
  }

  async close(): Promise<void> {
    // no-op
  }
}

export class MockWorker {
  name: string;
  private handler: JobHandler;
  private running = false;

  constructor(
    name: string,
    handler: JobHandler,
    _opts?: Record<string, unknown>
  ) {
    this.name = name;
    this.handler = handler;
    this.running = true;
    console.log(`[MOCK WORKER: ${name}] Started`);
  }

  async close(): Promise<void> {
    this.running = false;
  }

  // Manually process a job (called by mock dispatcher)
  async processJob(data: unknown): Promise<void> {
    if (!this.running) return;
    try {
      await this.handler(data);
      console.log(`[MOCK WORKER: ${this.name}] Job completed`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[MOCK WORKER: ${this.name}] Job failed: ${msg}`);
    }
  }
}

export function isMockMode(): boolean {
  return !process.env.REDIS_URL;
}
