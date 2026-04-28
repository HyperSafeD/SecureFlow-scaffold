import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWeb3 } from "@/contexts/web3-context";
import { useAdminStatus } from "@/hooks/use-admin-status";
import { DisputeResolution } from "@/components/admin/dispute-resolution";
import { OverdueDisputeResolution } from "@/components/admin/overdue-dispute-resolution";
import {
  Scale,
  ArrowLeft,
  ShieldOff,
  Loader2,
  AlertTriangle,
  Clock,
} from "lucide-react";

export default function DisputesPage() {
  const { wallet } = useWeb3();
  const { isAdmin, isOwner, isArbiter, loading } = useAdminStatus();
  const navigate = useNavigate();

  // Redirect to admin page if wallet not connected (they can connect from admin)
  useEffect(() => {
    if (!wallet.isConnected && !loading) {
      navigate("/admin");
    }
  }, [wallet.isConnected, loading, navigate]);

  /* ── Loading state ── */
  if (loading || !wallet.isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-mesh">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm">Checking access…</p>
        </div>
      </div>
    );
  }

  /* ── Access denied ── */
  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-mesh p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          <Card className="glass border-destructive/30 p-10 text-center max-w-md w-full">
            <ShieldOff className="h-14 w-14 mx-auto mb-4 text-destructive opacity-70" />
            <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
            <p className="text-muted-foreground mb-6">
              Only authorized arbiters and the contract owner can view and
              resolve disputes.
            </p>
            <div className="text-xs font-mono bg-muted/40 rounded p-2 mb-6 break-all">
              {wallet.address}
            </div>
            <Button asChild variant="outline">
              <Link to="/admin">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Admin
              </Link>
            </Button>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-mesh py-10">
      <div className="container mx-auto px-4 max-w-5xl space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-4"
        >
          <Button asChild variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
            <Link to="/admin">
              <ArrowLeft className="h-4 w-4" />
              Admin
            </Link>
          </Button>
          <div className="flex-1 flex items-center gap-3">
            <Scale className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Dispute Centre</h1>
            <div className="flex gap-2">
              {isOwner && (
                <Badge className="bg-primary/10 text-primary border-primary/20">
                  Owner
                </Badge>
              )}
              {isArbiter && (
                <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200 dark:border-orange-700/40">
                  Arbiter
                </Badge>
              )}
            </div>
          </div>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="text-muted-foreground text-sm"
        >
          Review all active disputes, examine both sides of each case, and issue
          a binding on-chain resolution. Both parties are notified automatically
          once you act.
        </motion.p>

        {/* Tabs: Milestone disputes | Overdue project disputes */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <Tabs defaultValue="milestone">
            <TabsList className="mb-6 w-full sm:w-auto">
              <TabsTrigger value="milestone" className="gap-2">
                <AlertTriangle className="h-4 w-4" />
                Milestone Disputes
              </TabsTrigger>
              <TabsTrigger value="overdue" className="gap-2">
                <Clock className="h-4 w-4" />
                Overdue Projects
              </TabsTrigger>
            </TabsList>

            <TabsContent value="milestone">
              <DisputeResolution onDisputeResolved={() => {}} />
            </TabsContent>

            <TabsContent value="overdue">
              <OverdueDisputeResolution />
            </TabsContent>
          </Tabs>
        </motion.div>
      </div>
    </div>
  );
}
