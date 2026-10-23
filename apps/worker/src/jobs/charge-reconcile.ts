import {
  CHARGE_RECONCILE_BATCH_SIZE,
  CHARGE_RECONCILE_MIN_AGE_MINUTES,
  type ChargeReconciliationDecision,
  type ChargeStatusResult,
  decideChargeReconciliation,
  err,
  jobErrorCodeMap,
  type OutcomeCode,
  ok,
  type PaymentGateway,
  PaymentGatewayError,
  type Result,
} from "@gizito/core";
import {
  type ClaimedJob,
  type Database,
  type ExhaustedJobHandler,
  type ExpiredCharge,
  expireCharge,
  findChargeForReconcile,
  type JobFailure,
  type JobHandlerContext,
  listChargesToReconcile,
  listPendingOrderCharges,
  markOrderPaidAndEnqueue,
  markWebhookEventProcessed,
  type ReconcilableCharge,
} from "@gizito/db";
import type { Logger } from "@gizito/integrations";
import type { JobDefinition } from "#src/runner/lanes.ts";

export const RECONCILE_STAGE = "reconcile";
export const CANCEL_FAILED_ERROR_CODE = "cancel_failed";
export const GATEWAY_ORDER_MISSING_ERROR_CODE = "gateway_order_missing";
export const CHARGE_RECONCILED_LOG_MESSAGE = "cobrança reconciliada";
export const CHARGE_RECONCILE_SCAN_LOG_MESSAGE = "varredura de cobranças";

export type ChargeReconcileDependencies = {
  readonly db: Database;
  readonly paymentGateway: PaymentGateway;
  readonly logger: Logger;
  readonly now: () => Date;
};

type JobResult = Result<null, JobFailure>;

type ReconcileOutcome = {
  readonly outcome: OutcomeCode;
  readonly failure: JobFailure | null;
};

type ReconcileTarget = {
  readonly charge: ReconcilableCharge;
  readonly webhookEventId?: string;
};

type ScanSummary = {
  scannedCount: number;
  paidCount: number;
  expiredCount: number;
  pendingCount: number;
  errorCount: number;
};

