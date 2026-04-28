import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { motion } from "framer-motion";
import { Clock, DollarSign, ChevronDown, ChevronUp, Star, AlertTriangle, CalendarPlus, Scale, Paperclip, MessageCircle } from "lucide-react";
import { MilestoneActions } from "@/components/milestone-actions";
import { parseAttachment } from "@/lib/utils";
import { RatingDialog } from "@/components/rating/rating-dialog";
import { ChatDialog } from "@/components/chat/chat-dialog";
import { useState, useEffect } from "react";
import { contractService } from "@/lib/web3/contract-service";
import { useWeb3 } from "@/contexts/web3-context";
import { isApiConfigured } from "@/lib/api";
import type { Escrow } from "@/lib/web3/types";


interface EscrowCardProps {
  escrow: Escrow;
  index: number;
  expandedEscrow: string | null;
  submittingMilestone: string | null;
  onToggleExpanded: (escrowId: string) => void;
  onApproveMilestone: (escrowId: string, milestoneIndex: number) => void;
  onRejectMilestone: (escrowId: string, milestoneIndex: number) => void;
  onDisputeMilestone: (escrowId: string, milestoneIndex: number) => void;
  onStartWork: (escrowId: string) => void;
  onDispute: (escrowId: string) => void;
  calculateDaysLeft: (createdAt: number, duration: number) => number;
  getDaysLeftMessage: (daysLeft: number) => {
    text: string;
    color: string;
    bgColor: string;
  };
  onRaiseOverdueDispute?: (escrowId: string, reason: string) => void;
  onExtendDeadline?: (escrowId: string, extraDays: number) => void;
}

