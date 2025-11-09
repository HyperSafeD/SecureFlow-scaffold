/**
 * Contract Service Layer
 * Provides a clean interface for contract interactions
 * Following the pattern from Pacto P2P
 */

import {
  Contract,
  rpc,
  Address,
  nativeToScVal,
  scValToNative,
  TransactionBuilder,
  Operation,
  xdr,
} from "@stellar/stellar-sdk";
import { Client as SecureFlowClient } from "@/contracts/generated/src/index";
import { getCurrentNetwork, CONTRACTS } from "./stellar-config";
import { signTransaction, signAuthEntries } from "./wallet-signer";
import useWalletStore from "@/store/wallet.store";

export interface EscrowData {
  escrow_id: number;
  creator: string;
  freelancer?: string;
  status: number;
  token?: string;
  amount: string;
  deadline: number;
  created_at: number;
  milestones?: any[];
  project_title?: string;
  project_description?: string;
}

export interface CreateEscrowParams {
  depositor: string;
  beneficiary?: string;
  arbiters: string[];
  required_confirmations: number;
  milestones: Array<[string, string]>; // [amount, description] tuples
  token?: string;
  total_amount: string;
  duration: number; // in seconds
  project_title: string;
  project_description: string;
}

export class ContractService {
  private contractId: string;
  private network: ReturnType<typeof getCurrentNetwork>;
  private client: SecureFlowClient;
  private rpcServer: rpc.Server;

  constructor(contractId?: string) {
    this.contractId = contractId || CONTRACTS.SECUREFLOW_ESCROW;
    this.network = getCurrentNetwork();
    this.client = new SecureFlowClient({
      contractId: this.contractId,
      networkPassphrase: this.network.networkPassphrase,
      rpcUrl: this.network.rpcUrl,
    });
    this.rpcServer = new rpc.Server(this.network.rpcUrl);
  }

  /**
   * Read operations - use client directly
   */
  async getEscrow(escrowId: number): Promise<EscrowData | null> {
    try {
      // Use the RPC server directly to avoid the generated client's type checking
      // The generated client expects Option<EscrowData> but the contract returns a map directly
      const contract = new Contract(this.contractId);

      // For view functions, we need a valid account address as the source
      // Use the wallet address if available, otherwise use a dummy account
      let sourceAddress: string;
      const walletAddress = useWalletStore.getState().address;
      if (walletAddress) {
        sourceAddress = walletAddress;
      } else {
        // Use a dummy account for view functions (any valid account address works)
        // GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF is the zero account
        sourceAddress =
          "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
      }

      const sourceAccount = await this.rpcServer.getAccount(sourceAddress);

      // Build transaction for simulation using contract.call()
      const tx = new TransactionBuilder(sourceAccount, {
        fee: "100",
        networkPassphrase: this.network.networkPassphrase,
      })
        .addOperation(
          contract.call("get_escrow", nativeToScVal(escrowId, { type: "u32" }))
        )
        .setTimeout(30)
        .build();

      // Simulate to get the result
      const simulation = await this.rpcServer.simulateTransaction(tx);

      // Check for errors
      if ("errorResult" in simulation && simulation.errorResult) {
        const errorValue =
          (simulation.errorResult as any).value?.() || simulation.errorResult;
        // If error is about escrow not found, return null
        if (
          errorValue.toString().includes("not found") ||
          errorValue.toString().includes("does not exist")
        ) {
          return null;
        }
        throw new Error(
          `Transaction simulation failed: ${errorValue.toString()}`
        );
      }

      // Get the return value from simulation
      let escrowMap: any = null;
      if ("returnValue" in simulation && simulation.returnValue) {
        escrowMap = simulation.returnValue;
      } else if (simulation.result) {
        escrowMap = simulation.result;
      }

      if (!escrowMap) {
        return null;
      }

      // If escrowMap is an ScVal map, extract fields directly
      // The map structure is: { _switch: { name: "scvMap" }, _value: [entries] }
      // Each entry has: { _attributes: { key: ScVal, val: ScVal } }
      let escrowDataMap: Record<string, any> = {};

      if (
        escrowMap &&
        escrowMap._switch &&
        escrowMap._switch.name === "scvMap" &&
        escrowMap._value
      ) {
        // It's an ScVal map, extract entries
        const entries = escrowMap._value;
        for (const entry of entries) {
          if (entry && entry._attributes) {
            const keyScVal = entry._attributes.key;
            const valScVal = entry._attributes.val;

            // Extract key string from ScVal symbol
            if (
              keyScVal &&
              keyScVal._switch &&
              keyScVal._switch.name === "scvSymbol"
            ) {
              const keyBuffer = keyScVal._value?.data || keyScVal._value;
              if (keyBuffer) {
                // Convert buffer to string - handle both Buffer and Uint8Array
                let keyStr: string;
                if (
                  keyBuffer instanceof Uint8Array ||
                  (keyBuffer.type === "Buffer" && keyBuffer.data)
                ) {
                  keyStr = String.fromCharCode(
                    ...(keyBuffer.data || keyBuffer)
                  );
                } else if (typeof keyBuffer === "string") {
                  keyStr = keyBuffer;
                } else {
                  keyStr = String.fromCharCode(...Array.from(keyBuffer));
                }
                // Convert value ScVal to native - extract value safely
                try {
                  // Helper to safely extract value from ScVal
                  const extractValue = (scVal: any): any => {
                    if (!scVal) return undefined;

                    // If it's already a native value, return it
                    if (typeof scVal !== "object") {
                      return scVal;
                    }

                    // Check if it's a proper ScVal object with _switch property
                    if (scVal._switch && typeof scVal._switch === "object") {
                      try {
                        // It's a proper ScVal, convert it
                        return scValToNative(scVal);
                      } catch (e) {
                        // If conversion fails, try to extract value directly
                        if (scVal._value !== undefined) {
                          return scVal._value;
                        }
                        return scVal;
                      }
                    }

                    // Try to extract value from different possible structures
                    if (scVal._value !== undefined) {
                      return scVal._value;
                    } else if (scVal.value !== undefined) {
                      return scVal.value;
                    } else if (scVal._arm && scVal._value !== undefined) {
                      return scVal._value;
                    }

                    // Return as is if we can't extract
                    return scVal;
                  };

                  const val = extractValue(valScVal);
                  escrowDataMap[keyStr] = val;
                } catch (e) {
                  console.warn(`Could not extract value for key ${keyStr}:`, e);
                  // Use the value as is if extraction fails
                  escrowDataMap[keyStr] = valScVal;
                }
              }
            }
          }
        }
      } else {
        // Try to convert using scValToNative
        try {
          if (escrowMap && escrowMap._switch) {
            const converted = scValToNative(escrowMap);
            if (converted && typeof converted === "object") {
              escrowDataMap = converted;
            }
          } else {
            // Already a native object
            escrowDataMap = escrowMap;
          }
        } catch (e) {
          console.warn("Could not convert escrow map:", e);
          // If conversion fails, try to use it as is
          if (escrowMap && typeof escrowMap === "object") {
            escrowDataMap = escrowMap;
          }
        }
      }

      // Extract fields from the map
      const getField = (key: string): any => {
        return escrowDataMap[key];
      };

      // Helper to convert ScVal to native value
      const getValue = (val: any): any => {
        if (!val) return undefined;
        // Check if it's an ScVal object
        if (val && typeof val === "object" && val._switch) {
          try {
            return scValToNative(val);
          } catch (e) {
            // If conversion fails, try to extract value directly
            if (val._value !== undefined) {
              return val._value;
            }
            return val;
          }
        }
        // Already a native value
        return val;
      };

      // Extract all fields
      const depositor = getValue(getField("depositor"));
      const beneficiary = getValue(getField("beneficiary"));
      const status = getValue(getField("status"));
      const token = getValue(getField("token"));
      const totalAmount = getValue(getField("total_amount"));
      const deadline = getValue(getField("deadline"));
      const createdAt = getValue(getField("created_at"));
      const projectTitle = getValue(getField("project_title"));
      const projectDescription = getValue(getField("project_description"));

      // Convert status enum to number
      let statusNumber = 0;
      if (status) {
        if (typeof status === "string") {
          // Status is an enum like "Pending", "Active", etc.
          switch (status.toLowerCase()) {
            case "pending":
              statusNumber = 0;
              break;
            case "active":
              statusNumber = 1;
              break;
            case "completed":
              statusNumber = 2;
              break;
            case "disputed":
              statusNumber = 3;
              break;
            default:
              statusNumber = 0;
          }
        } else if (Array.isArray(status) && status.length > 0) {
          // Status might be an enum array
          const statusStr = status[0];
          if (typeof statusStr === "string") {
            switch (statusStr.toLowerCase()) {
              case "pending":
                statusNumber = 0;
                break;
              case "active":
                statusNumber = 1;
                break;
              case "completed":
                statusNumber = 2;
                break;
              case "disputed":
                statusNumber = 3;
                break;
            }
          }
        } else if (typeof status === "number") {
          statusNumber = status;
        }
      }

      return {
        escrow_id: escrowId,
        creator: depositor || "",
        freelancer: beneficiary || undefined,
        status: statusNumber,
        token: token || undefined,
        amount: totalAmount?.toString() || "0",
        deadline: deadline || 0,
        created_at: createdAt || 0,
        milestones: [],
        project_title: projectTitle || "",
        project_description: projectDescription || "",
      };
    } catch (error) {
      console.error("Error getting escrow:", error);
      // If escrow doesn't exist or there's an error, return null instead of throwing
      // This allows getNextEscrowId to continue iterating
      return null;
    }
  }

