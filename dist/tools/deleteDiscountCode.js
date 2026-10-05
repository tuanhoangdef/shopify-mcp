import { gql } from "graphql-request";
import { z } from "zod";
import { checkUserErrors, handleToolError } from "../lib/toolUtils.js";
const DeleteDiscountCodeInputSchema = z.object({
    id: z
        .string()
        .min(1)
        .describe("Discount node GID from get-discounts, e.g. gid://shopify/DiscountCodeNode/123"),
});
let shopifyClient;
const deleteDiscountCode = {
    name: "delete-discount-code",
    description: "Delete a code discount. For an AUTOMATIC discount this is the wrong mutation - Shopify deletes those with discountAutomaticDelete, which this server does not expose yet, so report that case.",
    schema: DeleteDiscountCodeInputSchema,
    initialize(client) {
        shopifyClient = client;
    },
    execute: async (input) => {
        try {
            const mutation = gql `
        #graphql

        mutation DiscountCodeDelete($id: ID!) {
          discountCodeDelete(id: $id) {
            deletedCodeDiscountId
            userErrors {
              code
              field
              message
            }
          }
        }
      `;
            const data = (await shopifyClient.request(mutation, {
                id: input.id,
            }));
            checkUserErrors(data.discountCodeDelete.userErrors, "delete discount code");
            return {
                deletedCodeDiscountId: data.discountCodeDelete.deletedCodeDiscountId,
            };
        }
        catch (error) {
            handleToolError("delete discount code", error);
        }
    },
};
export { deleteDiscountCode };
