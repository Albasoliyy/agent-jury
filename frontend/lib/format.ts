import { formatEther, keccak256, toHex } from "viem";

export function shortAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function formatBnb(wei: bigint | undefined | null): string {
  if (wei === undefined || wei === null) return "—";
  return `${formatEther(wei)} BNB`;
}

export function formatDate(unixSeconds: number | bigint): string {
  const ms = Number(unixSeconds) * 1000;
  if (!ms || Number.isNaN(ms)) return "—";
  return new Date(ms).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function timeLeft(unixSeconds: number | bigint): string {
  const diff = Number(unixSeconds) * 1000 - Date.now();
  if (diff <= 0) return "expired";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
}

/** keccak256 of a UTF-8 string, as a bytes32 hex string. */
export function hashString(text: string): `0x${string}` {
  return keccak256(toHex(text));
}
