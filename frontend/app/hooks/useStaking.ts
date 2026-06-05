"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ethers, BrowserProvider, Contract, formatEther, parseEther } from "ethers";

declare global {
  interface Window {
    ethereum?: any;
  }
}

// Human-readable ABI for StakingNFT
export const STAKING_ABI = [
  "function nextTokenId() view returns (uint256)",
  "function LOCK_PERIOD() view returns (uint256)",
  "function REWARD_PERIOD() view returns (uint256)",
  "function stakes(uint256) view returns (uint256 amount, uint256 startTime, uint256 claimedRewards, bool redeemed)",
  "function totalStaked() view returns (uint256)",
  "function totalRewardsPaid() view returns (uint256)",
  "function totalPenaltiesCollected() view returns (uint256)",
  "function emergencyMode() view returns (bool)",
  "function paused() view returns (bool)",
  "function owner() view returns (address)",
  "function stake() payable returns (uint256)",
  "function claimReward(uint256 tokenId)",
  "function unstake(uint256 tokenId)",
  "function emergencyWithdraw(uint256 tokenId)",
  "function calculateReward(uint256 tokenId) view returns (uint256)",
  "function getStakeDetailsOfOwner(address owner) view returns ((uint256 tokenId, uint256 amount, uint256 startTime, uint256 claimedRewards, uint256 pendingReward, bool redeemed)[])",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function pause()",
  "function unpause()",
  "function setEmergencyMode(bool active)",
  "function fundTreasury() payable",
  "function withdrawTreasury(uint256 amount)",
  "event StakeCreated(uint256 indexed tokenId, address indexed owner, uint256 amount, uint256 startTime)",
  "event RewardClaimed(uint256 indexed tokenId, address indexed owner, uint256 rewardAmount)",
  "event StakeWithdrawn(uint256 indexed tokenId, address indexed owner, uint256 principalAmount, uint256 rewardAmount, bool penaltyApplied)",
  "event PenaltyApplied(uint256 indexed tokenId, address indexed owner, uint256 penaltyAmount)",
  "event EmergencyModeSet(bool active)"
];

export interface StakeInfo {
  tokenId: number;
  amount: string;
  startTime: number;
  claimedRewards: string;
  pendingReward: string;
  redeemed: boolean;
  image: string; // Base64 SVG image decoded from tokenURI
}

export interface TxHistoryItem {
  type: string;
  amount?: string;
  tokenId?: number;
  hash: string;
  timestamp: number;
}

export type TxState = "idle" | "signature" | "pending" | "confirmed" | "error";

const SEPOLIA_CHAIN_ID = "0xaa36a7"; // 11155111
const LOCAL_CHAIN_ID = "0x7a69"; // 31337

