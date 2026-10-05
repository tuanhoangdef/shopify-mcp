import { gql } from "graphql-request";
import { z } from "zod";
import { checkUserErrors, handleToolError } from "../lib/toolUtils.js";
const UpdateCollectionInputSchema = z.object({
    id: z
        .string()
        .min(1)
        .describe("Collection GID, e.g. gid://shopify/Collection/123"),
    title: z.string().optional().describe("New title"),
    descriptionHtml: z.string().optional().describe("New description, HTML allowed"),
    handle: z.string().optional().describe("New URL handle"),
    imageSrc: z.string().optional().describe("Public URL of a replacement image"),
    imageAltText: z.string().optional().describe("Alt text for that image"),
    seoTitle: z.string().optional().describe("SEO title"),
    seoDescription: z.string().optional().describe("SEO meta description"),
    sortOrder: z.string().optional().describe("CollectionSortOrder enum"),
});
let shopifyClient;
const updateCollection = {
    name: "update-collection",
    description: "Update an existing collection. Only the fields you pass are changed; anything omitted keeps its current value.",
    schema: UpdateCollectionInputSchema,
    initialize(client) {
        shopifyClient = client;
    },
    execute: async (input) => {
        try {
            const mutation = gql `
        #graphql

        mutation CollectionUpdate($input: CollectionInput!) {
          collectionUpdate(input: $input) {
            collection {
              id
              title
              handle
            }
            userErrors {
              field
              message
            }
          }
        }
      `;
            const collectionInput = { id: input.id };
            if (input.title !== undefined)
                collectionInput.title = input.title;
            if (input.descriptionHtml !== undefined)
                collectionInput.descriptionHtml = input.descriptionHtml;
            if (input.handle !== undefined)
                collectionInput.handle = input.handle;
            if (input.sortOrder !== undefined)
                collectionInput.sortOrder = input.sortOrder;
            if (input.imageSrc !== undefined) {
                collectionInput.image = {
                    src: input.imageSrc,
                    ...(input.imageAltText !== undefined
                        ? { altText: input.imageAltText }
                        : {}),
                };
            }
            if (input.seoTitle !== undefined || input.seoDescription !== undefined) {
                collectionInput.seo = {
                    ...(input.seoTitle !== undefined ? { title: input.seoTitle } : {}),
                    ...(input.seoDescription !== undefined
                        ? { description: input.seoDescription }
                        : {}),
                };
            }
            const data = (await shopifyClient.request(mutation, {
                input: collectionInput,
            }));
            checkUserErrors(data.collectionUpdate.userErrors, "update collection");
            return { collection: data.collectionUpdate.collection };
        }
        catch (error) {
            handleToolError("update collection", error);
        }
    },
};
export { updateCollection };
