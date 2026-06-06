"use client";

import { useState, useEffect } from "react";
import { useStaking, StakeInfo } from "./hooks/useStaking";
import { Toast } from "./components/Toast";
import { 
  Coins, 
  Wallet, 
  Lock, 
  Unlock, 
  ShieldAlert, 
  History, 
  Plus, 
  ArrowRightLeft, 
  Settings, 
  AlertTriangle, 
  Play, 
  Pause, 
  Flame, 
  TrendingUp, 
  ExternalLink,
  Info,
  Copy,
  CheckCircle2,
  RefreshCw
} from "lucide-react";
import { ethers } from "ethers";

const LOCAL_CHAIN_ID = "0x7a69";

// Countdown timer helper component for each stake card
function LockTimer({ startTime, onUnlock }: { startTime: number; onUnlock: () => void }) {
  const [timeLeft, setTimeLeft] = useState<string>("");
  const [isLocked, setIsLocked] = useState<boolean>(true);

  useEffect(() => {
    const calculateTime = () => {
      const lockDuration = 24 * 60 * 60; // 1 day in seconds
      const unlockTime = startTime + lockDuration;
      const now = Math.floor(Date.now() / 1000);
      const diff = unlockTime - now;

      if (diff <= 0) {
        setTimeLeft("Unlocked");
        setIsLocked(false);
        onUnlock();
      } else {
        const hrs = Math.floor(diff / 3600);
        const mins = Math.floor((diff % 3600) / 60);
        const secs = diff % 60;
        setTimeLeft(`${hrs}h ${mins}m ${secs}s`);
        setIsLocked(true);
      }
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [startTime, onUnlock]);

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold tracking-wide uppercase transition-all ${
      isLocked 
        ? "bg-rose-50 text-rose-700 border border-rose-200 shadow-sm" 
        : "bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm"
    }`}>
      {isLocked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
      {timeLeft}
    </span>
  );
}

export default function Home() {
  const {
    contractAddress,
    setContractAddress,
    account,
    chainId,
    isCorrectNetwork,
    switchNetwork,
    connectWallet,
    disconnectWallet,
    
    // contract state
    totalStaked,
    totalRewardsPaid,
    totalPenaltiesCollected,
    contractBalance,
    paused,
    emergencyMode,
    isOwner,
    
    // user state
    userStakes,
    userStakedTotal,
    userClaimableTotal,
    
    // tx state
    txState,
    txError,
    txHash,
    setTxState,
    
    // actions
    stakeETH,
    claimReward,
    unstake,
    emergencyWithdraw,
    setContractPaused,
    setContractEmergencyMode,
    fundTreasury,
    refreshData,
    txHistory
  } = useStaking();

  const [stakeAmount, setStakeAmount] = useState<string>("");
  const [showConfig, setShowConfig] = useState<boolean>(false);
  const [configInput, setConfigInput] = useState<string>(contractAddress);
  const [fundAmount, setFundAmount] = useState<string>("");
  const [copied, setCopied] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Hydration guard state
  const [mounted, setMounted] = useState<boolean>(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Transfer states
  const [transferTarget, setTransferTarget] = useState<{ [tokenId: number]: string }>({});
  const [transferringToken, setTransferringToken] = useState<number | null>(null);

  const handleStakeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!stakeAmount || isNaN(Number(stakeAmount)) || Number(stakeAmount) <= 0) return;
    stakeETH(stakeAmount);
    setStakeAmount("");
  };

  const handleFundSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fundAmount || isNaN(Number(fundAmount)) || Number(fundAmount) <= 0) return;
    fundTreasury(fundAmount);
    setFundAmount("");
  };

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await refreshData();
    setTimeout(() => setRefreshing(false), 800);
  };

  const handleTransfer = async (tokenId: number) => {
    const target = transferTarget[tokenId];
    if (!target || !ethers.isAddress(target)) {
      alert("Please enter a valid Ethereum address.");
      return;
    }
    
    setTxState("signature");
    try {
      const provider = new ethers.BrowserProvider(window.ethereum!);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(contractAddress, [
        "function transferFrom(address from, address to, uint256 tokenId)"
      ], signer);
      
      const tx = await contract.transferFrom(account, target, tokenId);
      setTxState("pending");
      await tx.wait();
      setTxState("confirmed");
      alert(`Staking Position NFT #${tokenId} transferred successfully to ${target}!`);
      
      setTransferTarget(prev => {
        const next = { ...prev };
        delete next[tokenId];
        return next;
      });
      setTransferringToken(null);
      refreshData();
    } catch (err: any) {
      console.error(err);
      setTxState("error");
      alert("Transfer failed: " + (err.message || err.toString()));
    }
  };

  const copyAddress = () => {
    if (!account) return;
    navigator.clipboard.writeText(account);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const saveConfig = () => {
    if (ethers.isAddress(configInput)) {
      setContractAddress(configInput);
      setShowConfig(false);
      alert("Contract address updated successfully!");
    } else {
      alert("Invalid Ethereum address.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-200 text-slate-800 font-sans selection:bg-emerald-600 selection:text-white antialiased relative">
      
      {/* Top Banner Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          
          {/* Logo Brand */}
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-emerald-600 flex items-center justify-center shadow-md">
              <Coins className="h-6 w-6 text-white font-bold" />
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-xl tracking-tight text-slate-900">
                EtherStaker NFT
              </span>
              <span className="text-[10px] font-mono tracking-widest uppercase text-emerald-700 font-bold">
                Dynamic Staking Pool
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Network Badge */}
            {mounted && account && (
              <span className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-2xl text-[11px] font-mono tracking-wide ${
                isCorrectNetwork
                  ? chainId === LOCAL_CHAIN_ID
                    ? "bg-blue-50 text-blue-700 border border-blue-200"
                    : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-rose-50 text-rose-700 border border-rose-200 animate-pulse"
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full ${
                  isCorrectNetwork 
                    ? chainId === LOCAL_CHAIN_ID ? "bg-blue-500" : "bg-emerald-500" 
                    : "bg-rose-500"
                }`} />
                {isCorrectNetwork 
                  ? chainId === LOCAL_CHAIN_ID ? "Localhost (31337)" : "Sepolia Network" 
                  : "Wrong Network"}
              </span>
            )}

            {/* Target Settings */}
            <button
              onClick={() => setShowConfig(!showConfig)}
              className="p-2.5 rounded-2xl bg-white border border-slate-200 hover:border-slate-350 hover:bg-slate-50 text-slate-500 hover:text-slate-700 transition-all cursor-pointer"
              title="Target Contract Address"
            >
              <Settings className={`h-4.5 w-4.5 ${showConfig ? "rotate-45" : ""} transition-transform duration-300`} />
            </button>

            {/* Wallet Connector */}
            {mounted && account ? (
              <div className="flex items-center gap-2 bg-white border border-slate-250 pl-3.5 pr-2 py-1.5 rounded-2xl shadow-sm">
                <div className="h-5 w-5 rounded-full bg-emerald-600 shrink-0" />
                <span className="font-mono text-xs text-slate-700 font-bold">
                  {account.substring(0, 6)}...{account.substring(account.length - 4)}
                </span>
                
                {/* Copy Wallet */}
                <button
                  onClick={copyAddress}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                  title="Copy Wallet Address"
                >
                  {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
                
                <div className="w-[1px] h-3.5 bg-slate-200 mx-1" />
                
                <button
                  onClick={disconnectWallet}
                  className="text-rose-600 hover:text-rose-700 text-xs font-semibold px-1 py-0.5 hover:underline"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                onClick={connectWallet}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold px-4.5 py-2.5 rounded-2xl shadow-sm transition-all active:scale-95 text-xs tracking-wider uppercase cursor-pointer"
              >
                <Wallet className="h-4 w-4" />
                Connect Wallet
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Wrong Network Banner */}
      {mounted && account && !isCorrectNetwork && (
        <div className="bg-rose-50 border-b border-rose-200">
          <div className="max-w-7xl mx-auto px-4 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
            <div className="flex items-center gap-2 text-rose-800 text-xs sm:text-sm">
              <ShieldAlert className="h-5 w-5 text-rose-600 shrink-0" />
              <span><strong>Wrong Network Connection!</strong> Swap to <strong>Sepolia Test Network</strong> or <strong>Localhost</strong> inside your provider.</span>
            </div>
            <button
              onClick={switchNetwork}
              className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-4 py-2 rounded-xl text-[11px] tracking-widest uppercase transition-colors shrink-0 cursor-pointer shadow-sm"
            >
              Switch Network
            </button>
          </div>
        </div>
      )}

      {/* Paused Banner */}
      {mounted && paused && (
        <div className="bg-amber-50 border-b border-amber-200">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-center gap-2 text-amber-800 text-xs sm:text-sm text-center">
            <AlertTriangle className="h-4.5 w-4.5 text-amber-600 shrink-0" />
            <span><strong>System Paused:</strong> Contract actions (deposits, claims, unstakes) are temporarily disabled.</span>
          </div>
        </div>
      )}

      {/* Emergency Mode Banner */}
      {mounted && emergencyMode && (
        <div className="bg-rose-50 border-b border-rose-200">
          <div className="max-w-7xl mx-auto px-4 py-3.5 flex items-center justify-center gap-2 text-rose-800 text-xs sm:text-sm text-center">
            <Flame className="h-4.5 w-4.5 text-rose-600 shrink-0" />
            <span><strong>EMERGENCY WITHDRAWAL ACTIVE:</strong> Immediately recover your principal without early unstake penalty.</span>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        
        {/* Target Address Settings */}
        {showConfig && (
          <div className="mb-8 p-6 bg-white border border-slate-200 rounded-3xl shadow-sm animate-in fade-in duration-200">
            <h3 className="text-base font-bold mb-1.5 flex items-center gap-2 text-slate-800">
              <Settings className="h-4.5 w-4.5 text-slate-400" />
              Smart Contract Target Setup
            </h3>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              Target a custom deployed contract on Sepolia or local node.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={configInput}
                onChange={(e) => setConfigInput(e.target.value)}
                placeholder="0x..."
                className="flex-1 bg-slate-50 border border-slate-200 focus:border-slate-300 px-4 py-2.5 rounded-xl font-mono text-sm text-slate-800 focus:outline-none transition-colors"
              />
              <div className="flex gap-2">
                <button
                  onClick={saveConfig}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-xl text-xs tracking-wider uppercase transition-colors cursor-pointer"
                >
                  Save Address
                </button>
                <button
                  onClick={() => setConfigInput("0x5FbDB2315678afecb367f032d93F642f64180aa3")}
                  className="border border-slate-200 hover:border-slate-300 hover:bg-slate-50 px-3.5 py-2.5 rounded-xl text-[11px] font-bold tracking-wider uppercase text-slate-500 transition-colors"
                >
                  Reset Default
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Core metrics dashboard */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
          <div className="p-6 bg-white border border-slate-200 rounded-3xl shadow-sm hover:shadow-md transition-all duration-300">
            <span className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider block">Total Staking Pool</span>
            <span className="text-3xl font-black mt-2 block tracking-tight text-slate-900">
              {totalStaked} <span className="text-base font-bold text-slate-400">ETH</span>
            </span>
            <div className="mt-2 text-[10px] text-slate-500 font-mono">
              Contract Balance: {Number(contractBalance).toFixed(4)} ETH
            </div>
          </div>

          <div className="p-6 bg-white border border-slate-200 rounded-3xl shadow-sm hover:shadow-md transition-all duration-300">
            <span className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider block">Rewards Disbursed</span>
            <span className="text-3xl font-black mt-2 block tracking-tight text-emerald-600">
              {totalRewardsPaid} <span className="text-base font-bold text-slate-400">ETH</span>
            </span>
            <div className="mt-2 text-[10px] text-slate-500 font-mono">From treasury funds</div>
          </div>

          <div className="p-6 bg-white border border-slate-200 rounded-3xl shadow-sm hover:shadow-md transition-all duration-300">
            <span className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider block">Early Penalty Fines</span>
            <span className="text-3xl font-black mt-2 block tracking-tight text-rose-600">
              {totalPenaltiesCollected} <span className="text-base font-bold text-slate-400">ETH</span>
            </span>
            <div className="mt-2 text-[10px] text-slate-500 font-mono">5% early unstake fee</div>
          </div>

          <div className="p-6 bg-emerald-50 border border-emerald-100 rounded-3xl shadow-sm hover:shadow-md transition-all duration-300">
            <span className="text-[10px] text-emerald-700 font-extrabold uppercase tracking-wider block flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" />
              Dynamic Reward Rate
            </span>
            <span className="text-3xl font-black mt-2 block tracking-tight text-emerald-700">
              20% <span className="text-base font-bold text-emerald-600/70">/ 5 Days</span>
            </span>
            <div className="mt-2 text-[10px] text-emerald-700 font-mono font-semibold">~4.00% Daily rate</div>
          </div>
        </section>

        {/* Layout Grid */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Side Controls */}
          <div className="lg:col-span-1 flex flex-col gap-6">
            
            {/* Deposit Form */}
            <div className="p-6 bg-white border border-slate-200 rounded-3xl shadow-sm">
              <h2 className="text-lg font-bold mb-1 text-slate-900">
                Deposit ETH
              </h2>
              <p className="text-xs text-slate-500 mb-5 leading-relaxed">
                Stake your native ETH. You will be minted a dynamic NFT ticket representing your principal and rewards.
              </p>
              
              <form onSubmit={handleStakeSubmit} className="space-y-4">
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-xs text-slate-500 font-bold uppercase tracking-wider">Deposit Amount</label>
                    <span className="text-[10px] font-mono text-slate-400">Min: 0.0001 ETH</span>
                  </div>
                  <div className="relative group">
                    <input
                      type="number"
                      step="any"
                      min="0.0001"
                      required
                      value={stakeAmount}
                      onChange={(e) => setStakeAmount(e.target.value)}
                      placeholder="0.00"
                      disabled={!mounted || !account || !isCorrectNetwork || paused}
                      className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-600 focus:bg-white px-4 py-3.5 rounded-2xl text-xl font-bold text-slate-800 placeholder-slate-400 focus:outline-none transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    />
                    <span className="absolute right-4 top-4 font-black text-sm text-slate-450">ETH</span>
                  </div>
                </div>

                {/* Quick select grid */}
                <div className="grid grid-cols-4 gap-2">
                  {["0.1", "0.5", "1.0", "5.0"].map((val) => (
                    <button
                      key={val}
                      type="button"
                      disabled={!mounted || !account || !isCorrectNetwork || paused}
                      onClick={() => setStakeAmount(val)}
                      className="py-2 text-xs font-bold rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-slate-800 transition-all disabled:opacity-40 cursor-pointer"
                    >
                      {val}
                    </button>
                  ))}
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-150 text-xs text-slate-500 leading-relaxed flex items-start gap-2.5">
                  <Info className="h-4.5 w-4.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Staking yields **20% every 5 days**. Withdrawing within the **24-hour lock period** incurs a **5% penalty** on your principal.</span>
                </div>

                <button
                  type="submit"
                  disabled={!mounted || !account || !isCorrectNetwork || paused || !stakeAmount}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-100 text-white disabled:text-slate-400 font-extrabold py-4 rounded-2xl transition-all active:scale-98 text-xs tracking-widest uppercase shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                >
                  <Plus className="h-4 w-4" />
                  Deposit & Mint NFT
                </button>
              </form>
            </div>

            {/* Owner Management */}
            {mounted && account && isOwner && (
              <div className="p-6 bg-white border border-slate-200 rounded-3xl shadow-sm">
                <h2 className="text-sm font-black tracking-wider uppercase mb-4 flex items-center gap-2 text-slate-800">
                  <ShieldAlert className="h-4.5 w-4.5 text-slate-500" />
                  Administration
                </h2>

                <div className="space-y-4">
                  {/* Pause / Unpause Controls */}
                  <div>
                    <span className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider block mb-2">Pause Pool Contract</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setContractPaused(true)}
                        disabled={paused}
                        className="flex-1 bg-white border border-slate-200 hover:border-amber-300 hover:bg-amber-50 text-amber-700 disabled:opacity-45 py-2.5 rounded-xl text-[10px] font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                      >
                        <Pause className="h-4 w-4" />
                        Pause
                      </button>
                      <button
                        onClick={() => setContractPaused(false)}
                        disabled={!paused}
                        className="flex-1 bg-white border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 text-emerald-700 disabled:opacity-45 py-2.5 rounded-xl text-[10px] font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                      >
                        <Play className="h-4 w-4" />
                        Unpause
                      </button>
                    </div>
                  </div>

                  {/* Emergency Mode Control */}
                  <div>
                    <span className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider block mb-2">Emergency Override</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setContractEmergencyMode(true)}
                        disabled={emergencyMode}
                        className="flex-1 bg-white border border-rose-250 hover:border-rose-400 hover:bg-rose-50 text-rose-700 disabled:opacity-45 py-2.5 rounded-xl text-[10px] font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                      >
                        <Flame className="h-4 w-4" />
                        Activate
                      </button>
                      <button
                        onClick={() => setContractEmergencyMode(false)}
                        disabled={!emergencyMode}
                        className="flex-1 bg-white border border-slate-200 hover:border-slate-350 hover:bg-slate-50 text-slate-500 disabled:opacity-45 py-2.5 rounded-xl text-[10px] font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                      >
                        Deactivate
                      </button>
                    </div>
                  </div>

                  {/* Treasury Funding */}
                  <div className="pt-4 border-t border-slate-200">
                    <span className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider block mb-2">Fund Rewards Pool</span>
                    <form onSubmit={handleFundSubmit} className="flex gap-2">
                      <input
                        type="number"
                        step="any"
                        required
                        value={fundAmount}
                        onChange={(e) => setFundAmount(e.target.value)}
                        placeholder="0.0"
                        className="flex-1 bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl text-sm font-semibold focus:outline-none focus:bg-white"
                      />
                      <button
                        type="submit"
                        disabled={!fundAmount}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-xl text-[10px] tracking-wider uppercase transition-all cursor-pointer"
                      >
                        Fund
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* User Portfolio & NFT Grid */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* User Portfolio metrics */}
            {mounted && account && (
              <div className="p-6 bg-white border border-slate-200 rounded-3xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-5 shadow-sm">
                <div>
                  <h3 className="text-slate-500 text-[10px] font-extrabold uppercase tracking-wider">Your Staking Balance</h3>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-3xl font-black text-slate-900 tracking-tight">{userStakedTotal} ETH</span>
                    <span className="text-xs text-slate-400 font-bold">staked across {userStakes.length} tickets</span>
                  </div>
                </div>
                
                <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4.5 flex flex-col items-start min-w-[170px] shadow-inner">
                  <span className="text-[10px] font-black tracking-wider text-emerald-700 uppercase">Unclaimed Yield</span>
                  <span className="text-2xl font-bold mt-1 text-emerald-750 tracking-tight font-mono animate-pulse">{Number(userClaimableTotal).toFixed(6)} ETH</span>
                  <span className="text-[9px] text-emerald-650 mt-1 font-semibold">20% yield rate accruing</span>
                </div>
              </div>
            )}

            {/* Staking NFT tickets grid */}
            <div>
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-black text-slate-950 flex items-center gap-2">
                  Active Staking Tickets
                </h2>
                
                {mounted && account && (
                  <button 
                    onClick={handleManualRefresh}
                    disabled={refreshing}
                    className="text-xs font-bold text-slate-500 hover:text-emerald-700 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin text-emerald-600" : ""}`} />
                    Refresh Data
                  </button>
                )}
              </div>

              {!mounted || !account ? (
                <div className="p-14 border border-dashed border-slate-200 rounded-3xl text-center bg-white shadow-sm">
                  <div className="h-12 w-12 rounded-2xl bg-slate-50 border border-slate-150 flex items-center justify-center mx-auto mb-4">
                    <Wallet className="h-5.5 w-5.5 text-slate-400" />
                  </div>
                  <h3 className="font-extrabold text-slate-700 mb-1 text-sm">Wallet Not Connected</h3>
                  <p className="text-xs text-slate-505 max-w-xs mx-auto mb-5">Please connect an Ethereum wallet to query and manage your stakes.</p>
                  <button
                    onClick={connectWallet}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-2xl text-[11px] tracking-wider uppercase transition-all shadow-sm active:scale-95 cursor-pointer"
                  >
                    Connect Wallet
                  </button>
                </div>
              ) : userStakes.length === 0 ? (
                <div className="p-14 border border-dashed border-slate-200 rounded-3xl text-center bg-white shadow-sm">
                  <div className="h-12 w-12 rounded-2xl bg-slate-50 border border-slate-150 flex items-center justify-center mx-auto mb-4">
                    <Coins className="h-5.5 w-5.5 text-slate-400" />
                  </div>
                  <h3 className="font-extrabold text-slate-500 mb-1.5 text-sm">No Active Stakes</h3>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">Deposit ETH in the left panel to mint your first dynamic yield NFT stake.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {userStakes.map((s) => (
                    <div 
                      key={s.tokenId} 
                      className="bg-white border border-slate-200 hover:border-slate-300 rounded-3xl p-5 flex flex-col gap-4 relative transition-all duration-300 hover:shadow-md"
                    >
                      {/* Ticket Art Container */}
                      <div className="aspect-square w-full rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 relative shadow-inner">
                        {s.image ? (
                          <img src={s.image} alt={`Staking Ticket #${s.tokenId}`} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
                            <Coins className="h-10 w-10 animate-pulse text-slate-350" />
                            <span className="text-[10px] mt-2 font-mono">Generating NFT visuals...</span>
                          </div>
                        )}
                        
                        {/* Floating Ticket ID Tag */}
                        <div className="absolute top-3 left-3 px-3 py-1 rounded-xl bg-white/90 border border-slate-200 shadow-sm">
                          <span className="font-mono text-[10px] font-black text-slate-800">TICKET #{s.tokenId}</span>
                        </div>
                      </div>

                      {/* Info & Details */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Position Status</span>
                          <LockTimer 
                            startTime={s.startTime} 
                            onUnlock={() => {}} 
                          />
                        </div>

                        <div className="text-[10px] text-slate-450 font-mono flex justify-between">
                          <span>Staked At:</span>
                          <span>
                            {new Date(s.startTime * 1000).toLocaleString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: true
                            })}
                          </span>
                        </div>

                        {/* Principal & yield grid */}
                        <div className="grid grid-cols-2 gap-3.5 bg-slate-50 p-4 rounded-2xl border border-slate-150 font-mono">
                          <div>
                            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Principal</span>
                            <span className="font-extrabold text-slate-800 mt-1 block text-sm">{s.amount} ETH</span>
                          </div>
                          <div>
                            <span className="text-[9px] text-emerald-700 font-bold uppercase tracking-wider block">Yield Accrued</span>
                            <span className="font-extrabold text-emerald-600 mt-1 block text-sm animate-pulse">{Number(s.pendingReward).toFixed(6)} ETH</span>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex gap-2">
                          <button
                            onClick={() => claimReward(s.tokenId)}
                            disabled={paused || Number(s.pendingReward) <= 0}
                            className="flex-1 bg-white border border-emerald-600 hover:bg-emerald-55/40 disabled:opacity-40 text-emerald-700 disabled:text-slate-400 font-bold py-2.5 rounded-xl text-xs transition-all flex items-center justify-center gap-1 cursor-pointer disabled:cursor-not-allowed"
                          >
                            Claim Yield
                          </button>
                          
                          {emergencyMode ? (
                            <button
                              onClick={() => emergencyWithdraw(s.tokenId)}
                              className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-extrabold py-2.5 rounded-xl text-xs transition-colors flex items-center justify-center gap-1 cursor-pointer shadow-sm"
                            >
                              Emergency Exit
                            </button>
                          ) : (
                            <button
                              onClick={() => unstake(s.tokenId)}
                              disabled={paused}
                              className="flex-1 bg-white border border-rose-600 hover:bg-rose-55/40 disabled:opacity-40 text-rose-600 disabled:text-slate-400 font-bold py-2.5 rounded-xl text-xs transition-all flex items-center justify-center gap-1 cursor-pointer disabled:cursor-not-allowed"
                            >
                              Unstake
                            </button>
                          )}
                        </div>

                        {/* Transfer panel */}
                        <div className="pt-3.5 border-t border-slate-200">
                          {transferringToken === s.tokenId ? (
                            <div className="space-y-2.5 animate-in fade-in duration-200">
                              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Transfer Position Ownership</span>
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  placeholder="0x... recipient address"
                                  value={transferTarget[s.tokenId] || ""}
                                  onChange={(e) => setTransferTarget(prev => ({ ...prev, [s.tokenId]: e.target.value }))}
                                  className="flex-1 bg-slate-50 border border-slate-255 px-3 py-2 rounded-xl text-xs font-mono focus:outline-none"
                                />
                                <button
                                  onClick={() => handleTransfer(s.tokenId)}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-2 rounded-xl text-xs cursor-pointer transition-colors"
                                >
                                  Send
                                </button>
                                <button
                                  onClick={() => setTransferringToken(null)}
                                  className="border border-slate-200 hover:border-slate-350 px-3 py-2 rounded-xl text-[10px] font-bold tracking-wider uppercase text-slate-500 transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => setTransferringToken(s.tokenId)}
                              className="w-full border border-dashed border-slate-200 hover:border-slate-350 text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-slate-800 py-2.5 rounded-2xl flex items-center justify-center gap-1.5 cursor-pointer transition-all duration-300"
                            >
                              <ArrowRightLeft className="h-3.5 w-3.5" />
                              Transfer Ownership
                            </button>
                          )}
                        </div>

                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* History Panel */}
            <div className="p-6 bg-white border border-slate-200 rounded-3xl shadow-sm">
              <h2 className="text-sm font-black tracking-wider uppercase mb-4 flex items-center gap-2 text-slate-800">
                <History className="h-4.5 w-4.5 text-slate-400" />
                Staking Activity Log
              </h2>
              
              <div className="space-y-2 max-h-52 overflow-y-auto pr-2 custom-scrollbar">
                {txHistory.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No recent transactions logged in this browser context.</p>
                ) : (
                  txHistory.map((h, i) => (
                    <div key={i} className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 border border-slate-100 text-xs">
                      <div>
                        <span className="font-bold text-slate-800">{h.type}</span>
                        {h.amount && <span className="ml-1 text-emerald-700">({h.amount})</span>}
                        {h.tokenId !== undefined && <span className="ml-1 text-blue-600 font-mono">(#{h.tokenId})</span>}
                        <span className="block text-[10px] text-slate-450 mt-1 font-mono">
                          {new Date(h.timestamp * 1000).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: true
                          })}
                        </span>
                      </div>
                      
                      {h.hash && (
                        <a
                          href={`https://sepolia.etherscan.io/tx/${h.hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-slate-400 hover:text-slate-600 p-2 rounded-xl hover:bg-slate-100 transition-colors"
                          title="View on Explorer"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        </section>
      </main>

      {/* Transaction Toast Notification */}
      <Toast 
        state={txState} 
        error={txError} 
        hash={txHash} 
        onClose={() => setTxState("idle")} 
      />
    </div>
  );
}
