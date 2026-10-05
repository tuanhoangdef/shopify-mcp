import type { GraphQLClient } from "graphql-request";
import { gql } from "graphql-request";
import { z } from "zod";
import { handleToolError } from "../lib/toolUtils.js";

const GetDiscountsInputSchema = z.object({
  first: z
    .number()
    .min(1)
    .max(250)
    .default(25)
    .optional()
    .describe("Number of discounts to return (default 25, max 250)"),
  query: z
    .string()
    .optional()
    .describe("Search query, e.g. 'title:Summer' or 'status:active'"),
  after: z
    .string()
    .optional()
    .describe("Cursor from a previous call's pageInfo.endCursor"),
});

type GetDiscountsInput = z.infer<typeof GetDiscountsInputSchema>;

let shopifyClient: GraphQLClient;

const getDiscounts = {
  name: "get-discounts",
  description:
    "Query discounts, both code-based and automatic. Returns the discount node id, which is what delete-discount takes.",
  schema: GetDiscountsInputSchema,

  initialize(client: GraphQLClient) {
    shopifyClient = client;
  },

  execute: async (input: GetDiscountsInput) => {
    try {
      const query = gql`
        #graphql

        query GetDiscounts($first: Int!, $query: String, $after: String) {
          discountNodes(first: $first, query: $query, after: $after) {
            edges {
              node {
                id
                discount {
                  __typename
                  ... on DiscountCodeBasic {
                    title
                    status
                    startsAt
                    endsAt
                    codes(first: 10) {
                      edges {
                        node {
                          code
                        }
                      }
                    }
                  }
                  ... on DiscountAutomaticBasic {
                    title
                    status
                    startsAt
                    endsAt
                  }
                }
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
        discountNodes: {
          edges: Array<{ node: Record<string, unknown> }>;
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
        };
      };

      return {
        discounts: data.discountNodes.edges.map((edge) => edge.node),
        pageInfo: data.discountNodes.pageInfo,
      };
    } catch (error) {
      handleToolError("get discounts", error);
    }
  },
};

export { getDiscounts };
