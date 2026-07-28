import { gql } from "graphql-request";
import { z } from "zod";
import { checkUserErrors, handleToolError } from "../lib/toolUtils.js";
const ManageTagsInputSchema = z.object({
    id: z.string().describe("GID of the resource (order, product, customer, draft order, or article)"),
    tags: z.array(z.string()).min(1).describe("Tags to add or remove"),
    action: z.enum(["add", "remove"]).describe("Whether to add or remove the tags"),
});
let shopifyClient;
const manageTags = {
    name: "manage-tags",
    description: "Add or remove tags on any taggable resource (orders, products, customers, draft orders, articles).",
    schema: ManageTagsInputSchema,
    initialize(client) {
        shopifyClient = client;
    },
    execute: async (input) => {
        try {
            if (input.action === "add") {
                const query = gql `
          #graphql

          mutation tagsAdd($id: ID!, $tags: [String!]!) {
            tagsAdd(id: $id, tags: $tags) {
              node {
                id
              }
              userErrors {
                field
                message
              }
            }
          }
        `;
                const data = (await shopifyClient.request(query, {
                    id: input.id,
                    tags: input.tags,
                }));
                checkUserErrors(data.tagsAdd.userErrors, "add tags");
                return {
                    id: data.tagsAdd.node?.id,
                    action: "add",
                    tags: input.tags,
                };
            }
            else {
                const query = gql `
          #graphql

          mutation tagsRemove($id: ID!, $tags: [String!]!) {
            tagsRemove(id: $id, tags: $tags) {
              node {
                id
              }
              userErrors {
                field
                message
              }
            }
          }
        `;
                const data = (await shopifyClient.request(query, {
                    id: input.id,
                    tags: input.tags,
                }));
                checkUserErrors(data.tagsRemove.userErrors, "remove tags");
                return {
                    id: data.tagsRemove.node?.id,
                    action: "remove",
                    tags: input.tags,
                };
            }
        }
        catch (error) {
            handleToolError(`${input.action} tags`, error);
        }
    },
};
export { manageTags };
