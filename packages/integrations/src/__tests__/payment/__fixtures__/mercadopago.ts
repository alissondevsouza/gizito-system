export const GATEWAY_ORDER_ID = "ORD01JP84C939T20S0P1DN382FQ6K";
export const GATEWAY_PAYMENT_ID = "PAY01JP84C939T20S0P1DN6FCMWQC";
export const PIX_QR_CODE =
  "00020126580014br.gov.bcb.pix0136b76aa9c2-2ec4-4110-954e-ebfe34f05b615204000053039865405029.905802BR5918TESTUSER20543760926009Sao Paulo62250521mpqrinter1046697480436304B70B";
export const PIX_QR_CODE_BASE64 = "iVBORw0KGgoAAAANSUhEUgAABWQAAAVkAQAAAAB79i";
export const TICKET_URL =
  "https://www.mercadopago.com.br/sandbox/payments/104669748043/ticket?caller_id=1985141462&hash=1eff4445-4454-4308-a6b0-d2a1651ca44f";

export function createdOrderResponse({
  externalReference,
  qrCodeBase64 = PIX_QR_CODE_BASE64,
  ticketUrl = TICKET_URL,
}: {
  externalReference: string;
  qrCodeBase64?: string;
  ticketUrl?: string;
}) {
  return {
    id: GATEWAY_ORDER_ID,
    type: "online",
    processing_mode: "automatic",
    external_reference: externalReference,
    total_amount: "29.90",
    country_code: "BRA",
    user_id: "123456",
    status: "action_required",
    status_detail: "waiting_transfer",
    capture_mode: "automatic",
    created_date: "2026-10-22T12:00:00.826Z",
    last_updated_date: "2026-10-22T12:00:01.736Z",
    integration_data: { application_id: "123456789" },
    transactions: {
      payments: [
        {
          id: GATEWAY_PAYMENT_ID,
          amount: "29.90",
          reference_id: "0002gw9x2v",
          status: "action_required",
          status_detail: "waiting_transfer",
          payment_method: {
            id: "pix",
            type: "bank_transfer",
            ticket_url: ticketUrl,
            qr_code: PIX_QR_CODE,
            qr_code_base64: qrCodeBase64,
          },
        },
      ],
    },
  };
}

export function orderStatusResponse({
  externalReference,
  status,
  statusDetail,
  totalAmount = "29.90",
  lastUpdatedDate = "2026-10-22T12:04:42.109320977Z",
}: {
  externalReference: string;
  status: string;
  statusDetail: string;
  totalAmount?: string;
  lastUpdatedDate?: string;
}) {
  return {
    id: GATEWAY_ORDER_ID,
    type: "online",
    external_reference: externalReference,
    total_amount: totalAmount,
    total_paid_amount: status === "processed" ? totalAmount : "0.00",
    status,
    status_detail: statusDetail,
    created_date: "2026-10-22T12:00:00.826Z",
    last_updated_date: lastUpdatedDate,
    transactions: {
      payments: [
        {
          id: GATEWAY_PAYMENT_ID,
          amount: totalAmount,
          paid_amount: status === "processed" ? totalAmount : "0.00",
          status,
          status_detail: statusDetail,
          payment_method: { id: "pix", type: "bank_transfer" },
        },
      ],
      refunds: [],
    },
  };
}

export const canceledOrderResponse = {
  id: GATEWAY_ORDER_ID,
  type: "online",
  external_reference: "22222222-2222-4222-8222-222222222222",
  total_amount: "29.90",
  status: "canceled",
  status_detail: "canceled_transaction",
  created_date: "2026-10-22T12:00:00.826Z",
  last_updated_date: "2026-10-22T12:06:10.109320977Z",
  transactions: {
    payments: [
      {
        id: GATEWAY_PAYMENT_ID,
        amount: "29.90",
        status: "canceled",
        status_detail: "canceled_transaction",
        payment_method: { id: "pix", type: "bank_transfer" },
      },
    ],
  },
};

export const REFUND_ID = "REF01J67CQQH5904WDBVZEM1234D";

export const refundResponse = {
  id: GATEWAY_ORDER_ID,
  status: "refunded",
  status_detail: "refunded",
  transactions: {
    refunds: [
      {
        id: REFUND_ID,
        transaction_id: GATEWAY_PAYMENT_ID,
        amount: "29.90",
        status: "processing",
        reference_id: "0002gw9x2v",
      },
    ],
  },
};

export function errorResponse(code: string) {
  return { errors: [{ code, message: "mensagem do fornecedor", details: [] }] };
}

export const WEBHOOK_REQUEST_ID = "2066ca19-c6f1-498a-be75-1923005edd06";
export const WEBHOOK_TS = "1742505638683";

export function orderWebhookBody(action: string) {
  return {
    action,
    api_version: "v1",
    application_id: "7255333517291496",
    data: { id: GATEWAY_ORDER_ID, status: "processed", status_detail: "accredited" },
    date_created: "2026-10-22T12:05:02.736053815Z",
    live_mode: false,
    type: "order",
    user_id: "11111111",
  };
}