  async getNextEscrowId(): Promise<number> {
    try {
      // Since there's no direct function to get next_escrow_id,
      // we'll iterate through escrows until we find one that doesn't exist
      // This is a simple approach that works for small numbers of escrows
      let escrowId = 1;
      let maxAttempts = 100; // Reduced limit to prevent infinite loops
      let attempts = 0;
      let consecutiveErrors = 0;
      const maxConsecutiveErrors = 3; // Stop after 3 consecutive errors

      while (attempts < maxAttempts) {
        try {
          const escrow = await this.getEscrow(escrowId);
          consecutiveErrors = 0; // Reset error counter on success

          if (!escrow) {
            // Found the first non-existent escrow, so next_escrow_id is escrowId
            return escrowId;
          }
          escrowId++;
          attempts++;
        } catch (error) {
          consecutiveErrors++;
          attempts++;

          // If we get too many consecutive errors, stop
          if (consecutiveErrors >= maxConsecutiveErrors) {
            console.warn(
              `Stopped after ${maxConsecutiveErrors} consecutive errors. Last escrow ID: ${escrowId}`
            );
            return escrowId;
          }

          // If error is about escrow not found, that's expected
          if (
            error instanceof Error &&
            (error.message.includes("not found") ||
              error.message.includes("does not exist") ||
              error.message.includes("null"))
          ) {
            return escrowId;
          }

          // For other errors, continue but log them
          console.warn(`Error getting escrow ${escrowId}:`, error);
          escrowId++;
        }
      }

      // If we hit the max attempts, return the current escrowId
      console.warn(
        `Reached max attempts (${maxAttempts}). Returning escrowId: ${escrowId}`
      );
      return escrowId;
    } catch (error) {
      console.error("Error getting next escrow ID:", error);
      // If all fails, return 1 (no escrows created yet)
      return 1;
    }
  }

  async getUserEscrows(userAddress: string): Promise<number[]> {
    try {
      const result = await this.client.get_user_escrows({ user: userAddress });
      return result.result as number[];
    } catch (error) {
      console.error("Error getting user escrows:", error);
      throw error;
    }
  }

  async getReputation(userAddress: string): Promise<number> {
    try {
      const result = await this.client.get_reputation({ user: userAddress });
      return result.result as number;
    } catch (error) {
      console.error("Error getting reputation:", error);
      return 0;
    }
  }

