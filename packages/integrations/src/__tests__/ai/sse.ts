export type RecordedMessage = {
  readonly model: string;
  readonly text: string;
  readonly stopReason: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheWriteTokens?: number;
  readonly cacheReadTokens?: number;
};

type EventEntry = readonly [string, unknown];

function sseBodyOf(eventList: readonly EventEntry[]): string {
  return eventList
    .map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    .join("");
}

export function messageSseResponse(message: RecordedMessage): Response {
  const eventList: readonly EventEntry[] = [
    [
      "message_start",
      {
        type: "message_start",
        message: {
          id: "msg_recorded",
          type: "message",
          role: "assistant",
          model: message.model,
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: {
            input_tokens: message.inputTokens,
            output_tokens: 1,
            cache_creation_input_tokens: message.cacheWriteTokens ?? 0,
            cache_read_input_tokens: message.cacheReadTokens ?? 0,
          },
        },
      },
    ],
    [
      "content_block_start",
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    ],
    [
      "content_block_delta",
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: message.text } },
    ],
    ["content_block_stop", { type: "content_block_stop", index: 0 }],
    [
      "message_delta",
      {
        type: "message_delta",
        delta: { stop_reason: message.stopReason, stop_sequence: null },
        usage: { output_tokens: message.outputTokens },
      },
    ],
    ["message_stop", { type: "message_stop" }],
  ];
  return new Response(sseBodyOf(eventList), {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

export function midStreamErrorResponse(errorType: string): Response {
  return new Response(
    sseBodyOf([
      [
        "message_start",
        {
          type: "message_start",
          message: {
            id: "msg_recorded",
            type: "message",
            role: "assistant",
            model: "claude-sonnet-5-5",
            content: [],
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 10, output_tokens: 1 },
          },
        },
      ],
      ["error", { type: "error", error: { type: errorType, message: "falha gravada" } }],
    ]),
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );
}

export function errorResponse(status: number, errorType: string): Response {
  return new Response(
    JSON.stringify({ type: "error", error: { type: errorType, message: "falha gravada" } }),
    { status, headers: { "content-type": "application/json", "retry-after-ms": "0" } },
  );
}

export type PartialStreamEnding = "close" | "error" | "hang";

const STREAM_FAILURE_DELAY_MS = 10;

export function partialSseResponse(
  partialText: string,
  ending: PartialStreamEnding,
  signal?: AbortSignal | null,
): Response {
  const encoder = new TextEncoder();
  const prefix = sseBodyOf([
    [
      "message_start",
      {
        type: "message_start",
        message: {
          id: "msg_recorded",
          type: "message",
          role: "assistant",
          model: "claude-sonnet-5-5",
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 1000, output_tokens: 1 },
        },
      },
    ],
    [
      "content_block_start",
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    ],
    [
      "content_block_delta",
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: partialText } },
    ],
  ]);
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(prefix));
      if (ending === "close") controller.close();
      if (ending === "error") {
        setTimeout(
          () => controller.error(new TypeError("conexão perdida")),
          STREAM_FAILURE_DELAY_MS,
        );
      }
      signal?.addEventListener("abort", () => controller.error(signal.reason));
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}
