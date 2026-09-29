import { gql } from "graphql-request";
import { z } from "zod";
import { handleToolError } from "../lib/toolUtils.js";
// bulk-stage-upload starts a bulk run and returns immediately; without this tool there was no
// way to learn whether it ever finished. A caller had to either assume success - which is how a
// write that never applied gets recorded as done - or re-read every record it touched.
const GetBulkOperationInputSchema = z.object({
    id: z
        .string()
        .optional()
        .describe("BulkOperation GID to look up, as returned by bulk-stage-upload. Omit to read the shop's current/most recent bulk operation instead."),
});
let shopifyClient;
const getBulkOperation = {
    name: "get-bulk-operation",
    description: "Read a bulk operation's status, so a bulk-stage-upload run can be confirmed instead of assumed. status COMPLETED with errorCode null is the only success; RUNNING means keep waiting; FAILED/CANCELED carry errorCode. `url` is the JSONL result file - fetch it to see what each record did.",
    schema: GetBulkOperationInputSchema,
    initialize(client) {
        shopifyClient = client;
    },
    execute: async (input) => {
        try {
            const fields = `
        id
        status
        errorCode
        objectCount
        rootObjectCount
        url
        partialDataUrl
        createdAt
        completedAt
      `;
            if (input.id) {
                const query = gql `
          #graphql

          query getBulkOperation($id: ID!) {
            node(id: $id) {
              ... on BulkOperation {
                ${fields}
              }
            }
          }
        `;
                const data = (await shopifyClient.request(query, { id: input.id }));
                if (!data.node) {
                    throw new Error(`No bulk operation found with id ${input.id}`);
                }
                return { bulkOperation: data.node };
            }
            const query = gql `
        #graphql

        query currentBulkOperation {
          currentBulkOperation {
            ${fields}
          }
        }
      `;
            const data = (await shopifyClient.request(query));
            return { bulkOperation: data.currentBulkOperation };
        }
        catch (error) {
            handleToolError("get bulk operation", error);
        }
    },
};
export { getBulkOperation };
