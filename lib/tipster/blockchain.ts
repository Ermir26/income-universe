// Blockchain Verification Module — Sharkline
// Timestamps pick hashes on Polygon for tamper-proof record keeping.

import { ethers } from "ethers";

const POLYGON_MAINNET_RPC = "https://polygon-rpc.com";
const POLYGON_MUMBAI_RPC = "https://rpc-mumbai.maticvigil.com";

function getConfig() {
  const network = process.env.POLYGON_NETWORK || "mainnet";
  const rpcUrl = process.env.POLYGON_RPC_URL ||
    (network === "mumbai" ? POLYGON_MUMBAI_RPC : POLYGON_MAINNET_RPC);
  const privateKey = process.env.POLYGON_WALLET_PRIVATE_KEY || "";
  const isMainnet = network === "mainnet";
  return { rpcUrl, privateKey, isMainnet, network };
}

// ─── Pick data shape for hashing ───

interface PickHashInput {
  sport: string;
  league: string;
  game: string;
  pick: string;
  odds: string;
  confidence: number;
  tier: string;
  timestamp: string; // ISO string — when the pick was generated
}

/**
 * Create a deterministic keccak256 hash of pick data.
 * The pick data is JSON-stringified with keys sorted for reproducibility.
 */
export function hashPick(pick: PickHashInput): string {
  const ordered = {
    confidence: pick.confidence,
    game: pick.game,
    league: pick.league,
    odds: pick.odds,
    pick: pick.pick,
    sport: pick.sport,
    tier: pick.tier,
    timestamp: pick.timestamp,
  };
  const payload = JSON.stringify(ordered);
  return ethers.keccak256(ethers.toUtf8Bytes(payload));
}

/**
 * Timestamp a pick hash on Polygon by sending a zero-value tx with the hash as calldata.
 * This is the cheapest on-chain timestamping method (~$0.001 per tx).
 */
export async function timestampOnChain(pickHash: string): Promise<{
  txHash: string;
  blockNumber: number;
  timestamp: number;
}> {
  const { rpcUrl, privateKey } = getConfig();

  if (!privateKey) {
    throw new Error("POLYGON_WALLET_PRIVATE_KEY not set");
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);

  // Send zero-value tx to self with pick hash as data
  const tx = await wallet.sendTransaction({
    to: wallet.address,
    value: BigInt(0),
    data: pickHash,
  });

  const receipt = await tx.wait();
  if (!receipt) {
    throw new Error("Transaction receipt is null");
  }

  const block = await provider.getBlock(receipt.blockNumber);

  return {
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    timestamp: block?.timestamp ?? Math.floor(Date.now() / 1000),
  };
}

/**
 * Verify a pick hash on-chain by fetching the tx and comparing data.
 */
export async function verifyOnChain(txHash: string, expectedHash: string): Promise<{
  verified: boolean;
  blockTimestamp: number;
  pickHash: string;
}> {
  const { rpcUrl } = getConfig();
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  const tx = await provider.getTransaction(txHash);
  if (!tx) {
    return { verified: false, blockTimestamp: 0, pickHash: "" };
  }

  const onChainHash = tx.data;
  const block = await provider.getBlock(tx.blockNumber!);

  return {
    verified: onChainHash.toLowerCase() === expectedHash.toLowerCase(),
    blockTimestamp: block?.timestamp ?? 0,
    pickHash: onChainHash,
  };
}

/**
 * Get a PolygonScan URL for a transaction.
 */
export function getPolygonScanUrl(txHash: string): string {
  const { isMainnet } = getConfig();
  const base = isMainnet
    ? "https://polygonscan.com"
    : "https://mumbai.polygonscan.com";
  return `${base}/tx/${txHash}`;
}
