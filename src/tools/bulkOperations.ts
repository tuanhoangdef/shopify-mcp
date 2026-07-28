import type { GraphQLClient } from "graphql-request";
import { gql } from "graphql-request";
import { z } from "zod";
import { checkUserErrors, handleToolError } from "../lib/toolUtils.js";

// Input schema for staging + running a bulk mutation operation.
//
// The pipeline (per Shopify's stagedUploadsCreate / bulkOperationRunMutation
// docs) is:
//   1. stagedUploadsCreate — request a signed upload target for a
//      BULK_MUTATION_VARIABLES resource.
//   2. Upload a JSONL file (one `{ "input": <variables> }` line per record)
//      to that target via a multipart/form-data POST, with the returned
//      `parameters` as form fields and the file itself as the LAST field.
//   3. bulkOperationRunMutation — kick off the bulk mutation, passing the
//      mutation document (as a string) and the staged upload path.
const BulkStageUploadInputSchema = z.object({
  mutation: z
    .string()
    .describe(
      "The GraphQL mutation document to run once per JSONL line, as a string (e.g. \"mutation call($input: ProductInput!) { productCreate(input: $input) { product { id } userErrors { field message } } }\")."
    ),
  variables: z
    .array(z.record(z.string(), z.unknown()))
    .min(1)
    .describe(
      "One entry per record to mutate. Each entry becomes the `input` value of one JSONL line uploaded to Shopify."
    ),
  filename: z
    .string()
    .optional()
    .describe("Filename to use for the staged upload (default: bulk_op_vars.jsonl)."),
});

type BulkStageUploadInput = z.infer<typeof BulkStageUploadInputSchema>;

interface StagedUploadParameter {
  name: string;
  value: string;
}

interface StagedUploadTarget {
  url: string;
  resourceUrl: string | null;
  parameters: StagedUploadParameter[];
}

interface StagedUploadsCreateResponse {
  stagedUploadsCreate: {
    stagedTargets: StagedUploadTarget[];
    userErrors: Array<{ field: string[]; message: string }>;
  };
}

interface BulkOperationRunMutationResponse {
  bulkOperationRunMutation: {
    bulkOperation: {
      id: string;
      status: string;
    } | null;
    userErrors: Array<{ field: string[] | null; message: string }>;
  };
}

// Will be initialized in index.ts
let shopifyClient: GraphQLClient;

const bulkStageUpload = {
  name: "bulk-stage-upload",
  description:
    "Run a mutation in bulk against many records: stages a JSONL upload via stagedUploadsCreate, uploads the variables file, then kicks off the bulk run via bulkOperationRunMutation. Returns the created BulkOperation (poll it separately for completion).",
  schema: BulkStageUploadInputSchema,

  // Add initialize method to set up the GraphQL client
  initialize(client: GraphQLClient) {
    shopifyClient = client;
  },

  execute: async (input: BulkStageUploadInput) => {
    try {
      const filename = input.filename || "bulk_op_vars.jsonl";

      // Step 1: stagedUploadsCreate — request a signed upload target.
      const stagedUploadsQuery = gql`
        #graphql

        mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
          stagedUploadsCreate(input: $input) {
            stagedTargets {
              url
              resourceUrl
              parameters {
                name
                value
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const stagedUploadsVariables = {
        input: [
          {
            resource: "BULK_MUTATION_VARIABLES",
            filename,
            mimeType: "text/jsonl",
            httpMethod: "POST",
          },
        ],
      };

      const stagedData = (await shopifyClient.request(
        stagedUploadsQuery,
        stagedUploadsVariables
      )) as StagedUploadsCreateResponse;

      checkUserErrors(
        stagedData.stagedUploadsCreate.userErrors.map((e) => ({
          field: Array.isArray(e.field) ? e.field.join(".") : String(e.field),
          message: e.message,
        })),
        "stage bulk upload"
      );

      const target = stagedData.stagedUploadsCreate.stagedTargets[0];
      if (!target) {
        throw new Error("stagedUploadsCreate returned no staged target");
      }

      // Step 2: build the JSONL payload (one `{ "input": ... }` line per record)
      // and upload it via multipart/form-data. The `file` field MUST be last.
      const jsonl = input.variables
        .map((variables) => JSON.stringify({ input: variables }))
        .join("\n");

      const form = new FormData();
      for (const param of target.parameters) {
        form.append(param.name, param.value);
      }
      form.append(
        "file",
        new Blob([jsonl], { type: "text/jsonl" }),
        filename
      );

      const uploadResponse = await fetch(target.url, {
        method: "POST",
        body: form,
      });

      if (!uploadResponse.ok) {
        const text = await uploadResponse.text();
        throw new Error(
          `Failed to upload bulk operation JSONL (${uploadResponse.status}): ${text}`
        );
      }

      // The staged upload path is carried in the `key` parameter Shopify
      // returned alongside the signed upload URL.
      const keyParam = target.parameters.find((p) => p.name === "key");
      if (!keyParam) {
        throw new Error(
          "stagedUploadsCreate response did not include a 'key' parameter for the staged upload path"
        );
      }
      const stagedUploadPath = keyParam.value;

      // Step 3: bulkOperationRunMutation — start the bulk run against the
      // uploaded JSONL.
      const bulkOperationQuery = gql`
        #graphql

        mutation bulkOperationRunMutation(
          $mutation: String!
          $stagedUploadPath: String!
        ) {
          bulkOperationRunMutation(
            mutation: $mutation
            stagedUploadPath: $stagedUploadPath
          ) {
            bulkOperation {
              id
              status
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const bulkOperationVariables = {
        mutation: input.mutation,
        stagedUploadPath,
      };

      const bulkData = (await shopifyClient.request(
        bulkOperationQuery,
        bulkOperationVariables
      )) as BulkOperationRunMutationResponse;

      checkUserErrors(
        bulkData.bulkOperationRunMutation.userErrors.map((e) => ({
          field: Array.isArray(e.field) ? e.field.join(".") : String(e.field ?? ""),
          message: e.message,
        })),
        "run bulk operation mutation"
      );

      return {
        bulkOperation: bulkData.bulkOperationRunMutation.bulkOperation,
      };
    } catch (error) {
      handleToolError("run bulk operation mutation", error);
    }
  },
};

export { bulkStageUpload };
