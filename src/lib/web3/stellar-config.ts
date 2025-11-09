// Stellar Network Configuration
export const STELLAR_NETWORKS = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    rpcUrl: "https://soroban-testnet.stellar.org:443",
    horizonUrl: "https://horizon-testnet.stellar.org",
  },
  mainnet: {
    networkPassphrase: "Public Global Stellar Network ; September 2015",
    rpcUrl: "https://soroban-mainnet.stellar.org:443",
    horizonUrl: "https://horizon.stellar.org",
  },
  local: {
    networkPassphrase: "Standalone Network ; February 2017",
    rpcUrl: "http://localhost:8000/soroban/rpc",
    horizonUrl: "http://localhost:8000",
  },
};

// Contract IDs (will be set after deployment)
// Fallback to the deployed contract ID if env variable is not set
// Testnet contract ID (deployed on testnet)
const DEFAULT_CONTRACT_ID =
  "CCZAL3WP3PEHT64FDZPJMNU7FW4M3NQNBAB55QKAF7ZOGQCUUKPRK5GN";

export const CONTRACTS = {
  SECUREFLOW_ESCROW:
    import.meta.env.VITE_SECUREFLOW_CONTRACT_ID || DEFAULT_CONTRACT_ID,
};

// Get current network from environment
export const getCurrentNetwork = () => {
  const env = import.meta.env.VITE_STELLAR_NETWORK || "testnet";
  return (
    STELLAR_NETWORKS[env as keyof typeof STELLAR_NETWORKS] ||
    STELLAR_NETWORKS.testnet
  );
};
