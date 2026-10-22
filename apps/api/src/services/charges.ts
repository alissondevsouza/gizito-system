import {
  type ApiErrorCode,
  type ConfirmOrderInput,
  type CreatedCharge,
  chargeExpireDatetime,
  checkConfirmedTopics,
  err,
  errorNameOf,
  type Grade,
  isChargeActive,
  KIT_PRICE_CENTS,
  type OrderStatus,
  type OrderView,
  ok,
  type PaymentGateway,
  PaymentGatewayError,
  publicTokenSchema,
  type Result,
  type Subject,
  transitionOrder,
  type UnsupportedTopicView,
  unsupportedTopicList,
} from "@gizito/core";
import { charge, type Executor, enqueueJob, order } from "@gizito/db";
import { eq } from "drizzle-orm";
import {
  getOrderView,
  listOrderCharges,
  type OrderServiceDependencies,
  type OrderServiceError,
} from "#src/services/orders.ts";

export const ORPHAN_CHARGE_LOG_MESSAGE = "cobrança órfã no gateway";

export type ChargeServiceErrorCode = Extract<
  ApiErrorCode,
  | "order_not_found"
  | "invalid_state"
  | "validation_error"
  | "unsupported_topic"
  | "charge_active"
  | "service_unavailable"
>;

export type ChargeServiceError =
  | { readonly code: Exclude<ChargeServiceErrorCode, "unsupported_topic"> }
  | {
      readonly code: "unsupported_topic";
      readonly unsupportedTopicList: readonly UnsupportedTopicView[];
    };

export type ChargeCreationLock = Set<string>;

export function createChargeCreationLock(): ChargeCreationLock {
  return new Set<string>();
}

export type ChargeServiceDependencies = OrderServiceDependencies & {
  readonly paymentGateway: PaymentGateway;
  readonly chargeCreationLock: ChargeCreationLock;
};

export type ConfirmOrderRequest = {
  readonly publicToken: string;
  readonly input: ConfirmOrderInput;
};

type ChargeOrderRow = {
  readonly orderId: string;
  readonly status: OrderStatus;
  readonly grade: Grade;
  readonly subject: Subject;
  readonly email: string | null;
};

type ChargeOutcome = {
  readonly orderId: string;
  readonly chargeId?: string;
  readonly gatewayOrderId?: string;
  readonly startTime: number;
  readonly errorCode?: string;
  readonly errorName?: string;
};

function logChargeOutcome(
  { logger }: ChargeServiceDependencies,
  level: "info" | "warn",
  message: string,
  { startTime, ...fieldMap }: ChargeOutcome,
): void {
  logger[level]({ ...fieldMap, durationMs: Math.round(performance.now() - startTime) }, message);
}

async function findChargeOrder(
  executor: Executor,
  publicToken: string,
): Promise<ChargeOrderRow | null> {
  const parsedToken = publicTokenSchema.safeParse(publicToken);
  if (!parsedToken.success) return null;
  const [row] = await executor
    .select({
      orderId: order.orderId,
      status: order.status,
      grade: order.grade,
      subject: order.subject,
      email: order.email,
    })
    .from(order)
    .where(eq(order.publicToken, parsedToken.data));
  return row ?? null;
}

async function lockOrderStatus(executor: Executor, orderId: string): Promise<OrderStatus | null> {
  const [row] = await executor
    .select({ status: order.status })
    .from(order)
    .where(eq(order.orderId, orderId))
    .for("update");
  return row?.status ?? null;
}

function unsupportedTopicViewListOf(
  unsupportedTopicIdList: readonly string[],
): UnsupportedTopicView[] {
  return unsupportedTopicIdList.flatMap((unsupportedTopicId) => {
    const topic = unsupportedTopicList.find(
      (candidate) => candidate.unsupportedTopicId === unsupportedTopicId,
    );
    return topic === undefined
      ? []
      : [{ unsupportedTopicId, label: topic.label, reason: topic.reason }];
  });
}

function chargeRowOf(
  paymentGateway: PaymentGateway,
  orderId: string,
  chargeId: string,
  created: CreatedCharge,
) {
  return {
    chargeId,
    orderId,
    gateway: paymentGateway.name,
    gatewayOrderId: created.gatewayOrderId,
    gatewayPaymentId: created.gatewayPaymentId,
    amountCents: KIT_PRICE_CENTS,
    status: "pending" as const,
    qrCode: created.qrCode,
    qrCodeBase64: created.qrCodeBase64,
    ticketUrl: created.ticketUrl,
    expireDatetime: created.expireDatetime,
  };
}

type CommitCharge = (
  tx: Executor,
  chargeId: string,
  created: CreatedCharge,
) => Promise<Result<void, ChargeServiceError>>;

type ChargeCreation = {
  readonly row: ChargeOrderRow;
  readonly payerEmail: string;
  readonly busyCode: "invalid_state" | "charge_active";
  readonly successMessage: string;
  readonly commit: CommitCharge;
};

