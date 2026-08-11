import { TransactionStatus, ExecutionResult } from "genlayer-js/types";
import type { GenLayerClient, TransactionHash } from "genlayer-js/types";
import { getReadClient } from "./genlayer";
import { CONTRACT_ADDRESS } from "../config";
import { parseExceptionMessage } from "./format";

export interface WitnessRecord {
  id: string;
  requester: string;
  url: string;
  question: string;
  verdict: boolean;
  extracted_text: string;
  confidence_score: "high" | "medium" | "low" | string;
  notes: string;
  screenshot_hash: string;
  screenshot_b64: string;
  timestamp: string;
  completed: boolean;
}

function getContractAddr(): `0x${string}` {
  if (!CONTRACT_ADDRESS) throw new Error("VITE_CONTRACT_ADDRESS is not set");
  return CONTRACT_ADDRESS;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function retryOnRateLimit<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
      const isThrottled =
        msg.includes("rate limit") ||
        msg.includes("exceeds defined limit") ||
        msg.includes("429");
      if (!isThrottled || i === attempts - 1) throw e;
      await wait(1000 * (i + 1) + Math.random() * 500);
    }
  }
  throw lastError;
}

async function callReadMethod<T>(functionName: string, args: unknown[]): Promise<T> {
  return retryOnRateLimit(() =>
    getReadClient().readContract({
      address: getContractAddr(),
      functionName,
      args: args as never,
    }) as Promise<T>,
  );
}

// --- Contract Read APIs -----------------------------------------------------
export async function readAttestationFee(): Promise<bigint> {
  return BigInt(await callReadMethod<string>("get_attestation_fee", []));
}

export async function readTotalNotarizations(): Promise<number> {
  return Number(await callReadMethod<string>("get_total_notarizations", []));
}

export async function readRecentNotarizations(limit = 25): Promise<WitnessRecord[]> {
  const result = await callReadMethod<{ total: string; records: WitnessRecord[] }>(
    "get_recent_records",
    [limit],
  );
  return result.records ?? [];
}

export async function readNotarizationsByRequester(requesterAddress: string): Promise<WitnessRecord[]> {
  const result = await callReadMethod<{ requester: string; records: WitnessRecord[] }>(
    "get_records_by_requester",
    [requesterAddress],
  );
  return result.records ?? [];
}

export async function readNotarizationRecord(id: string | number): Promise<WitnessRecord> {
  return callReadMethod<WitnessRecord>("get_record", [Number(id)]);
}

// --- Contract Write APIs ----------------------------------------------------
export interface NotarizationSubmitResult {
  txHash: string;
  success: boolean;
}

export async function requestAttestationNotarization(
  client: GenLayerClient<never>,
  url: string,
  question: string,
  feeWei: bigint,
  onStatusChange?: (status: "submitting" | "consensus" | "finalized") => void,
): Promise<NotarizationSubmitResult> {
  onStatusChange?.("submitting");
  
  const txHash = (await client.writeContract({
    address: getContractAddr(),
    functionName: "request_attestation",
    args: [url, question],
    value: feeWei,
  })) as unknown as TransactionHash;

  onStatusChange?.("consensus");
  
  const receipt = await client.waitForTransactionReceipt({
    hash: txHash,
    status: TransactionStatus.FINALIZED,
  });

  onStatusChange?.("finalized");
  
  const receiptAny = receipt as {
    txExecutionResultName?: string;
    failureReason?: unknown;
  };
  
  const isFinished = receiptAny.txExecutionResultName === ExecutionResult.FINISHED_WITH_RETURN;

  if (!isFinished) {
    throw new Error(
      parseExceptionMessage(receiptAny.failureReason) ||
        "Consensus failed: Transaction finalized but did not return successfully.",
    );
  }
  
  return { txHash: String(txHash), success: isFinished };
}
