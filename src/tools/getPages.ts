import type { GraphQLClient } from "graphql-request";
import { gql } from "graphql-request";
import { z } from "zod";
import { handleToolError } from "../lib/toolUtils.js";

const GetPagesInputSchema = z.object({
  first: z
    .number()
    .min(1)
    .max(250)
    .default(25)
    .optional()
    .describe("Number of pages to return (default 25, max 250)"),
  query: z
    .string()
    .optional()
    .describe("Search query, e.g. 'title:Shipping' or 'handle:about-us'"),
  after: z
    .string()
    .optional()
    .describe("Cursor from a previous call's pageInfo.endCursor"),
});

type GetPagesInput = z.infer<typeof GetPagesInputSchema>;

let shopifyClient: GraphQLClient;

const getPages = {
  name: "get-pages",
  description:
    "Query Online Store pages. Returns id, title, handle, body and publish state, with a cursor for paging.",
  schema: GetPagesInputSchema,

  initialize(client: GraphQLClient) {
    shopifyClient = client;
  },

  execute: async (input: GetPagesInput) => {
    try {
      const query = gql`
        #graphql

        query GetPages($first: Int!, $query: String, $after: String) {
          pages(first: $first, query: $query, after: $after) {
            edges {
              node {
                id
                title
                handle
                body
                isPublished
                publishedAt
                templateSuffix
                createdAt
                updatedAt
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `;

      const data = (await shopifyClient.request(query, {
        first: input.first ?? 25,
        query: input.query,
        after: input.after,
      })) as {
        pages: {
          edges: Array<{ node: Record<string, unknown> }>;
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
        };
      };

      return {
        pages: data.pages.edges.map((edge) => edge.node),
        pageInfo: data.pages.pageInfo,
      };
    } catch (error) {
      handleToolError("get pages", error);
    }
  },
};

export { getPages };
