import { gql } from "graphql-request";
import { z } from "zod";
import { checkUserErrors, handleToolError } from "../lib/toolUtils.js";
const UpdatePageInputSchema = z.object({
    id: z.string().min(1).describe("Page GID, e.g. gid://shopify/Page/123"),
    title: z.string().optional().describe("New title"),
    body: z.string().optional().describe("New content, HTML allowed"),
    handle: z.string().optional().describe("New URL handle"),
    isPublished: z.boolean().optional().describe("Visible on the storefront"),
    publishDate: z.string().optional().describe("ISO 8601 datetime"),
    templateSuffix: z.string().optional().describe("Theme template suffix"),
});
let shopifyClient;
const updatePage = {
    name: "update-page",
    description: "Update an Online Store page. Partial - only the fields you pass change.",
    schema: UpdatePageInputSchema,
    initialize(client) {
        shopifyClient = client;
    },
    execute: async (input) => {
        try {
            const mutation = gql `
        #graphql

        mutation PageUpdate($id: ID!, $page: PageUpdateInput!) {
          pageUpdate(id: $id, page: $page) {
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
            const page = {};
            if (input.title !== undefined)
                page.title = input.title;
            if (input.body !== undefined)
                page.body = input.body;
            if (input.handle !== undefined)
                page.handle = input.handle;
            if (input.isPublished !== undefined)
                page.isPublished = input.isPublished;
            if (input.publishDate !== undefined)
                page.publishDate = input.publishDate;
            if (input.templateSuffix !== undefined)
                page.templateSuffix = input.templateSuffix;
            const data = (await shopifyClient.request(mutation, {
                id: input.id,
                page,
            }));
            checkUserErrors(data.pageUpdate.userErrors, "update page");
            return { page: data.pageUpdate.page };
        }
        catch (error) {
            handleToolError("update page", error);
        }
    },
};
export { updatePage };
