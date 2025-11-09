/**
 * Wallet Kit Configuration
 * Centralized wallet kit setup
 */

import {
  StellarWalletsKit,
  WalletNetwork,
  sep43Modules,
} from "@creit.tech/stellar-wallets-kit";
import { getCurrentNetwork } from "./stellar-config";

const network = getCurrentNetwork();
const walletNetwork = network.networkPassphrase.includes("Test")
  ? WalletNetwork.TESTNET
  : network.networkPassphrase.includes("Public")
    ? WalletNetwork.PUBLIC
    : WalletNetwork.TESTNET; // Default to testnet

export const kit: StellarWalletsKit = new StellarWalletsKit({
  network: walletNetwork,
  modules: sep43Modules(),
});