export function useStaking() {
  const [contractAddress, setContractAddress] = useState<string>("0x8C869B926afd26a3CB8F144794cCFcdb13B3aF0F");
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  
  // Contract States
  const [totalStaked, setTotalStaked] = useState<string>("0.0");
  const [totalRewardsPaid, setTotalRewardsPaid] = useState<string>("0.0");
  const [totalPenaltiesCollected, setTotalPenaltiesCollected] = useState<string>("0.0");
  const [contractBalance, setContractBalance] = useState<string>("0.0");
  const [paused, setPaused] = useState<boolean>(false);
  const [emergencyMode, setEmergencyMode] = useState<boolean>(false);
  const [contractOwner, setContractOwner] = useState<string | null>(null);
  
  // User States
  const [userStakes, setUserStakes] = useState<StakeInfo[]>([]);
  const [userStakedTotal, setUserStakedTotal] = useState<string>("0.0");
  const [userClaimableTotal, setUserClaimableTotal] = useState<string>("0.0");
  
  // Transaction States
  const [txState, setTxState] = useState<TxState>("idle");
  const [txError, setTxError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  
  // History State
  const [txHistory, setTxHistory] = useState<TxHistoryItem[]>([]);

  // Ref to prevent stale fetch closure issues
  const contractAddressRef = useRef(contractAddress);
  contractAddressRef.current = contractAddress;

  const isOwner = account && contractOwner ? account.toLowerCase() === contractOwner.toLowerCase() : false;

  // Load history from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("staking_tx_history");
      if (stored) {
        try {
          setTxHistory(JSON.parse(stored));
        } catch (e) {
          console.error("Error parsing tx history", e);
        }
      }
    }
  }, []);

  const addTxToHistory = useCallback((type: string, amount?: string, tokenId?: number, hash: string = "") => {
    const newItem: TxHistoryItem = {
      type,
      amount,
      tokenId,
      hash,
      timestamp: Date.now() / 1000,
    };
    setTxHistory((prev) => {
      const updated = [newItem, ...prev].slice(0, 20); // Keep last 20
      localStorage.setItem("staking_tx_history", JSON.stringify(updated));
      return updated;
    });
  }, []);

  const isCorrectNetwork = useCallback(() => {
    return chainId === SEPOLIA_CHAIN_ID || chainId === LOCAL_CHAIN_ID;
  }, [chainId]);

  // Network swinger
  const switchNetwork = useCallback(async () => {
    if (!window.ethereum) return;
    try {
      // Try switching to Sepolia first
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: SEPOLIA_CHAIN_ID }],
      });
    } catch (switchError: any) {
      // If network is not added, add it
      if (switchError.code === 4902) {
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: SEPOLIA_CHAIN_ID,
                chainName: "Sepolia Test Network",
                nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
                rpcUrls: ["https://ethereum-sepolia-rpc.publicnode.com"],
                blockExplorerUrls: ["https://sepolia.etherscan.io"],
              },
            ],
          });
        } catch (addError) {
          console.error("Failed to add network", addError);
        }
      } else {
        console.error("Failed to switch network", switchError);
      }
    }
  }, []);

  // Fetch all contract/user state
  const refreshData = useCallback(async () => {
    if (!window.ethereum) return;
    
    // We create a temporary provider to fetch read-only data even if not connected
    try {
      const tempProvider = new BrowserProvider(window.ethereum);
      const accounts = await tempProvider.listAccounts();
      const currentAddress = accounts.length > 0 ? accounts[0].address : null;

      // Get current chain ID
      const network = await tempProvider.getNetwork();
      const currentChainId = "0x" + network.chainId.toString(16);
      
      const isCorrect = currentChainId === SEPOLIA_CHAIN_ID || currentChainId === LOCAL_CHAIN_ID;
      
      if (!isCorrect) {
        // Reset state if wrong network
        setUserStakes([]);
        setUserStakedTotal("0.0");
        setUserClaimableTotal("0.0");
        return;
      }

      const contract = new Contract(contractAddressRef.current, STAKING_ABI, tempProvider);
      
      // Global stats
      const [staked, rewards, penalties, isPaused, isEmergency, ownerAddress, balance] = await Promise.all([
        contract.totalStaked().catch(() => 0n),
        contract.totalRewardsPaid().catch(() => 0n),
        contract.totalPenaltiesCollected().catch(() => 0n),
        contract.paused().catch(() => false),
        contract.emergencyMode().catch(() => false),
        contract.owner().catch(() => null),
        tempProvider.getBalance(contractAddressRef.current).catch(() => 0n),
      ]);

      setTotalStaked(formatEther(staked));
      setTotalRewardsPaid(formatEther(rewards));
      setTotalPenaltiesCollected(formatEther(penalties));
      setPaused(isPaused);
      setEmergencyMode(isEmergency);
      setContractOwner(ownerAddress);
      setContractBalance(formatEther(balance));

      if (currentAddress) {
        // Fetch user positions
        const stakesList = await contract.getStakeDetailsOfOwner(currentAddress).catch(() => []);
        
        const formattedStakes: StakeInfo[] = await Promise.all(
          stakesList.map(async (s: any) => {
            let image = "";
            try {
              const uri = await contract.tokenURI(s.tokenId);
              if (uri.startsWith("data:application/json;base64,")) {
                const base64Json = uri.substring("data:application/json;base64,".length);
                const decodedJson = atob(base64Json);
                const parsed = JSON.parse(decodedJson);
                image = parsed.image; // This contains the data:image/svg+xml;base64,... URI
              }
            } catch (e) {
              console.error("Error decoding tokenURI", e);
            }

            return {
              tokenId: Number(s.tokenId),
              amount: formatEther(s.amount),
              startTime: Number(s.startTime),
              claimedRewards: formatEther(s.claimedRewards),
              pendingReward: formatEther(s.pendingReward),
              redeemed: s.redeemed,
              image,
            };
          })
        );

        setUserStakes(formattedStakes);

        // Sum user's total staked and claimable
        let userStakedSum = 0n;
        let userClaimableSum = 0n;
        stakesList.forEach((s: any) => {
          userStakedSum += s.amount;
          userClaimableSum += s.pendingReward;
        });

        setUserStakedTotal(formatEther(userStakedSum));
        setUserClaimableTotal(formatEther(userClaimableSum));
      } else {
        setUserStakes([]);
        setUserStakedTotal("0.0");
        setUserClaimableTotal("0.0");
      }
    } catch (error) {
      console.error("Error refreshing contract data", error);
    }
  }, []);

  // Handle transaction flow wrapped in error boundaries
  const handleTransaction = useCallback(async (txPromise: () => Promise<any>, successCallback: (receipt: any) => void, actionType: string, amount?: string, tokenId?: number) => {
    if (!window.ethereum) return;
    
    setTxState("signature");
    setTxError(null);
    setTxHash(null);
    
    try {
      const tempProvider = new BrowserProvider(window.ethereum);
      const signer = await tempProvider.getSigner();
      
      const tx = await txPromise();
      
      setTxState("pending");
      setTxHash(tx.hash);
      
      const receipt = await tx.wait();
      
      setTxState("confirmed");
      addTxToHistory(actionType, amount, tokenId, tx.hash);
      successCallback(receipt);
      
      // Refresh statistics
      setTimeout(() => {
        refreshData();
      }, 1000);
      
    } catch (error: any) {
      console.error("Transaction failed", error);
      setTxState("error");
      
      // Parse error message
      let msg = "Transaction failed. Please try again.";
      if (error.code === "ACTION_REJECTED" || error.message?.includes("rejected")) {
        msg = "Transaction rejected by user.";
      } else if (error.message?.includes("insufficient funds")) {
        msg = "Insufficient funds to cover transaction and gas.";
      } else if (error.message?.includes("revert")) {
        // Attempt to extract revert reason
        const matches = error.message.match(/reverted with reason string '([^']+)'/);
        if (matches && matches[1]) {
          msg = `Execution reverted: ${matches[1]}`;
        } else {
          msg = "Transaction reverted on-chain.";
        }
      } else if (error.info?.error?.message) {
        msg = error.info.error.message;
      }
      setTxError(msg);
    }
  }, [refreshData, addTxToHistory]);

  // Core Actions
  const stakeETH = useCallback(async (amountStr: string) => {
    await handleTransaction(
      async () => {
        const tempProvider = new BrowserProvider(window.ethereum!);
        const signer = await tempProvider.getSigner();
        const contract = new Contract(contractAddressRef.current, STAKING_ABI, signer);
        return contract.stake({ value: parseEther(amountStr) });
      },
      (receipt) => {
        console.log("Stake receipt", receipt);
      },
      "Staked ETH",
      `${amountStr} ETH`
    );
  }, [handleTransaction]);

  const claimReward = useCallback(async (tokenId: number) => {
    await handleTransaction(
      async () => {
        const tempProvider = new BrowserProvider(window.ethereum!);
        const signer = await tempProvider.getSigner();
        const contract = new Contract(contractAddressRef.current, STAKING_ABI, signer);
        return contract.claimReward(tokenId);
      },
      (receipt) => {
        console.log("Claim reward receipt", receipt);
      },
      "Claimed Rewards",
      undefined,
      tokenId
    );
  }, [handleTransaction]);

  const unstake = useCallback(async (tokenId: number) => {
    await handleTransaction(
      async () => {
        const tempProvider = new BrowserProvider(window.ethereum!);
        const signer = await tempProvider.getSigner();
        const contract = new Contract(contractAddressRef.current, STAKING_ABI, signer);
        return contract.unstake(tokenId);
      },
      (receipt) => {
        console.log("Unstake receipt", receipt);
      },
      "Unstaked Position",
      undefined,
      tokenId
    );
  }, [handleTransaction]);

  const emergencyWithdraw = useCallback(async (tokenId: number) => {
    await handleTransaction(
      async () => {
        const tempProvider = new BrowserProvider(window.ethereum!);
        const signer = await tempProvider.getSigner();
        const contract = new Contract(contractAddressRef.current, STAKING_ABI, signer);
        return contract.emergencyWithdraw(tokenId);
      },
      (receipt) => {
        console.log("Emergency withdraw receipt", receipt);
      },
      "Emergency Withdrawn",
      undefined,
      tokenId
    );
  }, [handleTransaction]);

  // Owner Actions
  const setContractPaused = useCallback(async (shouldPause: boolean) => {
    await handleTransaction(
      async () => {
        const tempProvider = new BrowserProvider(window.ethereum!);
        const signer = await tempProvider.getSigner();
        const contract = new Contract(contractAddressRef.current, STAKING_ABI, signer);
        return shouldPause ? contract.pause() : contract.unpause();
      },
      () => {
        setPaused(shouldPause);
      },
      shouldPause ? "Contract Paused" : "Contract Unpaused"
    );
  }, [handleTransaction]);

  const setContractEmergencyMode = useCallback(async (active: boolean) => {
    await handleTransaction(
      async () => {
        const tempProvider = new BrowserProvider(window.ethereum!);
        const signer = await tempProvider.getSigner();
        const contract = new Contract(contractAddressRef.current, STAKING_ABI, signer);
        return contract.setEmergencyMode(active);
      },
      () => {
        setEmergencyMode(active);
      },
      active ? "Emergency Mode Activated" : "Emergency Mode Deactivated"
    );
  }, [handleTransaction]);

  const fundTreasury = useCallback(async (amountStr: string) => {
    await handleTransaction(
      async () => {
        const tempProvider = new BrowserProvider(window.ethereum!);
        const signer = await tempProvider.getSigner();
        const contract = new Contract(contractAddressRef.current, STAKING_ABI, signer);
        return contract.fundTreasury({ value: parseEther(amountStr) });
      },
      () => {},
      "Funded Treasury",
      `${amountStr} ETH`
    );
  }, [handleTransaction]);

  // Connect Wallet
  const connectWallet = useCallback(async () => {
    if (typeof window === "undefined" || !window.ethereum) {
      alert("No Ethereum browser extension detected. Please install Metamask.");
      return;
    }
    
    try {
      const tempProvider = new BrowserProvider(window.ethereum);
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      const currentAddress = accounts[0];
      
      const network = await tempProvider.getNetwork();
      const currentChainId = "0x" + network.chainId.toString(16);
      
      setProvider(tempProvider);
      setAccount(currentAddress);
      setChainId(currentChainId);
      
      // Trigger data fetch
      setTimeout(() => {
        refreshData();
      }, 200);
    } catch (e) {
      console.error("User rejected wallet connection", e);
    }
  }, [refreshData]);

  const disconnectWallet = useCallback(() => {
    setAccount(null);
    setProvider(null);
    setUserStakes([]);
    setUserStakedTotal("0.0");
    setUserClaimableTotal("0.0");
  }, []);

  // Watch for metamask events
  useEffect(() => {
    if (typeof window === "undefined" || !window.ethereum) return;
    
    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length > 0) {
        setAccount(accounts[0]);
        refreshData();
      } else {
        disconnectWallet();
      }
    };
    
    const handleChainChanged = (hexId: string) => {
      setChainId(hexId);
      refreshData();
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    // Initial check if already authorized
    const checkConnection = async () => {
      try {
        const tempProvider = new BrowserProvider(window.ethereum);
        const accounts = await tempProvider.listAccounts();
        if (accounts.length > 0) {
          setAccount(accounts[0].address);
          const network = await tempProvider.getNetwork();
          setChainId("0x" + network.chainId.toString(16));
          setProvider(tempProvider);
        }
      } catch (e) {
        console.error("Check connection failed", e);
      }
    };
    checkConnection();

    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener("chainChanged", handleChainChanged);
    };
  }, [refreshData, disconnectWallet]);

  // Periodic update of rewards (client-side simulation to avoid constant RPC queries)
  useEffect(() => {
    if (userStakes.length === 0 || paused || emergencyMode) return;
    
    const interval = setInterval(() => {
      setUserStakes((prevStakes) =>
        prevStakes.map((s) => {
          // reward = (amount * duration) / (5 * 5 days) - totalClaimed
          const timeElapsed = Date.now() / 1000 - s.startTime;
          const totalAccumulated = (Number(s.amount) * timeElapsed) / (5 * 5 * 24 * 60 * 60);
          const pending = Math.max(0, totalAccumulated - Number(s.claimedRewards));
          return {
            ...s,
            pendingReward: pending.toFixed(6),
          };
        })
      );
    }, 3000); // update every 3 seconds

    return () => clearInterval(interval);
  }, [userStakes.length, paused, emergencyMode]);

  // Set up contract event listeners to trigger refresh
  useEffect(() => {
    if (!window.ethereum || !isCorrectNetwork()) return;

    const tempProvider = new BrowserProvider(window.ethereum);
    const contract = new Contract(contractAddress, STAKING_ABI, tempProvider);

    const onEvent = () => {
      console.log("Contract event detected, refreshing data...");
      refreshData();
    };

    contract.on("StakeCreated", onEvent);
    contract.on("RewardClaimed", onEvent);
    contract.on("StakeWithdrawn", onEvent);
    contract.on("PenaltyApplied", onEvent);
    contract.on("EmergencyModeSet", onEvent);

    return () => {
      contract.off("StakeCreated", onEvent);
      contract.off("RewardClaimed", onEvent);
      contract.off("StakeWithdrawn", onEvent);
      contract.off("PenaltyApplied", onEvent);
      contract.off("EmergencyModeSet", onEvent);
    };
  }, [contractAddress, isCorrectNetwork, refreshData]);

  // Trigger state refresh on contract address change
  useEffect(() => {
    refreshData();
  }, [contractAddress, refreshData]);

  return {
    contractAddress,
    setContractAddress,
    account,
    chainId,
    isCorrectNetwork: isCorrectNetwork(),
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
    
    // history
    txHistory,
  };
}