  async isJobCreationPaused(address?: string): Promise<boolean> {
    try {
      // Use the generated client for view functions - it handles simulation correctly
      const assembledTx = await this.client.is_job_creation_paused({
        simulate: true,
      });

      // For view functions, the result is in the assembledTx.result
      if (assembledTx.result !== undefined) {
        return assembledTx.result as boolean;
      }

      // Fallback: try to get result from simulation
      if (assembledTx.simulationData) {
        const simData = assembledTx.simulationData;
        if ("returnValue" in simData && simData.returnValue) {
          return scValToNative(simData.returnValue) as boolean;
        }
      }

      return false;
    } catch (error) {
      console.error("Error checking pause status:", error);
      // Fallback to false if contract call fails
      return false;
    }
  }

  /**
   * Write operations - build, sign, and send transactions
   */
  async createEscrow(params: CreateEscrowParams): Promise<number> {
    // Use the depositor from params, or fall back to store if not provided
    const walletAddress = params.depositor || useWalletStore.getState().address;
    if (!walletAddress) {
      throw new Error("Wallet not connected");
    }

    try {
      // Convert milestones to tuples [i128, string]
      // The contract expects i128 (bigint) for amounts, so we need to convert strings to bigint
      const milestones: Array<[bigint, string]> = params.milestones.map(
        ([amount, description]) => [BigInt(amount), description]
      );

      // Build transaction manually with depositor as source account
      // This ensures the transaction is built with the correct source account
      const contract = new Contract(this.contractId);
      const sourceAccount = await this.rpcServer.getAccount(walletAddress);

      // Convert parameters to ScVal format
      const depositorScVal = nativeToScVal(walletAddress, { type: "address" });
      const beneficiaryScVal = params.beneficiary
        ? nativeToScVal(params.beneficiary, { type: "address" })
        : xdr.ScVal.scvVoid();

      // Convert arbiters array to ScVal vector
      const arbitersScVals = params.arbiters.map((arbiter) =>
        nativeToScVal(arbiter, { type: "address" })
      );
      const arbitersScVal = xdr.ScVal.scvVec(arbitersScVals);

      const requiredConfirmationsScVal = nativeToScVal(
        params.required_confirmations,
        { type: "u32" }
      );

      // Convert milestones array to ScVal vector
      // Each milestone is a tuple [i128, string]
      const milestonesScVals = milestones.map(([amount, description]) => {
        const amountScVal = nativeToScVal(amount, { type: "i128" });
        const descriptionScVal = nativeToScVal(description, { type: "string" });
        return xdr.ScVal.scvVec([amountScVal, descriptionScVal]);
      });
      const milestonesScVal = xdr.ScVal.scvVec(milestonesScVals);

      const tokenScVal = params.token
        ? nativeToScVal(params.token, { type: "address" })
        : xdr.ScVal.scvVoid();
      const totalAmountScVal = nativeToScVal(BigInt(params.total_amount), {
        type: "i128",
      });
      const durationScVal = nativeToScVal(params.duration, { type: "u32" });
      const projectTitleScVal = nativeToScVal(params.project_title, {
        type: "string",
      });
      const projectDescriptionScVal = nativeToScVal(
        params.project_description,
        { type: "string" }
      );

      // Build transaction with depositor as source account
      const tx = new TransactionBuilder(sourceAccount, {
        fee: "100",
        networkPassphrase: this.network.networkPassphrase,
      })
        .addOperation(
          contract.call(
            "create_escrow",
            depositorScVal,
            beneficiaryScVal,
            arbitersScVal,
            requiredConfirmationsScVal,
            milestonesScVal,
            tokenScVal,
            totalAmountScVal,
            durationScVal,
            projectTitleScVal,
            projectDescriptionScVal
          )
        )
        .setTimeout(30)
        .build();

      // Simulate to check for errors and get auth entries
      const simulation = await this.rpcServer.simulateTransaction(tx);

      // Check for auth entries
      const authEntries =
        "auth" in simulation && simulation.auth ? simulation.auth : [];

      // Check if simulation failed
      if ("errorResult" in simulation && simulation.errorResult) {
        const errorValue =
          (simulation.errorResult as any).value?.() || simulation.errorResult;
        throw new Error(
          `Transaction simulation failed: ${errorValue.toString()}`
        );
      }

      // Get the escrow ID from simulation if available
      let escrowIdFromSimulation: number | undefined;

      // Check different possible locations for return value
      let returnValue: any = null;
      if ((simulation as any).result) {
        // Check if result has returnValue or is directly the ScVal
        const result = (simulation as any).result;
        if (result && typeof result === "object") {
          if ("returnValue" in result && result.returnValue) {
            returnValue = result.returnValue;
          } else if ("xdr" in result) {
            // Might be an XDR object
            returnValue = result;
          } else {
            // Try using result directly
            returnValue = result;
          }
        }
      } else if ("returnValue" in simulation && simulation.returnValue) {
        returnValue = simulation.returnValue;
      } else if (
        "transactionData" in simulation &&
        (simulation as any).transactionData
      ) {
        const txData = (simulation as any).transactionData;
        if ("returnValue" in txData && txData.returnValue) {
          returnValue = txData.returnValue;
        }
      }

      if (returnValue) {
        try {
          console.log("Simulation returnValue:", returnValue);
          // Check if returnValue has a retval property (common in Stellar SDK)
          let scVal: xdr.ScVal;
          if (returnValue.retval) {
            // The actual return value is in retval property
            scVal = returnValue.retval;
          } else if (returnValue instanceof xdr.ScVal) {
            // Already an ScVal object
            scVal = returnValue;
          } else if (typeof returnValue === "string") {
            scVal = xdr.ScVal.fromXDR(returnValue, "base64");
          } else if (returnValue.xdr) {
            scVal = xdr.ScVal.fromXDR(returnValue.xdr, "base64");
          } else {
            // Try to use it as is
            scVal = returnValue as xdr.ScVal;
          }
          const result = scValToNative(scVal);
          console.log("Parsed simulation result:", result, typeof result);
          if (typeof result === "number") {
            escrowIdFromSimulation = result;
            console.log("Escrow ID from simulation:", escrowIdFromSimulation);
          }
        } catch (e) {
          console.warn("Could not parse escrow ID from simulation:", e);
        }
      } else {
        console.log(
          "No returnValue in simulation. Simulation structure:",
          Object.keys(simulation)
        );
        if ((simulation as any).result) {
          console.log("Simulation result:", (simulation as any).result);
        }
      }

      // Prepare transaction
      const prepared = await this.rpcServer.prepareTransaction(tx);

      // Sign auth entries if needed
      if (authEntries && authEntries.length > 0) {
        const signedAuthEntries = await signAuthEntries(
          authEntries,
          walletAddress
        );
        // Rebuild transaction with signed auth entries
        const { xdr } = await import("@stellar/stellar-sdk");
        const parsedSignedAuth = signedAuthEntries.map((signed: string) =>
          xdr.SorobanAuthorizationEntry.fromXDR(signed, "base64")
        );

        const operations = prepared.operations;
        if (operations && operations.length > 0) {
          const op = operations[0];
          if (op.type === "invokeHostFunction") {
            const hostFn = (op as any).function || (op as any).hostFunction;
            const newOp = Operation.invokeHostFunction({
              function: hostFn,
              auth: parsedSignedAuth,
            });

            const freshAccount = await this.rpcServer.getAccount(walletAddress);
            const newTx = new TransactionBuilder(freshAccount, {
              fee: prepared.fee,
              networkPassphrase: this.network.networkPassphrase,
            })
              .addOperation(newOp)
              .setTimeout(30)
              .build();

            const newPrepared = await this.rpcServer.prepareTransaction(newTx);
            const signedTxXdr = await signTransaction({
              unsignedTransaction: newPrepared.toXDR(),
              address: walletAddress,
            });

            const signedTransaction = TransactionBuilder.fromXDR(
              signedTxXdr,
              this.network.networkPassphrase
            );

            const sendResponse =
              await this.rpcServer.sendTransaction(signedTransaction);

            if (sendResponse.status === "ERROR") {
              throw new Error("Transaction failed");
            }

            const txHash = sendResponse.hash || "";
            if (sendResponse.status === "PENDING" && txHash) {
              await this.waitForConfirmation(txHash);
            }

            // Return escrow ID from simulation if available
            if (escrowIdFromSimulation !== undefined) {
              console.log(
                "Returning escrow ID from simulation:",
                escrowIdFromSimulation
              );
              return escrowIdFromSimulation;
            }

            // Otherwise, try to get it from the transaction result
            // Wait a bit more to ensure transaction is fully processed
            await new Promise((resolve) => setTimeout(resolve, 2000));

            console.log("Fetching transaction result for hash:", txHash);
            let txResult = await this.rpcServer.getTransaction(txHash);
            console.log("Transaction result:", {
              status: txResult.status,
              hasResultXdr: !!txResult.resultXdr,
              resultXdrType: typeof txResult.resultXdr,
            });

            // If transaction is still NOT_FOUND, wait a bit more and retry
            if (txResult.status === "NOT_FOUND") {
              console.log("Transaction not found, waiting and retrying...");
              await new Promise((resolve) => setTimeout(resolve, 3000));
              txResult = await this.rpcServer.getTransaction(txHash);
              console.log("Retry transaction result:", {
                status: txResult.status,
                hasResultXdr: !!txResult.resultXdr,
              });
            }

            if (txResult.status === "SUCCESS" && txResult.resultXdr) {
              try {
                // resultXdr might be a string (base64) or already an ScVal object
                let resultScVal: xdr.ScVal;
                if (typeof txResult.resultXdr === "string") {
                  resultScVal = xdr.ScVal.fromXDR(txResult.resultXdr, "base64");
                } else if (txResult.resultXdr instanceof xdr.ScVal) {
                  // Already an ScVal object
                  resultScVal = txResult.resultXdr;
                } else if ((txResult.resultXdr as any).xdr) {
                  // Has xdr property
                  resultScVal = xdr.ScVal.fromXDR(
                    (txResult.resultXdr as any).xdr,
                    "base64"
                  );
                } else {
                  // Try to use it as is, but check if it has the right structure
                  const resultXdrObj = txResult.resultXdr as any;
                  console.log("resultXdr structure:", {
                    keys: Object.keys(resultXdrObj),
                    constructor: resultXdrObj.constructor?.name,
                  });
                  // Check if it has a retval property (common in Stellar SDK)
                  if (resultXdrObj.retval) {
                    resultScVal = resultXdrObj.retval;
                  } else if (
                    resultXdrObj.switch ||
                    resultXdrObj._switch ||
                    resultXdrObj.value ||
                    resultXdrObj._value !== undefined
                  ) {
                    // Might be an ScVal-like object
                    resultScVal = resultXdrObj as xdr.ScVal;
                  } else {
                    // Try to access the value directly if it's a simple object
                    if (resultXdrObj._value !== undefined) {
                      // Create a new ScVal from the value
                      const value = resultXdrObj._value;
                      if (typeof value === "number") {
                        resultScVal = xdr.ScVal.scvU32(value);
                      } else {
                        throw new Error("resultXdr is not a valid ScVal");
                      }
                    } else {
                      throw new Error("resultXdr is not a valid ScVal");
                    }
                  }
                }
                const result = scValToNative(resultScVal);
                console.log(
                  "Parsed transaction result:",
                  result,
                  typeof result
                );
                if (typeof result === "number") {
                  return result;
                }
              } catch (e) {
                console.warn(
                  "Could not parse escrow ID from transaction result:",
                  e,
                  txResult.resultXdr
                );
              }
            }

            console.error(
              "Could not get escrow ID - simulation:",
              escrowIdFromSimulation,
              "txResult:",
              txResult
            );
            throw new Error("Could not get escrow ID from transaction");
          }
        }
      }

      // No auth entries, sign normally
      const signedTxXdr = await signTransaction({
        unsignedTransaction: prepared.toXDR(),
        address: walletAddress,
      });

      const signedTransaction = TransactionBuilder.fromXDR(
        signedTxXdr,
        this.network.networkPassphrase
      );

      const sendResponse =
        await this.rpcServer.sendTransaction(signedTransaction);

      if (sendResponse.status === "ERROR") {
        throw new Error("Transaction failed");
      }

      const txHash = sendResponse.hash || "";
      if (sendResponse.status === "PENDING" && txHash) {
        await this.waitForConfirmation(txHash);
      }

      // Return escrow ID from simulation if available
      if (escrowIdFromSimulation !== undefined) {
        console.log(
          "Returning escrow ID from simulation:",
          escrowIdFromSimulation
        );
        return escrowIdFromSimulation;
      }

      // Otherwise, try to get it from the transaction result
      // Wait a bit more to ensure transaction is fully processed
      await new Promise((resolve) => setTimeout(resolve, 2000));

      console.log("Fetching transaction result for hash:", txHash);
      let txResult = await this.rpcServer.getTransaction(txHash);
      console.log("Transaction result:", {
        status: txResult.status,
        hasResultXdr: !!txResult.resultXdr,
        resultXdrType: typeof txResult.resultXdr,
      });

      // If transaction is still NOT_FOUND, wait a bit more and retry
      if (txResult.status === "NOT_FOUND") {
        console.log("Transaction not found, waiting and retrying...");
        await new Promise((resolve) => setTimeout(resolve, 3000));
        txResult = await this.rpcServer.getTransaction(txHash);
        console.log("Retry transaction result:", {
          status: txResult.status,
          hasResultXdr: !!txResult.resultXdr,
        });
      }

      if (txResult.status === "SUCCESS" && txResult.resultXdr) {
        try {
          // resultXdr might be a string (base64) or already an ScVal object
          let resultScVal: xdr.ScVal;
          if (typeof txResult.resultXdr === "string") {
            resultScVal = xdr.ScVal.fromXDR(txResult.resultXdr, "base64");
          } else if (txResult.resultXdr instanceof xdr.ScVal) {
            // Already an ScVal object
            resultScVal = txResult.resultXdr;
          } else if ((txResult.resultXdr as any).xdr) {
            // Has xdr property
            resultScVal = xdr.ScVal.fromXDR(
              (txResult.resultXdr as any).xdr,
              "base64"
            );
          } else {
            // Try to use it as is, but check if it has the right structure
            const resultXdrObj = txResult.resultXdr as any;
            console.log("resultXdr structure:", {
              keys: Object.keys(resultXdrObj),
              constructor: resultXdrObj.constructor?.name,
            });
            // Check if it has a retval property (common in Stellar SDK)
            if (resultXdrObj.retval) {
              resultScVal = resultXdrObj.retval;
            } else if (
              resultXdrObj.switch ||
              resultXdrObj._switch ||
              resultXdrObj.value ||
              resultXdrObj._value !== undefined
            ) {
              // Might be an ScVal-like object
              resultScVal = resultXdrObj as xdr.ScVal;
            } else {
              // Try to access the value directly if it's a simple object
              if (resultXdrObj._value !== undefined) {
                // Create a new ScVal from the value
                const value = resultXdrObj._value;
                if (typeof value === "number") {
                  resultScVal = xdr.ScVal.scvU32(value);
                } else {
                  throw new Error("resultXdr is not a valid ScVal");
                }
              } else {
                throw new Error("resultXdr is not a valid ScVal");
              }
            }
          }
          const result = scValToNative(resultScVal);
          console.log("Parsed transaction result:", result, typeof result);
          if (typeof result === "number") {
            return result;
          }
        } catch (e) {
          console.warn(
            "Could not parse escrow ID from transaction result:",
            e,
            txResult.resultXdr
          );
        }
      }

      console.error(
        "Could not get escrow ID - simulation:",
        escrowIdFromSimulation,
        "txResult:",
        txResult
      );
      throw new Error("Could not get escrow ID from transaction");
    } catch (error: any) {
      console.error("Error creating escrow:", error);
      throw error;
    }
  }

