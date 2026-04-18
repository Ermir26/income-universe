import { Worker, Job } from "bullmq";
import { MockWorker, isMockMode } from "./mock-queue";
import type {
  DiscoveryJobPayload,
  FeasibilityJobPayload,
  BuildJobPayload,
  AgentJobPayload,
  OptimizeJobPayload,
  ScanJobPayload,
} from "./types";

const WORKER_TIMEOUT = 30_000; // 30 seconds

type WorkerHandler<T> = (job: { data: T }) => Promise<void>;

function createWorker<T>(
  name: string,
  concurrency: number,
  handler: WorkerHandler<T>
): Worker | MockWorker {
  if (isMockMode()) {
    return new MockWorker(name, async (data) => {
      await handler({ data: data as T });
    });
  }

  const worker = new Worker(
    name,
    async (job: Job) => {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Job timed out after ${WORKER_TIMEOUT}ms`)), WORKER_TIMEOUT)
      );
      await Promise.race([handler(job as unknown as { data: T }), timeout]);
    },
    {
      connection: { url: process.env.REDIS_URL },
      concurrency,
    }
  );

  worker.on("completed", (job) => {
    console.log(`[${name}] Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[${name}] Job ${job?.id} failed: ${err.message}`);
  });

  return worker;
}

// Placeholder handlers — will be wired to real logic in Sub-project 2
async function handleDiscovery(job: { data: DiscoveryJobPayload }) {
  console.log(`[discovery] Scanning source: ${job.data.source}`);
  // Will call lib/claude/scanner.ts
}

async function handleFeasibility(job: { data: FeasibilityJobPayload }) {
  console.log(`[feasibility] Testing: ${job.data.name}`);
  // Will call lib/claude/feasibility.ts
}

async function handleBuild(job: { data: BuildJobPayload }) {
  console.log(`[build] Building planet: ${job.data.name}`);
  // Will call lib/claude/builder.ts
}

async function handleAgent(job: { data: AgentJobPayload }) {
  console.log(`[agent] Running ${job.data.agentName} on planet ${job.data.planetId}`);
  // Will call lib/claude/agents.ts
}

async function handleOptimize(job: { data: OptimizeJobPayload }) {
  console.log(`[optimize] Running optimization (${job.data.trigger})`);
  // Will call lib/universe/optimizer.ts
}

async function handleScan(job: { data: ScanJobPayload }) {
  console.log(`[scan] Scanning ${job.data.sources.length} sources (${job.data.trigger})`);
  // Will dispatch individual discovery jobs per source
}

export const discoveryWorker = createWorker<DiscoveryJobPayload>("discovery", 1, handleDiscovery);
export const feasibilityWorker = createWorker<FeasibilityJobPayload>("feasibility", 3, handleFeasibility);
export const buildWorker = createWorker<BuildJobPayload>("build", 2, handleBuild);
export const agentWorker = createWorker<AgentJobPayload>("agent", 5, handleAgent);
export const optimizeWorker = createWorker<OptimizeJobPayload>("optimize", 1, handleOptimize);
export const scanWorker = createWorker<ScanJobPayload>("scan", 1, handleScan);
