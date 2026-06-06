"use client";

import React from "react";
import { Loader2, CheckCircle2, AlertCircle, Wallet, X, ExternalLink } from "lucide-react";
import { TxState } from "../hooks/useStaking";

interface ToastProps {
  state: TxState;
  error: string | null;
  hash: string | null;
  onClose: () => void;
}

export function Toast({ state, error, hash, onClose }: ToastProps) {
  if (state === "idle") return null;

  const getStatusDetails = () => {
    switch (state) {
      case "signature":
        return {
          title: "Waiting for Signature",
          desc: "Please confirm the transaction in your connected wallet.",
          color: "border-amber-500/30 bg-black text-amber-200",
          icon: <Wallet className="h-6 w-6 text-amber-400 animate-pulse" />,
          spinner: false,
        };
      case "pending":
        return {
          title: "Transaction Pending",
          desc: "Processing on the blockchain network. This may take a moment...",
          color: "border-blue-500/30 bg-blue-700 text-blue-100",
          icon: <Loader2 className="h-6 w-6 text-blue-400 animate-spin" />,
          spinner: true,
        };
      case "confirmed":
        return {
          title: "Transaction Confirmed",
          desc: "Your action has been validated successfully on-chain!",
          color: "border-emerald-500/30 bg-gray-800 text-emerald-200",
          icon: <CheckCircle2 className="h-6 w-6 text-emerald-400" />,
          spinner: false,
        };
      case "error":
        return {
          title: "Transaction Failed",
          desc: error || "An unexpected error occurred during execution.",
          color: "border-rose-500/30 bg-red-700 text-rose-100",
          icon: <AlertCircle className="h-6 w-6 text-rose-200" />,
          spinner: false,
        };
      default:
        return null;
    }
  };

  const details = getStatusDetails();
  if (!details) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-md w-full animate-in slide-in-from-bottom-5 duration-300">
      <div className={`backdrop-blur-md border ${details.color} rounded-2xl p-5 shadow-2xl relative overflow-hidden flex items-start gap-4`}>
        {details.spinner && (
          <div className="absolute bottom-0 left-0 h-1 bg-blue-500/50 animate-pulse w-full" />
        )}
        
        <div className="flex-shrink-0 mt-0.5">{details.icon}</div>
        
        <div className="flex-1 min-w-0 pr-6">
          <h4 className="text-sm font-semibold tracking-wide uppercase opacity-90">{details.title}</h4>
          <p className="text-xs mt-1 leading-relaxed opacity-75 break-words">{details.desc}</p>
          
          {hash && (
            <a
              href={`https://sepolia.etherscan.io/tx/${hash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[10px] font-mono mt-3 px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors"
            >
              Tx: {hash.substring(0, 8)}...{hash.substring(hash.length - 8)}
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white/40 hover:text-white/80 transition-colors p-1 rounded-lg hover:bg-white/5"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