  async startWork(escrowId: number, beneficiary: string): Promise<string> {
    const { address } = useWalletStore.getState();
    if (!address) {
      throw new Error("Wallet not connected");
    }

    const walletAddress = address;

    try {
      const assembledTx = await this.client.start_work({
        escrow_id: escrowId,
        beneficiary,
      });

      return await this.sendTransactionWithAuth(assembledTx, walletAddress);
    } catch (error: any) {
      console.error("Error starting work:", error);
      throw error;
    }
  }

  async submitMilestone(params: {
    escrow_id: number;
    milestone_index: number;
    description: string;
    beneficiary: string;
  }): Promise<string> {
    const { address } = useWalletStore.getState();
    if (!address) {
      throw new Error("Wallet not connected");
    }

    const walletAddress = address;

    try {
      const assembledTx = await this.client.submit_milestone({
        escrow_id: params.escrow_id,
        milestone_index: params.milestone_index,
        description: params.description,
        beneficiary: params.beneficiary,
      });

      return await this.sendTransactionWithAuth(assembledTx, walletAddress);
    } catch (error: any) {
      console.error("Error submitting milestone:", error);
      throw error;
    }
  }

  async approveMilestone(params: {
    escrow_id: number;
    milestone_index: number;
    depositor: string;
  }): Promise<string> {
    const { address } = useWalletStore.getState();
    if (!address) {
      throw new Error("Wallet not connected");
    }

    const walletAddress = address;

    try {
      const assembledTx = await this.client.approve_milestone({
        escrow_id: params.escrow_id,
        milestone_index: params.milestone_index,
        depositor: params.depositor,
      });

      return await this.sendTransactionWithAuth(assembledTx, walletAddress);
    } catch (error: any) {
      console.error("Error approving milestone:", error);
      throw error;
    }
  }

