import { gql } from "graphql-request";
import { z } from "zod";
import { checkUserErrors, handleToolError } from "../lib/toolUtils.js";
const DeletePageInputSchema = z.object({
    id: z.string().min(1).describe("Page GID, e.g. gid://shopify/Page/123"),
});
let shopifyClient;
const deletePage = {
    name: "delete-page",
    description: "Delete an Online Store page.",
    schema: DeletePageInputSchema,
    initialize(client) {
        shopifyClient = client;
    },
    execute: async (input) => {
        try {
            const mutation = gql `
        #graphql

        mutation PageDelete($id: ID!) {
          pageDelete(id: $id) {
            deletedPageId
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
            checkUserErrors(data.pageDelete.userErrors, "delete page");
            return { deletedPageId: data.pageDelete.deletedPageId };
        }
        catch (error) {
            handleToolError("delete page", error);
        }
    },
};
export { deletePage };
