"use client";

import { useEffect, useState } from "react";
import { useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import type { Abi } from "viem";

/**
 * Loose shape for a wagmi write-contract call. wagmi's own
 * `writeContract` is generic over the ABI, so `Parameters<...>[0]`
 * collapses `value` to `undefined` for payable calls; this plain
 * shape keeps `value?: bigint` usable and the cast happens once,
 * inside TxButton.
 */
export type WriteArgs = {
  address: `0x${string}`;
  abi: Abi | readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
};

type TxButtonProps = {
  label: string;
  disabled?: boolean;
  title?: string;
  /** Returns the write-contract call arguments. */
  prepare: () => WriteArgs;
  onSuccess?: (hash: `0x${string}`) => void;
  className?: string;
};

/**
 * One button that sends a contract transaction and reports its state.
 * Shows pending / confirming / confirmed / error inline. Never hides
 * the transaction hash: the user always sees what they signed.
 */
export function TxButton({
  label,
  disabled,
  title,
  prepare,
  onSuccess,
  className,
}: TxButtonProps) {
  const { data: hash, error, isPending, writeContract } = useWriteContract();
  const { isLoading: confirming, isSuccess: confirmed } =
    useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (confirmed && hash && onSuccess) onSuccess(hash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmed, hash]);

  const busy = isPending || confirming;

  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        title={title}
        disabled={disabled || busy}
        onClick={() => writeContract(prepare() as never)}
        className={
          className ??
          "rounded-lg bg-electric-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-electric-500 disabled:cursor-not-allowed disabled:opacity-40"
        }
      >
        {busy ? (isPending ? "Waiting for signature…" : "Confirming…") : label}
      </button>
      {hash && (
        <span className="max-w-64 break-all font-mono text-[11px] text-mist">
          tx {hash}
          {confirmed ? ", confirmed" : ""}
        </span>
      )}
      {error && (
        <span className="max-w-64 break-words text-[11px] text-red-400">
          {error.message.split("\n")[0]}
        </span>
      )}
    </span>
  );
}

/** Small countdown / phase label helper. */
export function useNow(intervalMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
