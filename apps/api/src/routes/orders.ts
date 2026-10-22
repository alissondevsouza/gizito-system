import {
  confirmOrderInputSchema,
  createOrderInputSchema,
  createOrderResponseSchema,
  orderViewSchema,
  replaceOrderPhotoListInputSchema,
} from "@gizito/core";
import { Elysia, status } from "elysia";
import { z } from "zod";
import { toChargeErrorResponse, toOrderErrorResponse } from "#src/errors.ts";
import {
  buildDeviceCookie,
  type ClientIdentityOptions,
  resolveClientIdentity,
} from "#src/http/client-identity.ts";
import {
  type ChargeServiceDependencies,
  type ChargeServiceError,
  confirmOrder,
  renewCharge,
} from "#src/services/charges.ts";
import {
  createOrder,
  getOrderView,
  type OrderServiceDependencies,
  type OrderServiceError,
  replaceOrderPhotoList,
} from "#src/services/orders.ts";
import type { ClientKeyHashMap } from "#src/services/preview-rate-limit.ts";

export type OrderRouteDependencies = OrderServiceDependencies &
  ChargeServiceDependencies &
  ClientIdentityOptions & {
    readonly isSecureCookie: boolean;
  };

const NO_STORE = "no-store";

const orderTokenParamsSchema = z.object({ token: z.string() });

function throwOrderError(error: OrderServiceError): never {
  const response = toOrderErrorResponse(error);
  throw status(response.status, response.body);
}

function throwChargeError(error: ChargeServiceError): never {
  const response = toChargeErrorResponse(error);
  throw status(response.status, response.body);
}

export function createOrderRoutes(dependencies: OrderRouteDependencies) {
  const identify = (
    request: Request,
    socketAddress: string | null,
    headerMap: Record<string, string | number>,
  ): ClientKeyHashMap => {
    const identity = resolveClientIdentity(request.headers, socketAddress, dependencies);
    if (identity.isNewDevice) {
      headerMap["set-cookie"] = buildDeviceCookie(identity.deviceId, dependencies.isSecureCookie);
    }
    return identity;
  };

  return new Elysia()
    .post(
      "/orders",
      async ({ body, request, server, set }) => {
        set.headers["cache-control"] = NO_STORE;
        const clientKeyHashMap = identify(
          request,
          server?.requestIP(request)?.address ?? null,
          set.headers,
        );
        const result = await createOrder(dependencies, {
          grade: body.grade,
          subject: body.subject,
          photoList: body.photos,
          clientKeyHashMap,
        });
        if (!result.ok) throwOrderError(result.error);
        set.status = 201;
        return result.value;
      },
      { body: createOrderInputSchema, response: { 201: createOrderResponseSchema } },
    )
    .get(
      "/orders/:token",
      async ({ params, set }) => {
        set.headers["cache-control"] = NO_STORE;
        const result = await getOrderView(dependencies, params.token);
        if (!result.ok) throwOrderError(result.error);
        return result.value;
      },
      { params: orderTokenParamsSchema, response: { 200: orderViewSchema } },
    )
    .put(
      "/orders/:token/photos",
      async ({ body, params, request, server, set }) => {
        set.headers["cache-control"] = NO_STORE;
        const clientKeyHashMap = identify(
          request,
          server?.requestIP(request)?.address ?? null,
          set.headers,
        );
        const replacementList = body.orderPhotoId.flatMap((orderPhotoId, index) => {
          const photo = body.photos[index];
          return photo === undefined ? [] : [{ orderPhotoId, photo }];
        });
        const result = await replaceOrderPhotoList(dependencies, {
          publicToken: params.token,
          replacementList,
          clientKeyHashMap,
        });
        if (!result.ok) throwOrderError(result.error);
        return result.value;
      },
      {
        params: orderTokenParamsSchema,
        body: replaceOrderPhotoListInputSchema,
        response: { 200: orderViewSchema },
      },
    )
    .post(
      "/orders/:token/confirm",
      async ({ body, params, set }) => {
        set.headers["cache-control"] = NO_STORE;
        const result = await confirmOrder(dependencies, { publicToken: params.token, input: body });
        if (!result.ok) throwChargeError(result.error);
        return result.value;
      },
      {
        params: orderTokenParamsSchema,
        body: confirmOrderInputSchema,
        response: { 200: orderViewSchema },
      },
    )
    .post(
      "/orders/:token/charges",
      async ({ params, set }) => {
        set.headers["cache-control"] = NO_STORE;
        const result = await renewCharge(dependencies, params.token);
        if (!result.ok) throwChargeError(result.error);
        set.status = 201;
        return result.value;
      },
      { params: orderTokenParamsSchema, response: { 201: orderViewSchema } },
    );
}
