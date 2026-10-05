import { gql } from "graphql-request";
import { z } from "zod";
import { checkUserErrors, handleToolError } from "../lib/toolUtils.js";
const CreateDiscountCodeInputSchema = z.object({
    title: z
        .string()
        .min(1)
        .describe("Internal name shown in the Shopify admin"),
    code: z
        .string()
        .min(1)
        .describe("The code a shopper types at checkout, e.g. SUMMER20"),
    startsAt: z
        .string()
        .describe("ISO 8601 datetime the discount becomes usable"),
    endsAt: z
        .string()
        .optional()
        .describe("ISO 8601 datetime it stops. Omit for no end date"),
    percentage: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Percentage off as a FRACTION: 0.2 is 20%. Pass this or amount, not both"),
    amount: z
        .number()
        .optional()
        .describe("Fixed amount off, in the shop currency. Pass this or percentage"),
    appliesOncePerCustomer: z
        .boolean()
        .default(false)
        .optional()
        .describe("Limit to one use per customer"),
    usageLimit: z
        .number()
        .optional()
        .describe("Total times the code can be used across all customers"),
    minimumSubtotal: z
        .number()
        .optional()
        .describe("Minimum order subtotal required, in the shop currency"),
});
let shopifyClient;
const createDiscountCode = {
    name: "create-discount-code",
    description: "Create a basic code discount (a coupon), applying to all order items. This is the Shopify shape a Magento cart price rule WITH a coupon code usually maps to. A rule with no coupon code is an automatic discount instead - a different mutation this tool does not cover, so report that case rather than forcing a code onto it.",
    schema: CreateDiscountCodeInputSchema,
    initialize(client) {
        shopifyClient = client;
    },
    execute: async (input) => {
        try {
            if ((input.percentage === undefined) === (input.amount === undefined)) {
                throw new Error("Failed to create discount code: pass exactly one of percentage or amount");
            }
            const mutation = gql `
        #graphql

        mutation DiscountCodeBasicCreate(
          $basicCodeDiscount: DiscountCodeBasicInput!
        ) {
          discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
            codeDiscountNode {
              id
            }
            userErrors {
              code
              field
              message
            }
          }
        }
      `;
            const value = input.percentage !== undefined
                ? { percentage: input.percentage }
                : {
                    discountAmount: {
                        amount: input.amount,
                        appliesOnEachItem: false,
                    },
                };
            const basicCodeDiscount = {
                title: input.title,
                code: input.code,
                startsAt: input.startsAt,
                customerSelection: { all: true },
                customerGets: {
                    value,
                    items: { all: true },
                },
                appliesOncePerCustomer: input.appliesOncePerCustomer ?? false,
            };
            if (input.endsAt !== undefined)
                basicCodeDiscount.endsAt = input.endsAt;
            if (input.usageLimit !== undefined)
                basicCodeDiscount.usageLimit = input.usageLimit;
            if (input.minimumSubtotal !== undefined) {
                basicCodeDiscount.minimumRequirement = {
                    subtotal: { greaterThanOrEqualToSubtotal: input.minimumSubtotal },
                };
            }
            const data = (await shopifyClient.request(mutation, {
                basicCodeDiscount,
            }));
            checkUserErrors(data.discountCodeBasicCreate.userErrors, "create discount code");
            return { codeDiscountNode: data.discountCodeBasicCreate.codeDiscountNode };
        }
        catch (error) {
            handleToolError("create discount code", error);
        }
    },
};
export { createDiscountCode };
