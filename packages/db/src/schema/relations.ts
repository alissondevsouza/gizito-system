import { relations } from "drizzle-orm";
import { aiCall } from "#src/schema/ai-call.ts";
import { charge } from "#src/schema/charge.ts";
import { kit } from "#src/schema/kit.ts";
import { notification } from "#src/schema/notification.ts";
import { order } from "#src/schema/order.ts";
import { orderPhoto } from "#src/schema/order-photo.ts";
import { supportTicket } from "#src/schema/support-ticket.ts";

export const orderRelations = relations(order, ({ many }) => ({
  photoList: many(orderPhoto),
  chargeList: many(charge),
  kitList: many(kit),
  aiCallList: many(aiCall),
  notificationList: many(notification),
  supportTicketList: many(supportTicket),
}));

export const orderPhotoRelations = relations(orderPhoto, ({ one }) => ({
  order: one(order, { fields: [orderPhoto.orderId], references: [order.orderId] }),
}));

export const chargeRelations = relations(charge, ({ one }) => ({
  order: one(order, { fields: [charge.orderId], references: [order.orderId] }),
}));

export const kitRelations = relations(kit, ({ one }) => ({
  order: one(order, { fields: [kit.orderId], references: [order.orderId] }),
  supersededByKit: one(kit, { fields: [kit.supersededByKitId], references: [kit.kitId] }),
}));

export const aiCallRelations = relations(aiCall, ({ one }) => ({
  order: one(order, { fields: [aiCall.orderId], references: [order.orderId] }),
}));

export const notificationRelations = relations(notification, ({ one }) => ({
  order: one(order, { fields: [notification.orderId], references: [order.orderId] }),
}));

export const supportTicketRelations = relations(supportTicket, ({ one }) => ({
  order: one(order, { fields: [supportTicket.orderId], references: [order.orderId] }),
}));