export function EscrowCard({
  escrow,
  index,
  expandedEscrow,
  onToggleExpanded,
  calculateDaysLeft,
  getDaysLeftMessage,
  onRaiseOverdueDispute,
  onExtendDeadline,
}: EscrowCardProps) {
  const [showRatingDialog, setShowRatingDialog] = useState(false);
  const [hasRating, setHasRating] = useState(false);
  const [existingRating, setExistingRating] = useState<{
    rating: number;
    review: string;
  } | null>(null);
  const [chatOpen, setChatOpen] = useState(false);

  const [customDays, setCustomDays] = useState("");
  const [disputeReason, setDisputeReason] = useState("");
  const [showDisputeForm, setShowDisputeForm] = useState(false);

  const { wallet } = useWeb3();

  const now = Date.now();
  const deadlineAt = escrow.deadlineAt ?? 0;
  const isOverdue = deadlineAt > 0 && now > deadlineAt;
  const isActive = escrow.status === "active" || escrow.status === "pending";
  const isSettled =
    escrow.status === "completed" ||
    (escrow as any).status === "refunded" ||
    (escrow as any).status === "expired";

  // Check if rating exists for this escrow
  useEffect(() => {
    if (escrow.status === "completed" && escrow.isClient) {
      contractService
        .getRating(Number.parseInt(escrow.id, 10))
        .then((rating) => {
          if (rating) {
            setHasRating(true);
            setExistingRating({
              rating: rating.rating,
              review: rating.review,
            });
          }
        })
        .catch((error) => {
        });
    }
  }, [escrow.id, escrow.status, escrow.isClient]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "active":
        return "bg-blue-100 text-blue-800";
      case "completed":
        return "bg-green-100 text-green-800";
      case "disputed":
        return "bg-red-100 text-red-800";
      case "resolved":
        return "bg-purple-100 text-purple-800";
      case "terminated":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  // Check if this escrow should be marked as terminated
  const isTerminated = escrow.milestones.some(
    (milestone) =>
      milestone.status === "disputed" ||
      milestone.status === "rejected" ||
      milestone.status === "resolved"
  );

  const getMilestoneStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "submitted":
        return "bg-blue-100 text-blue-800";
      case "approved":
        return "bg-green-100 text-green-800";
      case "disputed":
        return "bg-red-100 text-red-800";
      case "resolved":
        return "bg-purple-100 text-purple-800";
      case "rejected":
        return "bg-orange-100 text-orange-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const progressPercentage =
    escrow.totalAmount !== "0"
      ? (Number.parseFloat(escrow.releasedAmount) /
          Number.parseFloat(escrow.totalAmount)) *
        100
      : 0;

  const completedMilestones = escrow.milestones.filter(
    (m) => m.status === "approved"
  ).length;
  const totalMilestones = escrow.milestones.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.1 }}
    >
      <Card className="glass border-primary/20 p-4 md:p-6 hover:border-primary/40 transition-colors">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="text-lg mb-2">
                {escrow.projectDescription}
              </CardTitle>
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <div className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  <span>
                    {Math.round(escrow.duration / (24 * 60 * 60))} days
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <DollarSign className="h-4 w-4" />
                  <span>
                    {(Number.parseFloat(escrow.totalAmount) / 1e7).toFixed(2)}{" "}
                    tokens
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                className={getStatusColor(
                  isTerminated ? "terminated" : escrow.status
                )}
              >
                {isTerminated ? "terminated" : escrow.status}
              </Badge>
              {/* Message Freelancer — visible to client when a freelancer is assigned */}
              {escrow.isClient && escrow.beneficiary && wallet.address && isApiConfigured() && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => setChatOpen(true)}
                  title="Message freelancer"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  Message
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onToggleExpanded(escrow.id)}
                className="cursor-pointer"
              >
                {expandedEscrow === escrow.id ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between text-sm mb-2">
                <span>Progress</span>
                <span>
                  {completedMilestones}/{totalMilestones} milestones
                </span>
              </div>
              <Progress value={progressPercentage} className="h-2" />
            </div>

            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Total Amount:</span>
                <div className="font-semibold">
                  {(Number.parseFloat(escrow.totalAmount) / 1e7).toFixed(2)}{" "}
                  tokens
                </div>
              </div>
              <div>
                <span className="text-gray-600">Released:</span>
                <div className="font-semibold">
                  {(Number.parseFloat(escrow.releasedAmount) / 1e7).toFixed(2)}{" "}
                  tokens
                </div>
              </div>
              <div>
                <span className="text-gray-600">Days Left:</span>
                <div className="font-semibold flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  {(() => {
                    const daysLeft = calculateDaysLeft(
                      escrow.createdAt,
                      escrow.duration
                    );
                    const message = getDaysLeftMessage(daysLeft);
                    return (
                      <span className={message.color}>{message.text}</span>
                    );
                  })()}
                </div>
              </div>
            </div>

            {expandedEscrow === escrow.id && (
              <div className="space-y-4 pt-4 border-t">
                <div className="space-y-2">
                  <h4 className="font-medium">Milestones:</h4>
                  {escrow.milestones.map((milestone, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 bg-muted/20 rounded"
                    >
                      <div className="flex-1">
                        {(() => {
                          const { body, attachment } = parseAttachment(milestone.description ?? "");
                          return (
                            <>
                              <p className="text-sm font-medium">{body}</p>
                              {attachment && (
                                <a
                                  href={attachment.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 mt-1 text-xs text-primary hover:underline"
                                >
                                  <Paperclip className="h-3 w-3 shrink-0" />
                                  {attachment.name}
                                </a>
                              )}
                            </>
                          );
                        })()}
                        <p className="text-xs text-muted-foreground">
                          {(Number.parseFloat(milestone.amount) / 1e7).toFixed(
                            2
                          )}{" "}
                          tokens
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          className={getMilestoneStatusColor(milestone.status)}
                        >
                          {milestone.status}
                        </Badge>
                        <MilestoneActions
                          escrowId={escrow.id}
                          milestoneIndex={idx}
                          milestone={milestone}
                          isPayer={escrow.isClient || false}
                          isBeneficiary={escrow.isFreelancer || false}
                          escrowStatus={escrow.status}
                          allMilestones={escrow.milestones}
                          showSubmitButton={false} // Hide submit buttons on dashboard
                          payerAddress={escrow.payer} // Client address for notifications
                          beneficiaryAddress={escrow.beneficiary} // Freelancer address for notifications
                          escrowReleasedAmount={escrow.releasedAmount}
                          escrowTotalAmount={escrow.totalAmount}
                          onSuccess={async () => {
                            // Refresh the escrow data
                            window.dispatchEvent(
                              new CustomEvent("escrowUpdated")
                            );
                            // Wait a moment for blockchain state to update
                            await new Promise((resolve) =>
                              setTimeout(resolve, 2000)
                            );
                            // Trigger refresh without reloading the page
                            // The parent component should listen to the event and refresh
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Overdue actions — visible to BOTH client and freelancer */}
            {isOverdue && isActive && !isSettled && (escrow.isClient || escrow.isFreelancer) && (
              <div className="mt-4 pt-4 border-t border-orange-200 dark:border-orange-800 space-y-3">
                <div className="flex items-start gap-2 p-3 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700">
                  <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400 shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-orange-700 dark:text-orange-400">
                      Project deadline has passed
                    </p>
                    <p className="text-orange-600/80 dark:text-orange-400/70 text-xs mt-0.5">
                      {escrow.isClient
                        ? "You may extend the deadline to give the freelancer more time, or raise a dispute for arbiter review."
                        : "If the client is unresponsive, you can raise a dispute so an arbiter reviews the situation fairly."}
                    </p>
                  </div>
                </div>

                {/* Client: extend with custom days */}
                {escrow.isClient && onExtendDeadline && (
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <Label className="text-xs mb-1 block text-muted-foreground">
                        Extend by (days)
                      </Label>
                      <Input
                        type="number"
                        min={1}
                        max={90}
                        placeholder="e.g. 7"
                        value={customDays}
                        onChange={(e) => setCustomDays(e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 shrink-0"
                      disabled={!customDays || Number(customDays) < 1}
                      onClick={() => {
                        const days = parseInt(customDays, 10);
                        if (days > 0) {
                          onExtendDeadline(escrow.id, days);
                          setCustomDays("");
                        }
                      }}
                    >
                      <CalendarPlus className="h-3.5 w-3.5" />
                      Extend
                    </Button>
                  </div>
                )}

                {/* Both: request arbitration */}
                {onRaiseOverdueDispute && (
                  <div>
                    {!showDisputeForm ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 w-full border-red-300 dark:border-red-700 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                        onClick={() => setShowDisputeForm(true)}
                      >
                        <Scale className="h-3.5 w-3.5" />
                        Request Arbitration
                      </Button>
                    ) : (
                      <div className="space-y-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700">
                        <p className="text-xs font-medium text-red-700 dark:text-red-400">
                          State your case — arbiters will review both sides
                        </p>
                        <Textarea
                          rows={3}
                          placeholder="Describe the situation clearly — what work was done, what's missing, and what outcome you're requesting..."
                          value={disputeReason}
                          onChange={(e) => setDisputeReason(e.target.value)}
                          className="text-sm"
                        />
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setShowDisputeForm(false);
                              setDisputeReason("");
                            }}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={!disputeReason.trim()}
                            onClick={() => {
                              onRaiseOverdueDispute(escrow.id, disputeReason);
                              setShowDisputeForm(false);
                              setDisputeReason("");
                            }}
                          >
                            Submit to Arbiters
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Rating Section for Completed Escrows */}
            {escrow.status === "completed" && escrow.isClient && (
              <div className="mt-4 pt-4 border-t">
                {hasRating ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                      <span className="font-medium">
                        Your Rating: {existingRating?.rating}/5
                      </span>
                    </div>
                    {existingRating?.review && (
                      <div className="bg-muted/20 rounded-lg p-3 text-sm">
                        {existingRating.review}
                      </div>
                    )}
                  </div>
                ) : (
                  <Button
                    onClick={() => setShowRatingDialog(true)}
                    variant="outline"
                    size="sm"
                    className="w-full"
                  >
                    <Star className="h-4 w-4 mr-2" />
                    Rate Freelancer
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Chat Dialog */}
      {chatOpen && escrow.beneficiary && wallet.address && (
        <ChatDialog
          open={chatOpen}
          onOpenChange={setChatOpen}
          myAddress={wallet.address}
          otherAddress={escrow.beneficiary}
        />
      )}

      {/* Rating Dialog */}
      {escrow.status === "completed" && escrow.beneficiary && (
        <RatingDialog
          open={showRatingDialog}
          onOpenChange={setShowRatingDialog}
          escrowId={Number.parseInt(escrow.id, 10)}
          freelancerAddress={escrow.beneficiary}
          onRatingSubmitted={async () => {
            setHasRating(true);
            // Refresh rating data for this escrow only
            try {
              const rating = await contractService.getRating(
                Number.parseInt(escrow.id, 10)
              );
              if (rating) {
                setExistingRating({
                  rating: rating.rating,
                  review: rating.review,
                });
              }
            } catch (error) {
            }
          }}
        />
      )}
    </motion.div>
  );
}
