import { createClient } from "genlayer-js";
import type { GenLayerClient } from "genlayer-js/types";

// Custom chain definition for StudioNet
export const studioNet = {
  id: 61999,
  name: "GenLayer StudioNet",
  nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://studio.genlayer.com/api"] },
    public: { http: ["https://studio.genlayer.com/api"] },
  },
  blockExplorers: {
    default: { name: "GenLayer Explorer", url: "https://studio.genlayer.com" },
  },
} as any;

let readClientInstance: GenLayerClient<any> | null = null;

export function getReadClient(): GenLayerClient<any> {
  if (!readClientInstance) {
    readClientInstance = createClient({ chain: studioNet }) as unknown as GenLayerClient<any>;
  }
  return readClientInstance;
}

async function ensureStudioNet(provider: Eip1193Provider): Promise<void> {
  const chainIdHex = `0x${studioNet.id.toString(16)}`;
  let current: string;
  try {
    current = (await provider.request({ method: "eth_chainId" })) as string;
  } catch {
    current = "0x0";
  }
  if (current.toLowerCase() === chainIdHex.toLowerCase()) return;
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainIdHex }],
    });
  } catch (err) {
    const code = (err as { code?: number })?.code ?? 0;
    const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
    if (code === 4902 || msg.includes("unrecognized chain") || msg.includes("add chain")) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: chainIdHex,
            chainName: studioNet.name,
            nativeCurrency: studioNet.nativeCurrency,
            rpcUrls: studioNet.rpcUrls.default.http,
            blockExplorerUrls: studioNet.blockExplorers
              ? [studioNet.blockExplorers.default.url]
              : [],
          },
        ],
      });
    } else {
      throw err;
    }
  }
}

interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
}

export async function getWriteClient(
  address: `0x${string}`,
  provider: unknown,
): Promise<GenLayerClient<any>> {
  const eip = provider as Eip1193Provider;
  await ensureStudioNet(eip);
  const client = createClient({
    chain: studioNet,
    account: address,
    provider: provider as never,
  });
  return client as unknown as GenLayerClient<any>;
}
