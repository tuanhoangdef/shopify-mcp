import type { GraphQLClient } from "graphql-request";
import { gql } from "graphql-request";
import { z } from "zod";
import { checkUserErrors, handleToolError } from "../lib/toolUtils.js";

const CreatePageInputSchema = z.object({
  title: z.string().min(1).describe("Page title"),
  body: z
    .string()
    .optional()
    .describe("Page content, HTML allowed"),
  handle: z
    .string()
    .optional()
    .describe("URL handle. Omit and Shopify derives one from the title"),
  isPublished: z
    .boolean()
    .optional()
    .describe("Visible on the storefront. Defaults to true unless publishDate is set"),
  publishDate: z
    .string()
    .optional()
    .describe("ISO 8601 datetime the page becomes public"),
  templateSuffix: z
    .string()
    .optional()
    .describe("Theme template that renders it, e.g. 'contact'"),
});

type CreatePageInput = z.infer<typeof CreatePageInputSchema>;

let shopifyClient: GraphQLClient;

const createPage = {
  name: "create-page",
  description:
    "Create an Online Store page. PageCreateInput has no SEO field - a meta title or description migrates as a metafield, or via update after creation.",
  schema: CreatePageInputSchema,

  initialize(client: GraphQLClient) {
    shopifyClient = client;
  },

  execute: async (input: CreatePageInput) => {
    try {
      const mutation = gql`
        #graphql

        mutation PageCreate($page: PageCreateInput!) {
          pageCreate(page: $page) {
            page {
              id
              title
              handle
              isPublished
            }
            userErrors {
              code
              field
              message
            }
          }
        }
      `;

      const page: Record<string, unknown> = { title: input.title };
      if (input.body !== undefined) page.body = input.body;
      if (input.handle !== undefined) page.handle = input.handle;
      if (input.isPublished !== undefined) page.isPublished = input.isPublished;
      if (input.publishDate !== undefined) page.publishDate = input.publishDate;
      if (input.templateSuffix !== undefined)
        page.templateSuffix = input.templateSuffix;

      const data = (await shopifyClient.request(mutation, { page })) as {
        pageCreate: {
          page: Record<string, unknown> | null;
          userErrors: Array<{ code?: string; field: string; message: string }>;
        };
      };

      checkUserErrors(data.pageCreate.userErrors, "create page");
      return { page: data.pageCreate.page };
    } catch (error) {
      handleToolError("create page", error);
    }
  },
};

export { createPage };