export function createChargeReconcileJob(dependencies: ChargeReconcileDependencies): JobDefinition {
  const { db, paymentGateway, logger, now } = dependencies;

  async function markProcessed(webhookEventId: string | undefined, outcomeCode: OutcomeCode) {
    if (webhookEventId === undefined) return;
    await markWebhookEventProcessed(db, webhookEventId, { outcomeCode, now: now() });
  }

  async function cancelExpiredCharges(
    expiredChargeList: readonly ExpiredCharge[],
    orderId: string,
  ): Promise<void> {
    for (const expired of expiredChargeList) {
      if (expired.gatewayOrderId === null) continue;
      try {
        await paymentGateway.cancelCharge({
          chargeId: expired.chargeId,
          gatewayOrderId: expired.gatewayOrderId,
          gatewayPaymentId: expired.gatewayPaymentId,
        });
      } catch (error) {
        if (!(error instanceof PaymentGatewayError)) throw error;
        logger.warn(
          {
            orderId,
            chargeId: expired.chargeId,
            stage: RECONCILE_STAGE,
            errorCode: CANCEL_FAILED_ERROR_CODE,
            gatewayErrorCode: error.code,
          },
          "cancelamento do pix antigo falhou",
        );
      }
    }
  }

  async function confirmPayment(
    { charge, webhookEventId }: ReconcileTarget,
    statusResult: ChargeStatusResult,
    decision: Extract<ChargeReconciliationDecision, { kind: "confirm_payment" }>,
  ): Promise<ReconcileOutcome> {
    const confirmed = await db.transaction((tx) =>
      markOrderPaidAndEnqueue(
        tx,
        {
          orderId: charge.orderId,
          chargeId: charge.chargeId,
          gatewayPaymentId: decision.gatewayPaymentId,
          amountCents: statusResult.amountCents,
          paidDatetime: decision.paidDatetime,
          webhookEventId,
        },
        { now: now() },
      ),
    );
    if (!confirmed.ok) {
      await markProcessed(webhookEventId, confirmed.error.code);
      return {
        outcome: confirmed.error.code,
        failure: { errorCode: confirmed.error.code, retryable: false },
      };
    }
    if (confirmed.value.outcome === "paid") {
      await cancelExpiredCharges(confirmed.value.expiredChargeList, charge.orderId);
    }
    return { outcome: confirmed.value.outcome, failure: null };
  }

  async function applyDecision(
    target: ReconcileTarget,
    statusResult: ChargeStatusResult,
    decision: ChargeReconciliationDecision,
  ): Promise<ReconcileOutcome & { reason?: string }> {
    const { charge, webhookEventId } = target;
    switch (decision.kind) {
      case "confirm_payment":
        return confirmPayment(target, statusResult, decision);
      case "expire":
        await db.transaction(async (tx) => {
          await expireCharge(tx, charge.chargeId);
          if (webhookEventId !== undefined) {
            await markWebhookEventProcessed(tx, webhookEventId, {
              outcomeCode: "expired",
              now: now(),
            });
          }
        });
        return { outcome: "expired", failure: null };
      case "no_change":
        await markProcessed(webhookEventId, decision.outcome);
        return { outcome: decision.outcome, failure: null };
      case "mismatch":
        await markProcessed(webhookEventId, "payment_mismatch");
        return {
          outcome: "payment_mismatch",
          reason: decision.reason,
          failure: { errorCode: "payment_mismatch", retryable: false },
        };
    }
  }

  function logLevelOf(outcome: OutcomeCode, failure: JobFailure | null): "info" | "warn" | "error" {
    if (outcome === "duplicate_payment") return "error";
    if (failure !== null) return failure.retryable ? "warn" : "error";
    return outcome === "refunded" ? "warn" : "info";
  }

  async function reconcileCharge(target: ReconcileTarget): Promise<ReconcileOutcome> {
    const { charge, webhookEventId } = target;
    const startTime = performance.now();
    const base = {
      orderId: charge.orderId,
      chargeId: charge.chargeId,
      webhookEventId,
      stage: RECONCILE_STAGE,
    };
    const finish = (result: ReconcileOutcome & { reason?: string; gatewayStatus?: string }) => {
      const { failure, ...fieldMap } = result;
      logger[logLevelOf(result.outcome, failure)](
        {
          ...base,
          ...fieldMap,
          errorCode: failure?.errorCode,
          durationMs: Math.round(performance.now() - startTime),
        },
        CHARGE_RECONCILED_LOG_MESSAGE,
      );
      return { outcome: result.outcome, failure };
    };
    if (charge.gatewayOrderId === null) {
      await markProcessed(webhookEventId, GATEWAY_ORDER_MISSING_ERROR_CODE);
      return finish({
        outcome: GATEWAY_ORDER_MISSING_ERROR_CODE,
        failure: { errorCode: GATEWAY_ORDER_MISSING_ERROR_CODE, retryable: false },
      });
    }
    let statusResult: ChargeStatusResult;
    try {
      statusResult = await paymentGateway.getChargeStatus({
        chargeId: charge.chargeId,
        gatewayOrderId: charge.gatewayOrderId,
        gatewayPaymentId: charge.gatewayPaymentId,
      });
    } catch (error) {
      if (!(error instanceof PaymentGatewayError)) throw error;
      const retryable = error.code === "gateway_unavailable";
      if (!retryable) await markProcessed(webhookEventId, error.code);
      return finish({ outcome: error.code, failure: { errorCode: error.code, retryable } });
    }
    const decision = decideChargeReconciliation(charge, statusResult, now());
    const applied = await applyDecision(target, statusResult, decision);
    return finish({ ...applied, gatewayStatus: statusResult.status });
  }

  async function reconcileTargetList(
    targetList: readonly ReconcileTarget[],
    signal: AbortSignal,
  ): Promise<ReconcileOutcome[]> {
    const outcomeList: ReconcileOutcome[] = [];
    for (const target of targetList) {
      if (signal.aborted) break;
      outcomeList.push(await reconcileCharge(target));
    }
    return outcomeList;
  }

  function firstFailure(outcomeList: readonly ReconcileOutcome[]): JobResult {
    const failed = outcomeList.find((result) => result.failure !== null);
    return failed?.failure ? err(failed.failure) : ok(null);
  }

  async function handleTargetedCharge(
    orderId: string,
    chargeId: string,
    webhookEventId: string | undefined,
    signal: AbortSignal,
  ): Promise<JobResult> {
    const charge = await findChargeForReconcile(db, chargeId);
    if (charge === null || charge.orderId !== orderId) {
      await markProcessed(webhookEventId, "charge_not_found");
      logger.warn(
        {
          orderId,
          chargeId,
          webhookEventId,
          stage: RECONCILE_STAGE,
          errorCode: "charge_not_found",
        },
        CHARGE_RECONCILED_LOG_MESSAGE,
      );
      return ok(null);
    }
    return firstFailure(await reconcileTargetList([{ charge, webhookEventId }], signal));
  }

  async function handleOrder(
    orderId: string,
    webhookEventId: string | undefined,
    signal: AbortSignal,
  ): Promise<JobResult> {
    const chargeList = await listPendingOrderCharges(db, orderId);
    if (chargeList.length === 0) {
      await markProcessed(webhookEventId, "charge_not_found");
      logger.warn(
        { orderId, webhookEventId, stage: RECONCILE_STAGE, errorCode: "charge_not_found" },
        CHARGE_RECONCILED_LOG_MESSAGE,
      );
      return ok(null);
    }
    return firstFailure(
      await reconcileTargetList(
        chargeList.map((charge) => ({ charge, webhookEventId })),
        signal,
      ),
    );
  }

  async function handleScan(signal: AbortSignal): Promise<JobResult> {
    const startTime = performance.now();
    const chargeList = await listChargesToReconcile(db, {
      now: now(),
      minAgeMinutes: CHARGE_RECONCILE_MIN_AGE_MINUTES,
      limit: CHARGE_RECONCILE_BATCH_SIZE,
    });
    const outcomeList = await reconcileTargetList(
      chargeList.map((charge) => ({ charge })),
      signal,
    );
    const summary = outcomeList.reduce<ScanSummary>(
      (total, { outcome, failure }) => ({
        scannedCount: total.scannedCount + 1,
        paidCount: total.paidCount + (outcome === "paid" ? 1 : 0),
        expiredCount: total.expiredCount + (outcome === "expired" ? 1 : 0),
        pendingCount: total.pendingCount + (outcome === "pending" ? 1 : 0),
        errorCount: total.errorCount + (failure === null ? 0 : 1),
      }),
      { scannedCount: 0, paidCount: 0, expiredCount: 0, pendingCount: 0, errorCount: 0 },
    );
    logger.info(
      {
        ...summary,
        stage: RECONCILE_STAGE,
        aborted: signal.aborted,
        durationMs: Math.round(performance.now() - startTime),
      },
      CHARGE_RECONCILE_SCAN_LOG_MESSAGE,
    );
    return ok(null);
  }

  async function handle(claimedJob: ClaimedJob, context: JobHandlerContext): Promise<JobResult> {
    const { payload } = claimedJob;
    if (payload.name !== "charge.reconcile") {
      return err({ errorCode: jobErrorCodeMap.payloadInvalid, retryable: false });
    }
    const { orderId, chargeId, webhookEventId } = payload;
    if (orderId !== undefined && chargeId !== undefined) {
      return handleTargetedCharge(orderId, chargeId, webhookEventId, context.signal);
    }
    if (orderId !== undefined) return handleOrder(orderId, webhookEventId, context.signal);
    return handleScan(context.signal);
  }

  const onExhausted: ExhaustedJobHandler = async (tx, exhaustedJob) => {
    if (exhaustedJob.payload.name !== "charge.reconcile") return;
    const { webhookEventId } = exhaustedJob.payload;
    if (webhookEventId === undefined) return;
    await markWebhookEventProcessed(tx, webhookEventId, {
      outcomeCode: exhaustedJob.errorCode,
      now: now(),
    });
  };

  return { handle, onExhausted };
}
