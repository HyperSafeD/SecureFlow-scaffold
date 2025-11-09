/**
 * Custom hooks for escrow operations
 * Following the pattern from Pacto P2P
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { contractService, type EscrowData } from "@/lib/web3/contract-service";
import useWalletStore from "@/store/wallet.store";
import { toast } from "@/hooks/use-toast";

/**
 * Hook to fetch a single escrow by ID
 */
export function useEscrow(escrowId: number | null) {
  return useQuery({
    queryKey: ["escrow", escrowId],
    queryFn: () => {
      if (!escrowId) {
        throw new Error("Escrow ID is required");
      }
      return contractService.getEscrow(escrowId);
    },
    enabled: !!escrowId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Hook to fetch user's escrows
 */
export function useUserEscrows() {
  const { address } = useWalletStore();

  return useQuery({
    queryKey: ["user-escrows", address],
    queryFn: () => {
      if (!address) {
        throw new Error("Wallet address is required");
      }
      return contractService.getUserEscrows(address);
    },
    enabled: !!address,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Hook to fetch multiple escrows by IDs
 */
export function useEscrows(escrowIds: number[]) {
  return useQuery({
    queryKey: ["escrows", escrowIds],
    queryFn: async () => {
      const escrows = await Promise.all(
        escrowIds.map((id) => contractService.getEscrow(id))
      );
      return escrows.filter((e): e is EscrowData => e !== null);
    },
    enabled: escrowIds.length > 0,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Hook to create a new escrow
 */
export function useCreateEscrow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      depositor: string; // Add depositor as a required parameter
      beneficiary?: string;
      arbiters: string[];
      required_confirmations: number;
      milestones: Array<[string, string]>; // [amount, description]
      token?: string;
      total_amount: string;
      duration: number;
      project_title: string;
      project_description: string;
    }) => {
      if (!params.depositor) {
        throw new Error("Wallet not connected");
      }
      return contractService.createEscrow({
        depositor: params.depositor,
        beneficiary: params.beneficiary,
        arbiters: params.arbiters,
        required_confirmations: params.required_confirmations,
        milestones: params.milestones,
        token: params.token,
        total_amount: params.total_amount,
        duration: params.duration,
        project_title: params.project_title,
        project_description: params.project_description,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-escrows"] });
      queryClient.invalidateQueries({ queryKey: ["escrows"] });
      toast({
        title: "Escrow created",
        description: "Your escrow has been created successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create escrow",
        variant: "destructive",
      });
    },
  });
}

/**
 * Hook to start work on an escrow
 */
export function useStartWork() {
  const queryClient = useQueryClient();
  const { address } = useWalletStore();

  return useMutation({
    mutationFn: (escrowId: number) => {
      if (!address) {
        throw new Error("Wallet not connected");
      }
      return contractService.startWork(escrowId, address);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["escrow"] });
      queryClient.invalidateQueries({ queryKey: ["user-escrows"] });
      toast({
        title: "Work started",
        description: "Work has been started on this escrow",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start work",
        variant: "destructive",
      });
    },
  });
}

/**
 * Hook to submit a milestone
 */
export function useSubmitMilestone() {
  const queryClient = useQueryClient();
  const { address } = useWalletStore();

  return useMutation({
    mutationFn: (params: {
      escrow_id: number;
      milestone_index: number;
      description: string;
    }) => {
      if (!address) {
        throw new Error("Wallet not connected");
      }
      return contractService.submitMilestone({
        ...params,
        beneficiary: address,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["escrow"] });
      queryClient.invalidateQueries({ queryKey: ["user-escrows"] });
      toast({
        title: "Milestone submitted",
        description: "Your milestone has been submitted for review",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to submit milestone",
        variant: "destructive",
      });
    },
  });
}

/**
 * Hook to approve a milestone
 */
export function useApproveMilestone() {
  const queryClient = useQueryClient();
  const { address } = useWalletStore();

  return useMutation({
    mutationFn: (params: { escrow_id: number; milestone_index: number }) => {
      if (!address) {
        throw new Error("Wallet not connected");
      }
      return contractService.approveMilestone({
        ...params,
        depositor: address,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["escrow"] });
      queryClient.invalidateQueries({ queryKey: ["user-escrows"] });
      toast({
        title: "Milestone approved",
        description: "The milestone has been approved",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to approve milestone",
        variant: "destructive",
      });
    },
  });
}

/**
 * Hook to refund an escrow
 */
export function useRefundEscrow() {
  const queryClient = useQueryClient();
  const { address } = useWalletStore();

  return useMutation({
    mutationFn: (escrowId: number) => {
      if (!address) {
        throw new Error("Wallet not connected");
      }
      return contractService.refundEscrow(escrowId, address);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["escrow"] });
      queryClient.invalidateQueries({ queryKey: ["user-escrows"] });
      toast({
        title: "Escrow refunded",
        description: "The escrow has been refunded",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to refund escrow",
        variant: "destructive",
      });
    },
  });
}

/**
 * Hook to apply to a job
 */
export function useApplyToJob() {
  const queryClient = useQueryClient();
  const { address } = useWalletStore();

  return useMutation({
    mutationFn: (params: {
      escrow_id: number;
      cover_letter: string;
      proposed_timeline: number;
    }) => {
      if (!address) {
        throw new Error("Wallet not connected");
      }
      return contractService.applyToJob({
        ...params,
        freelancer: address,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["escrow"] });
      queryClient.invalidateQueries({ queryKey: ["user-escrows"] });
      toast({
        title: "Application submitted",
        description: "Your application has been submitted",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to apply to job",
        variant: "destructive",
      });
    },
  });
}

/**
 * Hook to accept a freelancer
 */
export function useAcceptFreelancer() {
  const queryClient = useQueryClient();
  const { address } = useWalletStore();

  return useMutation({
    mutationFn: (params: { escrow_id: number; freelancer: string }) => {
      if (!address) {
        throw new Error("Wallet not connected");
      }
      return contractService.acceptFreelancer({
        ...params,
        depositor: address,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["escrow"] });
      queryClient.invalidateQueries({ queryKey: ["user-escrows"] });
      toast({
        title: "Freelancer accepted",
        description: "The freelancer has been accepted",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to accept freelancer",
        variant: "destructive",
      });
    },
  });
}

/**
 * Hook to extend deadline
 */
export function useExtendDeadline() {
  const queryClient = useQueryClient();
  const { address } = useWalletStore();

  return useMutation({
    mutationFn: (params: { escrow_id: number; extra_seconds: number }) => {
      if (!address) {
        throw new Error("Wallet not connected");
      }
      return contractService.extendDeadline({
        ...params,
        depositor: address,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["escrow"] });
      queryClient.invalidateQueries({ queryKey: ["user-escrows"] });
      toast({
        title: "Deadline extended",
        description: "The deadline has been extended",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to extend deadline",
        variant: "destructive",
      });
    },
  });
}

/**
 * Hook to emergency refund after deadline
 */
export function useEmergencyRefund() {
  const queryClient = useQueryClient();
  const { address } = useWalletStore();

  return useMutation({
    mutationFn: (escrowId: number) => {
      if (!address) {
        throw new Error("Wallet not connected");
      }
      return contractService.emergencyRefundAfterDeadline(escrowId, address);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["escrow"] });
      queryClient.invalidateQueries({ queryKey: ["user-escrows"] });
      toast({
        title: "Emergency refund executed",
        description: "The emergency refund has been executed",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to execute emergency refund",
        variant: "destructive",
      });
    },
  });
}