  async refundEscrow(escrowId: number, depositor: string): Promise<string> {
    const { address } = useWalletStore.getState();
    if (!address) {
      throw new Error("Wallet not connected");
    }

    const walletAddress = address;

    try {
      const assembledTx = await this.client.refund_escrow({
        escrow_id: escrowId,
        depositor,
      });

      return await this.sendTransactionWithAuth(assembledTx, walletAddress);
    } catch (error: any) {
      console.error("Error refunding escrow:", error);
      throw error;
    }
  }

  async applyToJob(params: {
    escrow_id: number;
    cover_letter: string;
    proposed_timeline: number;
    freelancer: string;
  }): Promise<string> {
    const { address } = useWalletStore.getState();
    if (!address) {
      throw new Error("Wallet not connected");
    }

    const walletAddress = address;

    try {
      const assembledTx = await this.client.apply_to_job({
        escrow_id: params.escrow_id,
        cover_letter: params.cover_letter,
        proposed_timeline: params.proposed_timeline,
        freelancer: params.freelancer,
      });

      return await this.sendTransactionWithAuth(assembledTx, walletAddress);
    } catch (error: any) {
      console.error("Error applying to job:", error);
      throw error;
    }
  }

  async acceptFreelancer(params: {
    escrow_id: number;
    freelancer: string;
    depositor: string;
  }): Promise<string> {
    const { address } = useWalletStore.getState();
    if (!address) {
      throw new Error("Wallet not connected");
    }

    const walletAddress = address;

    try {
      const assembledTx = await this.client.accept_freelancer({
        escrow_id: params.escrow_id,
        freelancer: params.freelancer,
        depositor: params.depositor,
      });

      return await this.sendTransactionWithAuth(assembledTx, walletAddress);
    } catch (error: any) {
      console.error("Error accepting freelancer:", error);
      throw error;
    }
  }

