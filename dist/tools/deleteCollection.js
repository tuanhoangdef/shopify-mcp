import { gql } from "graphql-request";
import { z } from "zod";
import { checkUserErrors, handleToolError } from "../lib/toolUtils.js";
const DeleteCollectionInputSchema = z.object({
    id: z
        .string()
        .min(1)
        .describe("Collection GID, e.g. gid://shopify/Collection/123"),
});
let shopifyClient;
const deleteCollection = {
    name: "delete-collection",
    description: "Delete a collection. The products in it are not deleted - only the grouping.",
    schema: DeleteCollectionInputSchema,
    initialize(client) {
        shopifyClient = client;
    },
    execute: async (input) => {
        try {
            const mutation = gql `
        #graphql

        mutation CollectionDelete($input: CollectionDeleteInput!) {
          collectionDelete(input: $input) {
            deletedCollectionId
            userErrors {
              field
              message
            }
          }
        }
      `;
            const data = (await shopifyClient.request(mutation, {
                input: { id: input.id },
            }));
            checkUserErrors(data.collectionDelete.userErrors, "delete collection");
            return { deletedCollectionId: data.collectionDelete.deletedCollectionId };
        }
        catch (error) {
            handleToolError("delete collection", error);
        }
    },
};
export { deleteCollection };
