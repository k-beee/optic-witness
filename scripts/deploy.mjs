// Deployment script for OpticWitness Intelligent Contract on GenLayer StudioNet

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import "dotenv/config";
import { createClient, createAccount } from "genlayer-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function fail(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

const pk = process.env.ACCOUNT_PRIVATE_KEY;
if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) {
  fail("ACCOUNT_PRIVATE_KEY missing or malformed in .env (expected 0x + 64 hex chars).");
}
const feeWei = BigInt(process.env.FEE_WEI ?? "0");

const studioNetChain = {
  id: 61999,
  name: "GenLayer StudioNet",
  nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://studio.genlayer.com/api"] },
    public: { http: ["https://studio.genlayer.com/api"] },
  },
};

const account = createAccount(pk);
const client = createClient({ chain: studioNetChain, account });

const code = new Uint8Array(readFileSync(path.join(ROOT, "contracts/optic_witness.py")));

console.log("Deploying OpticWitness to GenLayer StudioNet…");
console.log(`  deployer:   ${account.address}`);
console.log(`  fee:        ${feeWei} wei`);

try {
  // If the client requires initialization hook, invoke it
  if (typeof client.initializeConsensusSmartContract === "function") {
    await client.initializeConsensusSmartContract();
  }

  const txHash = await client.deployContract({ code, args: [feeWei] });
  console.log(`  tx:         ${txHash}`);

  const receipt = await client.waitForTransactionReceipt({
    hash: txHash,
    status: "FINALIZED",
    retries: 250,
  });

  const address =
    receipt?.txDataDecoded?.contractAddress ??
    receipt?.data?.contract_address ??
    null;

  if (!address) {
    fail(
      "Deployment finalized but no contract address found. Receipt: " +
        JSON.stringify(receipt),
    );
  }

  console.log(`\n✓ OpticWitness successfully deployed at: ${address}`);
  console.log(`Next steps:`);
  console.log(`  Update VITE_CONTRACT_ADDRESS=${address} in frontend/.env`);
} catch (e) {
  fail(`Deployment failed: ${e instanceof Error ? e.message : String(e)}`);
}
