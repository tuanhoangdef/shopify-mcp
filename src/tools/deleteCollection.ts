import type { GraphQLClient } from "graphql-request";
import { gql } from "graphql-request";
import { z } from "zod";
import { checkUserErrors, handleToolError } from "../lib/toolUtils.js";

const DeleteCollectionInputSchema = z.object({
  id: z
    .string()
    .min(1)
    .describe("Collection GID, e.g. gid://shopify/Collection/123"),
});

type DeleteCollectionInput = z.infer<typeof DeleteCollectionInputSchema>;

let shopifyClient: GraphQLClient;

const deleteCollection = {
  name: "delete-collection",
  description:
    "Delete a collection. The products in it are not deleted - only the grouping.",
  schema: DeleteCollectionInputSchema,

  initialize(client: GraphQLClient) {
    shopifyClient = client;
  },

  execute: async (input: DeleteCollectionInput) => {
    try {
      const mutation = gql`
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
      })) as {
        collectionDelete: {
          deletedCollectionId: string | null;
          userErrors: Array<{ field: string; message: string }>;
        };
      };

      checkUserErrors(data.collectionDelete.userErrors, "delete collection");
      return { deletedCollectionId: data.collectionDelete.deletedCollectionId };
    } catch (error) {
      handleToolError("delete collection", error);
    }
  },
};

export { deleteCollection };
