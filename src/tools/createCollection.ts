import type { GraphQLClient } from "graphql-request";
import { gql } from "graphql-request";
import { z } from "zod";
import { checkUserErrors, handleToolError } from "../lib/toolUtils.js";

const CreateCollectionInputSchema = z.object({
  title: z.string().min(1).describe("Collection title"),
  descriptionHtml: z
    .string()
    .optional()
    .describe("Description, HTML allowed"),
  handle: z
    .string()
    .optional()
    .describe("URL handle. Omit and Shopify derives one from the title"),
  imageSrc: z
    .string()
    .optional()
    .describe(
      "Public URL of the collection image. Shopify fetches it, so a URL only your network can reach will fail",
    ),
  imageAltText: z.string().optional().describe("Alt text for that image"),
  seoTitle: z.string().optional().describe("SEO title"),
  seoDescription: z.string().optional().describe("SEO meta description"),
  sortOrder: z
    .string()
    .optional()
    .describe(
      "CollectionSortOrder enum, e.g. MANUAL, BEST_SELLING, ALPHA_ASC, PRICE_DESC",
    ),
  productIds: z
    .array(z.string())
    .optional()
    .describe(
      "Product GIDs to put in the collection. Manual membership; leave empty for a smart collection and use ruleSet",
    ),
  publish: z
    .boolean()
    .default(false)
    .optional()
    .describe(
      "Publish to the Online Store after creating. A collection is UNPUBLISHED by default and invisible to shoppers until it is published",
    ),
});

type CreateCollectionInput = z.infer<typeof CreateCollectionInputSchema>;

let shopifyClient: GraphQLClient;

const createCollection = {
  name: "create-collection",
  description:
    "Create a collection. Note Shopify creates collections UNPUBLISHED - pass publish:true, or the collection exists but no shopper can see it.",
  schema: CreateCollectionInputSchema,

  initialize(client: GraphQLClient) {
    shopifyClient = client;
  },

  execute: async (input: CreateCollectionInput) => {
    try {
      const mutation = gql`
        #graphql

        mutation CollectionCreate($input: CollectionInput!) {
          collectionCreate(input: $input) {
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

      const collectionInput: Record<string, unknown> = { title: input.title };
      if (input.descriptionHtml !== undefined)
        collectionInput.descriptionHtml = input.descriptionHtml;
      if (input.handle !== undefined) collectionInput.handle = input.handle;
      if (input.sortOrder !== undefined)
        collectionInput.sortOrder = input.sortOrder;
      if (input.productIds !== undefined)
        collectionInput.products = input.productIds;
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
      })) as {
        collectionCreate: {
          collection: { id: string; title: string; handle: string } | null;
          userErrors: Array<{ field: string; message: string }>;
        };
      };

      checkUserErrors(data.collectionCreate.userErrors, "create collection");
      const collection = data.collectionCreate.collection;

      if (!input.publish || !collection) {
        return { collection, published: false };
      }

      const publishMutation = gql`
        #graphql

        mutation PublishCollection($id: ID!) {
          publishablePublishToCurrentChannel(id: $id) {
            userErrors {
              field
              message
            }
          }
        }
      `;
      const published = (await shopifyClient.request(publishMutation, {
        id: collection.id,
      })) as {
        publishablePublishToCurrentChannel: {
          userErrors: Array<{ field: string; message: string }>;
        };
      };
      checkUserErrors(
        published.publishablePublishToCurrentChannel.userErrors,
        "publish collection",
      );

      return { collection, published: true };
    } catch (error) {
      handleToolError("create collection", error);
    }
  },
};

export { createCollection };