  async emergencyRefundAfterDeadline(
    escrowId: number,
    depositor: string
  ): Promise<string> {
    const { address } = useWalletStore.getState();
    if (!address) {
      throw new Error("Wallet not connected");
    }

    const walletAddress = address;

    try {
      const assembledTx = await this.client.emergency_refund_after_deadline({
        escrow_id: escrowId,
        depositor,
      });

      return await this.sendTransactionWithAuth(assembledTx, walletAddress);
    } catch (error: any) {
      console.error("Error emergency refunding:", error);
      throw error;
    }
  }

  async extendDeadline(params: {
    escrow_id: number;
    extra_seconds: number;
    depositor: string;
  }): Promise<string> {
    const { address } = useWalletStore.getState();
    if (!address) {
      throw new Error("Wallet not connected");
    }

    const walletAddress = address;

    try {
      const assembledTx = await this.client.extend_deadline({
        escrow_id: params.escrow_id,
        extra_seconds: params.extra_seconds,
        depositor: params.depositor,
      });

      return await this.sendTransactionWithAuth(assembledTx, walletAddress);
    } catch (error: any) {
      console.error("Error extending deadline:", error);
      throw error;
    }
  }

  /**
   * Admin operations - require owner authorization
   */
  async pauseJobCreation(address?: string): Promise<string> {
    const walletAddress = address || useWalletStore.getState().address;
    if (!walletAddress) {
      throw new Error("Wallet not connected");
    }

    try {
      const contract = new Contract(this.contractId);
      const sourceAccount = await this.rpcServer.getAccount(walletAddress);

      // Use pause_job_creation() - no parameters needed
      const tx = new TransactionBuilder(sourceAccount, {
        fee: "100",
        networkPassphrase: this.network.networkPassphrase,
      })
        .addOperation(contract.call("pause_job_creation"))
        .setTimeout(30)
        .build();

      // Simulate to check for errors and get auth entries
      const simulation = await this.rpcServer.simulateTransaction(tx);

      // Check for auth entries
      const authEntries =
        "auth" in simulation && simulation.auth ? simulation.auth : [];

      // Check if simulation failed
      if ("errorResult" in simulation && simulation.errorResult) {
        const errorValue =
          (simulation.errorResult as any).value?.() || simulation.errorResult;
        throw new Error(
          `Transaction simulation failed: ${errorValue.toString()}`
        );
      }

      // Prepare transaction
      const prepared = await this.rpcServer.prepareTransaction(tx);

      // Sign auth entries if needed
      if (authEntries && authEntries.length > 0) {
        const signedAuthEntries = await signAuthEntries(
          authEntries,
          walletAddress
        );
        // Rebuild transaction with signed auth entries
        const { xdr } = await import("@stellar/stellar-sdk");
        const parsedSignedAuth = signedAuthEntries.map((signed: string) =>
          xdr.SorobanAuthorizationEntry.fromXDR(signed, "base64")
        );

        const operations = prepared.operations;
        if (operations && operations.length > 0) {
          const op = operations[0];
          if (op.type === "invokeHostFunction") {
            const hostFn = (op as any).function || (op as any).hostFunction;
            const newOp = Operation.invokeHostFunction({
              function: hostFn,
              auth: parsedSignedAuth,
            });

            const freshAccount = await this.rpcServer.getAccount(walletAddress);
            const newTx = new TransactionBuilder(freshAccount, {
              fee: prepared.fee,
              networkPassphrase: this.network.networkPassphrase,
            })
              .addOperation(newOp)
              .setTimeout(30)
              .build();

            const newPrepared = await this.rpcServer.prepareTransaction(newTx);
            const signedTxXdr = await signTransaction({
              unsignedTransaction: newPrepared.toXDR(),
              address: walletAddress,
            });

            const signedTransaction = TransactionBuilder.fromXDR(
              signedTxXdr,
              this.network.networkPassphrase
            );

            const sendResponse =
              await this.rpcServer.sendTransaction(signedTransaction);

            if (sendResponse.status === "ERROR") {
              throw new Error("Transaction failed");
            }

            if (sendResponse.status === "PENDING" && sendResponse.hash) {
              return await this.waitForConfirmation(sendResponse.hash);
            }

            return sendResponse.hash || "";
          }
        }
      }

      // No auth entries, sign normally
      const signedTxXdr = await signTransaction({
        unsignedTransaction: prepared.toXDR(),
        address: walletAddress,
      });

      const signedTransaction = TransactionBuilder.fromXDR(
        signedTxXdr,
        this.network.networkPassphrase
      );

      const sendResponse =
        await this.rpcServer.sendTransaction(signedTransaction);

      if (sendResponse.status === "ERROR") {
        throw new Error("Transaction failed");
      }

      if (sendResponse.status === "PENDING" && sendResponse.hash) {
        return await this.waitForConfirmation(sendResponse.hash);
      }

      return sendResponse.hash || "";
    } catch (error: any) {
      console.error("Error pausing job creation:", error);
      throw error;
    }
  }

