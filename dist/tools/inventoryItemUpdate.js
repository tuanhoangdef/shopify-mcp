import { gql } from "graphql-request";
import { z } from "zod";
import { checkUserErrors, handleToolError } from "../lib/toolUtils.js";
// The fields here live on InventoryItem, not on ProductVariant, and no variant mutation reaches
// them - which is why unit cost has no home in manage-product-variants. Cost in particular is
// the merchant's own buy price: a migration that carries every other field and drops this one
// silently loses their margin data.
const InventoryItemUpdateInputSchema = z.object({
    id: z
        .string()
        .describe("InventoryItem GID, e.g. gid://shopify/InventoryItem/123. Read it from the variant: get-product-variants-detailed returns inventoryItem.id."),
    cost: z
        .string()
        .optional()
        .describe("Unit cost ('Cost per item') as a decimal string, e.g. '12.50'. The merchant's buy price."),
    tracked: z.boolean().optional().describe("Whether Shopify tracks quantity for this item."),
    countryCodeOfOrigin: z
        .string()
        .optional()
        .describe("ISO 3166-1 alpha-2 country code, e.g. 'FR'."),
    harmonizedSystemCode: z.string().optional().describe("HS tariff code."),
});
let shopifyClient;
const inventoryItemUpdate = {
    name: "inventory-item-update",
    description: "Update an inventory item's cost ('Cost per item'), tracking, country of origin or HS code. These fields are on InventoryItem, not ProductVariant, so no product or variant tool can set them. Returns unitCost as stored, so the write can be confirmed rather than assumed.",
    schema: InventoryItemUpdateInputSchema,
    initialize(client) {
        shopifyClient = client;
    },
    execute: async (input) => {
        try {
            const fields = {};
            if (input.cost !== undefined)
                fields.cost = input.cost;
            if (input.tracked !== undefined)
                fields.tracked = input.tracked;
            if (input.countryCodeOfOrigin !== undefined)
                fields.countryCodeOfOrigin = input.countryCodeOfOrigin;
            if (input.harmonizedSystemCode !== undefined)
                fields.harmonizedSystemCode = input.harmonizedSystemCode;
            if (Object.keys(fields).length === 0) {
                throw new Error("Nothing to update: pass at least one of cost, tracked, countryCodeOfOrigin, harmonizedSystemCode");
            }
            const query = gql `
        #graphql

        mutation inventoryItemUpdate($id: ID!, $input: InventoryItemInput!) {
          inventoryItemUpdate(id: $id, input: $input) {
            inventoryItem {
              id
              unitCost {
                amount
                currencyCode
              }
              tracked
              countryCodeOfOrigin
              harmonizedSystemCode
            }
            userErrors {
              field
              message
            }
          }
        }
      `;
            const data = (await shopifyClient.request(query, {
                id: input.id,
                input: fields,
            }));
            checkUserErrors(data.inventoryItemUpdate.userErrors.map((e) => ({
                field: Array.isArray(e.field) ? e.field.join(".") : String(e.field),
                message: e.message,
            })), "update inventory item");
            return { inventoryItem: data.inventoryItemUpdate.inventoryItem };
        }
        catch (error) {
            handleToolError("update inventory item", error);
        }
    },
};
export { inventoryItemUpdate };