async function createAndCommitCharge(
  dependencies: ChargeServiceDependencies,
  { row, payerEmail, busyCode, successMessage, commit }: ChargeCreation,
): Promise<Result<void, ChargeServiceError>> {
  const { db, paymentGateway, chargeCreationLock, now } = dependencies;
  const startTime = performance.now();
  const { orderId } = row;
  if (chargeCreationLock.has(orderId)) return err({ code: busyCode });
  chargeCreationLock.add(orderId);
  try {
    const chargeId = crypto.randomUUID();
    let created: CreatedCharge;
    try {
      created = await paymentGateway.createCharge({
        chargeId,
        orderId,
        amountCents: KIT_PRICE_CENTS,
        payerEmail,
        expireDatetime: chargeExpireDatetime(now()),
      });
    } catch (error) {
      if (!(error instanceof PaymentGatewayError)) throw error;
      logChargeOutcome(dependencies, "warn", "cobrança recusada pelo gateway", {
        orderId,
        chargeId,
        startTime,
        errorCode: error.code,
      });
      return err({ code: "service_unavailable" });
    }
    const outcome = { orderId, chargeId, gatewayOrderId: created.gatewayOrderId, startTime };
    let committed: Result<void, ChargeServiceError>;
    try {
      committed = await db.transaction((tx) => commit(tx, chargeId, created));
    } catch (error) {
      logChargeOutcome(dependencies, "warn", ORPHAN_CHARGE_LOG_MESSAGE, {
        ...outcome,
        errorCode: "internal_error",
        errorName: errorNameOf(error),
      });
      throw error;
    }
    if (!committed.ok) {
      logChargeOutcome(dependencies, "warn", ORPHAN_CHARGE_LOG_MESSAGE, {
        ...outcome,
        errorCode: committed.error.code,
      });
      return committed;
    }
    logChargeOutcome(dependencies, "info", successMessage, outcome);
    return ok(undefined);
  } finally {
    chargeCreationLock.delete(orderId);
  }
}

async function viewAfterCommit(
  dependencies: ChargeServiceDependencies,
  publicToken: string,
): Promise<Result<OrderView, ChargeServiceError>> {
  const view = await getOrderView(dependencies, publicToken);
  if (view.ok) return view;
  return err({ code: viewErrorCodeOf(view.error) });
}

function viewErrorCodeOf({ code }: OrderServiceError): "order_not_found" | "service_unavailable" {
  return code === "order_not_found" ? "order_not_found" : "service_unavailable";
}

export async function confirmOrder(
  dependencies: ChargeServiceDependencies,
  { publicToken, input }: ConfirmOrderRequest,
): Promise<Result<OrderView, ChargeServiceError>> {
  const { paymentGateway } = dependencies;
  const row = await findChargeOrder(dependencies.db, publicToken);
  if (row === null) return err({ code: "order_not_found" });
  if (row.status !== "preview_ready") return err({ code: "invalid_state" });
  const otherTopicText = input.otherTopicText ?? null;
  const topics = checkConfirmedTopics(
    { topicIdList: input.topicIdList, otherTopicText },
    row.grade,
    row.subject,
  );
  if (!topics.ok) {
    return topics.error.code === "invalid_topic"
      ? err({ code: "validation_error" })
      : err({
          code: "unsupported_topic",
          unsupportedTopicList: unsupportedTopicViewListOf(topics.error.unsupportedTopicIdList),
        });
  }
  const created = await createAndCommitCharge(dependencies, {
    row,
    payerEmail: input.email,
    busyCode: "invalid_state",
    successMessage: "pedido confirmado",
    commit: async (tx, chargeId, createdCharge) => {
      const status = await lockOrderStatus(tx, row.orderId);
      if (status === null) return err({ code: "order_not_found" });
      const transition = transitionOrder(status, "confirm");
      if (!transition.ok) return err({ code: "invalid_state" });
      await tx
        .update(order)
        .set({
          status: transition.value,
          email: input.email,
          topicIdList: [...input.topicIdList],
          otherTopicText,
          noteText: input.noteText ?? null,
          perceivedDifficulty: input.perceivedDifficulty ?? null,
        })
        .where(eq(order.orderId, row.orderId));
      await tx
        .insert(charge)
        .values(chargeRowOf(paymentGateway, row.orderId, chargeId, createdCharge));
      await enqueueJob(tx, { name: "order.notify", orderId: row.orderId, kind: "order_link" });
      return ok(undefined);
    },
  });
  if (!created.ok) return created;
  return viewAfterCommit(dependencies, publicToken);
}

export async function renewCharge(
  dependencies: ChargeServiceDependencies,
  publicToken: string,
): Promise<Result<OrderView, ChargeServiceError>> {
  const { db, paymentGateway, now } = dependencies;
  const row = await findChargeOrder(db, publicToken);
  if (row === null) return err({ code: "order_not_found" });
  if (row.status !== "awaiting_payment" || row.email === null) {
    return err({ code: "invalid_state" });
  }
  const hasActiveCharge = (chargeList: Awaited<ReturnType<typeof listOrderCharges>>) =>
    chargeList.some((existing) => isChargeActive(existing, now()));
  if (hasActiveCharge(await listOrderCharges(db, row.orderId))) {
    return err({ code: "charge_active" });
  }
  const created = await createAndCommitCharge(dependencies, {
    row,
    payerEmail: row.email,
    busyCode: "charge_active",
    successMessage: "pix renovado",
    commit: async (tx, chargeId, createdCharge) => {
      const status = await lockOrderStatus(tx, row.orderId);
      if (status === null) return err({ code: "order_not_found" });
      if (status !== "awaiting_payment") return err({ code: "invalid_state" });
      if (hasActiveCharge(await listOrderCharges(tx, row.orderId))) {
        return err({ code: "charge_active" });
      }
      await tx
        .insert(charge)
        .values(chargeRowOf(paymentGateway, row.orderId, chargeId, createdCharge));
      return ok(undefined);
    },
  });
  if (!created.ok) return created;
  return viewAfterCommit(dependencies, publicToken);
}