  async unpauseJobCreation(address?: string): Promise<string> {
    const walletAddress = address || useWalletStore.getState().address;
    if (!walletAddress) {
      throw new Error("Wallet not connected");
    }

    try {
      const contract = new Contract(this.contractId);
      const sourceAccount = await this.rpcServer.getAccount(walletAddress);

      // Use unpause_job_creation() - no parameters needed
      const tx = new TransactionBuilder(sourceAccount, {
        fee: "100",
        networkPassphrase: this.network.networkPassphrase,
      })
        .addOperation(contract.call("unpause_job_creation"))
        .setTimeout(30)
        .build();

      // Simulate to check for errors and get auth entries
      const simulation = await this.rpcServer.simulateTransaction(tx);

      // Check for auth entries
      const authEntries =
        "auth" in simulation && simulation.auth ? simulation.auth : [];

      // Check if simulation failed
      if ("errorResult" in simulation && simulation.errorResult) {
        const errorValue =
          (simulation.errorResult as any).value?.() || simulation.errorResult;
        throw new Error(
          `Transaction simulation failed: ${errorValue.toString()}`
        );
      }

      // Prepare transaction
      const prepared = await this.rpcServer.prepareTransaction(tx);

      // Sign auth entries if needed
      if (authEntries && authEntries.length > 0) {
        const signedAuthEntries = await signAuthEntries(
          authEntries,
          walletAddress
        );
        // Rebuild transaction with signed auth entries
        const { xdr } = await import("@stellar/stellar-sdk");
        const parsedSignedAuth = signedAuthEntries.map((signed: string) =>
          xdr.SorobanAuthorizationEntry.fromXDR(signed, "base64")
        );

        const operations = prepared.operations;
        if (operations && operations.length > 0) {
          const op = operations[0];
          if (op.type === "invokeHostFunction") {
            const hostFn = (op as any).function || (op as any).hostFunction;
            const newOp = Operation.invokeHostFunction({
              function: hostFn,
              auth: parsedSignedAuth,
            });

            const freshAccount = await this.rpcServer.getAccount(walletAddress);
            const newTx = new TransactionBuilder(freshAccount, {
              fee: prepared.fee,
              networkPassphrase: this.network.networkPassphrase,
            })
              .addOperation(newOp)
              .setTimeout(30)
              .build();

            const newPrepared = await this.rpcServer.prepareTransaction(newTx);
            const signedTxXdr = await signTransaction({
              unsignedTransaction: newPrepared.toXDR(),
              address: walletAddress,
            });

            const signedTransaction = TransactionBuilder.fromXDR(
              signedTxXdr,
              this.network.networkPassphrase
            );

            const sendResponse =
              await this.rpcServer.sendTransaction(signedTransaction);

            if (sendResponse.status === "ERROR") {
              throw new Error("Transaction failed");
            }

            if (sendResponse.status === "PENDING" && sendResponse.hash) {
              return await this.waitForConfirmation(sendResponse.hash);
            }

            return sendResponse.hash || "";
          }
        }
      }

      // No auth entries, sign normally
      const signedTxXdr = await signTransaction({
        unsignedTransaction: prepared.toXDR(),
        address: walletAddress,
      });

      const signedTransaction = TransactionBuilder.fromXDR(
        signedTxXdr,
        this.network.networkPassphrase
      );

      const sendResponse =
        await this.rpcServer.sendTransaction(signedTransaction);

      if (sendResponse.status === "ERROR") {
        throw new Error("Transaction failed");
      }

      if (sendResponse.status === "PENDING" && sendResponse.hash) {
        return await this.waitForConfirmation(sendResponse.hash);
      }

      return sendResponse.hash || "";
    } catch (error: any) {
      console.error("Error unpausing job creation:", error);
      throw error;
    }
  }

  async setPlatformFeeBP(feeBP: number): Promise<string> {
    const { address } = useWalletStore.getState();
    if (!address) {
      throw new Error("Wallet not connected");
    }

    try {
      const assembledTx = await this.client.set_platform_fee_bp({
        fee_bp: feeBP,
      });

      const signedTxXdr = await signTransaction({
        unsignedTransaction: assembledTx.toXDR(),
        address: walletAddress,
      });

      const signedTransaction = TransactionBuilder.fromXDR(
        signedTxXdr,
        this.network.networkPassphrase
      );

      const sendResponse =
        await this.rpcServer.sendTransaction(signedTransaction);

      if (sendResponse.status === "ERROR") {
        throw new Error("Transaction failed");
      }

      if (sendResponse.status === "PENDING" && sendResponse.hash) {
        return await this.waitForConfirmation(sendResponse.hash);
      }

      return sendResponse.hash || "";
    } catch (error: any) {
      console.error("Error setting platform fee:", error);
      throw error;
    }
  }

  async setFeeCollector(feeCollector: string): Promise<string> {
    const { address } = useWalletStore.getState();
    if (!address) {
      throw new Error("Wallet not connected");
    }

    try {
      const assembledTx = await this.client.set_fee_collector({
        fee_collector: feeCollector,
      });

      const signedTxXdr = await signTransaction({
        unsignedTransaction: assembledTx.toXDR(),
        address: walletAddress,
      });

      const signedTransaction = TransactionBuilder.fromXDR(
        signedTxXdr,
        this.network.networkPassphrase
      );

      const sendResponse =
        await this.rpcServer.sendTransaction(signedTransaction);

      if (sendResponse.status === "ERROR") {
        throw new Error("Transaction failed");
      }

      if (sendResponse.status === "PENDING" && sendResponse.hash) {
        return await this.waitForConfirmation(sendResponse.hash);
      }

      return sendResponse.hash || "";
    } catch (error: any) {
      console.error("Error setting fee collector:", error);
      throw error;
    }
  }

  async whitelistToken(token: string): Promise<string> {
    const { address } = useWalletStore.getState();
    if (!address) {
      throw new Error("Wallet not connected");
    }

    const walletAddress = address;

    try {
      const assembledTx = await this.client.whitelist_token({ token });

      return await this.sendTransactionWithAuth(assembledTx, walletAddress);
    } catch (error: any) {
      console.error("Error whitelisting token:", error);
      throw error;
    }
  }

