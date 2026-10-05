import { gql } from "graphql-request";
import { z } from "zod";
import { checkUserErrors, handleToolError } from "../lib/toolUtils.js";
const LineItemSchema = z.object({
    title: z.string().min(1).describe("Line title, shown on the order"),
    quantity: z.number().min(1).describe("Units ordered"),
    priceSet: z
        .object({
        shopMoney: z.object({
            amount: z.string().describe("Unit price as a decimal string, e.g. '19.99'"),
            currencyCode: z.string().describe("ISO currency, e.g. 'USD'"),
        }),
    })
        .describe("Unit price. Pass the price the customer actually paid, not today's"),
    variantId: z
        .string()
        .optional()
        .describe("Shopify variant GID, when the product was migrated and is known"),
    sku: z.string().optional().describe("SKU, for a line whose product is not on Shopify"),
    requiresShipping: z.boolean().optional(),
    taxable: z.boolean().optional(),
});
const AddressSchema = z
    .object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    company: z.string().optional(),
    address1: z.string().optional(),
    address2: z.string().optional(),
    city: z.string().optional(),
    provinceCode: z.string().optional(),
    countryCode: z.string().optional().describe("Two-letter ISO code, e.g. 'VN'"),
    zip: z.string().optional(),
    phone: z.string().optional(),
})
    .describe("Address as it was on the original order");
const CreateOrderInputSchema = z.object({
    lineItems: z.array(LineItemSchema).min(1).describe("What was ordered"),
    processedAt: z
        .string()
        .describe("ISO 8601 datetime the order was ORIGINALLY placed. Required for a migration: omit it and every historical order lands dated today, which breaks the merchant's reporting and every date-ordered view"),
    email: z.string().optional().describe("Order contact email"),
    customerId: z
        .string()
        .optional()
        .describe("Existing Shopify customer GID to associate, e.g. gid://shopify/Customer/123"),
    billingAddress: AddressSchema.optional(),
    shippingAddress: AddressSchema.optional(),
    financialStatus: z
        .string()
        .optional()
        .describe("OrderCreateFinancialStatus enum: PAID, PENDING, REFUNDED, PARTIALLY_REFUNDED, VOIDED, AUTHORIZED, PARTIALLY_PAID, EXPIRED"),
    fulfillmentStatus: z
        .string()
        .optional()
        .describe("OrderCreateFulfillmentStatus enum, e.g. FULFILLED, PARTIAL, RESTOCKED"),
    currency: z.string().optional().describe("ISO currency code for the order"),
    note: z.string().optional(),
    tags: z.array(z.string()).optional(),
    sendReceipt: z
        .boolean()
        .default(false)
        .describe("Email the order confirmation to the customer. Defaults to FALSE and should stay false for every migrated order: these are orders the shopper placed months or years ago and was already emailed about once"),
    sendFulfillmentReceipt: z
        .boolean()
        .default(false)
        .describe("Email the shipping confirmation. Same reasoning as sendReceipt - defaults to FALSE"),
    inventoryBehaviour: z
        .string()
        .default("BYPASS")
        .describe("BYPASS (default) leaves stock alone, which is what a historical order wants - it was already picked and shipped. DECREMENT_IGNORING_POLICY or DECREMENT_OBEYING_POLICY would take the same units out of stock a second time"),
});
let shopifyClient;
const createOrder = {
    name: "create-order",
    description: "Create an order directly, for importing one that already happened elsewhere. This is Shopify's own historical-import path and the only one that can suppress the confirmation email - the draft-order pair cannot. Defaults send no mail and touch no stock. Trial and development stores are capped at five orders a minute.",
    schema: CreateOrderInputSchema,
    initialize(client) {
        shopifyClient = client;
    },
    execute: async (input) => {
        try {
            const mutation = gql `
        #graphql

        mutation OrderCreate(
          $order: OrderCreateOrderInput!
          $options: OrderCreateOptionsInput
        ) {
          orderCreate(order: $order, options: $options) {
            order {
              id
              name
              processedAt
              displayFinancialStatus
              displayFulfillmentStatus
            }
            userErrors {
              field
              message
            }
          }
        }
      `;
            const order = {
                lineItems: input.lineItems,
                processedAt: input.processedAt,
            };
            if (input.email !== undefined)
                order.email = input.email;
            if (input.customerId !== undefined)
                order.customer = { toAssociate: { id: input.customerId } };
            if (input.billingAddress !== undefined)
                order.billingAddress = input.billingAddress;
            if (input.shippingAddress !== undefined)
                order.shippingAddress = input.shippingAddress;
            if (input.financialStatus !== undefined)
                order.financialStatus = input.financialStatus;
            if (input.fulfillmentStatus !== undefined)
                order.fulfillmentStatus = input.fulfillmentStatus;
            if (input.currency !== undefined)
                order.currency = input.currency;
            if (input.note !== undefined)
                order.note = input.note;
            if (input.tags !== undefined)
                order.tags = input.tags;
            const data = (await shopifyClient.request(mutation, {
                order,
                options: {
                    sendReceipt: input.sendReceipt,
                    sendFulfillmentReceipt: input.sendFulfillmentReceipt,
                    inventoryBehaviour: input.inventoryBehaviour,
                },
            }));
            checkUserErrors(data.orderCreate.userErrors, "create order");
            return { order: data.orderCreate.order };
        }
        catch (error) {
            handleToolError("create order", error);
        }
    },
};
export { createOrder };
