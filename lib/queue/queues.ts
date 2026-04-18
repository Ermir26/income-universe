import { Queue } from "bullmq";
import { MockQueue, isMockMode } from "./mock-queue";

const RETRY_CONFIG = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 1000 },
};

function createQueue(name: string): Queue | MockQueue {
  if (isMockMode()) {
    console.log(`QUEUE: Mock mode active for "${name}"`);
    return new MockQueue(name);
  }

  return new Queue(name, {
    connection: { url: process.env.REDIS_URL },
    defaultJobOptions: {
      attempts: RETRY_CONFIG.attempts,
      backoff: RETRY_CONFIG.backoff,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    },
  });
}

export const discoveryQueue = createQueue("discovery");
export const feasibilityQueue = createQueue("feasibility");
export const buildQueue = createQueue("build");
export const agentQueue = createQueue("agent");
export const optimizeQueue = createQueue("optimize");
export const scanQueue = createQueue("scan");