  async authorizeArbiter(arbiter: string): Promise<string> {
    const { address } = useWalletStore.getState();
    if (!address) {
      throw new Error("Wallet not connected");
    }

    const walletAddress = address;

    try {
      const assembledTx = await this.client.authorize_arbiter({ arbiter });

      return await this.sendTransactionWithAuth(assembledTx, walletAddress);
    } catch (error: any) {
      console.error("Error authorizing arbiter:", error);
      throw error;
    }
  }

  /**
   * Helper function to handle auth entries and send transaction
   */
  private async sendTransactionWithAuth(
    assembledTx: any,
    walletAddress: string,
    sourceAddress?: string
  ): Promise<string> {
    // Simulate to check for errors and get auth entries
    const tx = TransactionBuilder.fromXDR(
      assembledTx.toXDR(),
      this.network.networkPassphrase
    );

    // If sourceAddress is provided, rebuild the transaction with that source account
    // This is needed when the depositor is different from the invoker
    let transactionToSimulate = tx;
    if (sourceAddress && sourceAddress !== walletAddress) {
      const sourceAccount = await this.rpcServer.getAccount(sourceAddress);
      const operations = tx.operations;
      if (operations && operations.length > 0) {
        const newTx = new TransactionBuilder(sourceAccount, {
          fee: tx.fee,
          networkPassphrase: this.network.networkPassphrase,
        });
        operations.forEach((op) => newTx.addOperation(op));
        transactionToSimulate = newTx.setTimeout(tx.timeout).build();
      }
    }

    const simulation = await this.rpcServer.simulateTransaction(
      transactionToSimulate
    );

    // Check for auth entries
    const authEntries =
      "auth" in simulation && simulation.auth ? simulation.auth : [];

    // Check if simulation failed
    if ("errorResult" in simulation && simulation.errorResult) {
      const errorValue =
        (simulation.errorResult as any).value?.() || simulation.errorResult;
      throw new Error(
        `Transaction simulation failed: ${errorValue.toString()}`
      );
    }

    // Prepare transaction
    const prepared = await this.rpcServer.prepareTransaction(
      transactionToSimulate
    );

    // Sign auth entries if needed
    if (authEntries && authEntries.length > 0) {
      // Use sourceAddress if provided, otherwise use walletAddress
      // For create_escrow, we need to sign auth entries for the depositor
      const authSignerAddress = sourceAddress || walletAddress;
      const signedAuthEntries = await signAuthEntries(
        authEntries,
        authSignerAddress
      );
      // Rebuild transaction with signed auth entries
      const { xdr } = await import("@stellar/stellar-sdk");
      const parsedSignedAuth = signedAuthEntries.map((signed: string) =>
        xdr.SorobanAuthorizationEntry.fromXDR(signed, "base64")
      );

      const operations = prepared.operations;
      if (operations && operations.length > 0) {
        const op = operations[0];
        if (op.type === "invokeHostFunction") {
          const hostFn = (op as any).function || (op as any).hostFunction;
          const newOp = Operation.invokeHostFunction({
            function: hostFn,
            auth: parsedSignedAuth,
          });

          // Use sourceAddress if provided, otherwise use walletAddress
          const signerAddress = sourceAddress || walletAddress;
          const freshAccount = await this.rpcServer.getAccount(signerAddress);
          const newTx = new TransactionBuilder(freshAccount, {
            fee: prepared.fee,
            networkPassphrase: this.network.networkPassphrase,
          })
            .addOperation(newOp)
            .setTimeout(30)
            .build();

          const newPrepared = await this.rpcServer.prepareTransaction(newTx);
          const signedTxXdr = await signTransaction({
            unsignedTransaction: newPrepared.toXDR(),
            address: signerAddress,
          });

          const signedTransaction = TransactionBuilder.fromXDR(
            signedTxXdr,
            this.network.networkPassphrase
          );

          const sendResponse =
            await this.rpcServer.sendTransaction(signedTransaction);

          if (sendResponse.status === "ERROR") {
            throw new Error("Transaction failed");
          }

          if (sendResponse.status === "PENDING" && sendResponse.hash) {
            return await this.waitForConfirmation(sendResponse.hash);
          }

          return sendResponse.hash || "";
        }
      }
    }

    // No auth entries, sign normally
    // Use sourceAddress if provided, otherwise use walletAddress
    const signerAddress = sourceAddress || walletAddress;
    const signedTxXdr = await signTransaction({
      unsignedTransaction: prepared.toXDR(),
      address: signerAddress,
    });

    const signedTransaction = TransactionBuilder.fromXDR(
      signedTxXdr,
      this.network.networkPassphrase
    );

    const sendResponse =
      await this.rpcServer.sendTransaction(signedTransaction);

    if (sendResponse.status === "ERROR") {
      throw new Error("Transaction failed");
    }

    if (sendResponse.status === "PENDING" && sendResponse.hash) {
      return await this.waitForConfirmation(sendResponse.hash);
    }

    return sendResponse.hash || "";
  }

  /**
   * Wait for transaction confirmation
   */
  private async waitForConfirmation(hash: string): Promise<string> {
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds

    while (attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 1000));

      try {
        const txStatus = await this.rpcServer.getTransaction(hash);

        if (txStatus.status === "SUCCESS") {
          return hash;
        }

        if (txStatus.status === "ERROR") {
          throw new Error("Transaction failed");
        }

        // If status is NOT_FOUND, transaction might still be processing
        // Continue waiting
        if (txStatus.status === "NOT_FOUND") {
          attempts++;
          continue;
        }

        // If status is PENDING, continue waiting
        if (txStatus.status === "PENDING") {
          attempts++;
          continue;
        }

        attempts++;
      } catch (error) {
        // If error is about transaction not found, continue waiting
        if (error instanceof Error && error.message.includes("not found")) {
          attempts++;
          continue;
        }
        console.warn("Error checking transaction status:", error);
        attempts++;
      }
    }

    throw new Error("Transaction still pending after waiting");
  }
}

// Export singleton instance
export const contractService = new ContractService();
