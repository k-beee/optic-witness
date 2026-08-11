// Utility formatting and extraction tools for OpticWitness

export function formatAddress(address?: string, precision = 4): string {
  if (!address) return "—";
  return address.length > 2 + precision * 2
    ? `${address.slice(0, 2 + precision)}…${address.slice(-precision)}`
    : address;
}

export function formatBalance(wei: bigint): string {
  const decimals = 10n ** 18n;
  const whole = wei / decimals;
  const fraction = wei % decimals;
  if (fraction === 0n) return `${whole}`;
  const fractionString = (fraction + decimals).toString().slice(1).replace(/0+$/, "");
  return `${whole}.${fractionString}`;
}

export function formatRelativeTime(isoString: string): string {
  if (!isoString) return "—";
  const parsedTime = Date.parse(isoString);
  if (Number.isNaN(parsedTime)) return isoString;
  const differenceSeconds = Math.floor((Date.now() - parsedTime) / 1000);
  if (differenceSeconds < 60) return `${differenceSeconds}s ago`;
  if (differenceSeconds < 3600) return `${Math.floor(differenceSeconds / 60)}m ago`;
  if (differenceSeconds < 86400) return `${Math.floor(differenceSeconds / 3600)}h ago`;
  return `${Math.floor(differenceSeconds / 86400)}d ago`;
}

export function parseHostname(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function parseExceptionMessage(error: unknown): string {
  if (error == null) return "Unknown system anomaly";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message || "Unknown anomaly";

  if (typeof error === "object") {
    const obj = error as Record<string, unknown>;
    const reasonText = obj.reason;
    if (typeof reasonText === "string" && reasonText.trim()) return reasonText;
    for (const key of ["shortMessage", "message", "details", "data"] as const) {
      const val = obj[key];
      if (typeof val === "string" && val.trim()) return val;
    }
    const causeObj = (obj.cause ?? obj.error) as unknown;
    if (causeObj && causeObj !== error) {
      const innerMessage = parseExceptionMessage(causeObj);
      if (innerMessage && innerMessage !== "Unknown system anomaly") return innerMessage;
    }
    try {
      const stringified = JSON.stringify(error);
      if (stringified && stringified !== "{}") return stringified;
    } catch {
      // not serializable
    }
  }

  try {
    return String(error);
  } catch {
    return "Unknown system anomaly";
  }
}
