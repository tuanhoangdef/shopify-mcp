import type { GraphQLClient } from "graphql-request";
import { bulkStageUpload } from "./bulkOperations.js";

describe("bulkStageUpload", () => {
  describe("schema", () => {
    it("exposes the expected tool metadata and input schema shape", () => {
      expect(bulkStageUpload.name).toBe("bulk-stage-upload");
      expect(typeof bulkStageUpload.description).toBe("string");

      // `mutation` (string) and `variables` (array of records) are required;
      // `filename` is optional.
      const shape = bulkStageUpload.schema.shape;
      expect(shape.mutation).toBeDefined();
      expect(shape.variables).toBeDefined();
      expect(shape.filename).toBeDefined();

      // Sanity-check parsing behavior of the schema itself.
      const parsed = bulkStageUpload.schema.safeParse({
        mutation: "mutation call($input: ProductInput!) { productCreate(input: $input) { product { id } userErrors { field message } } }",
        variables: [{ title: "Test product" }],
      });
      expect(parsed.success).toBe(true);

      const missingVariables = bulkStageUpload.schema.safeParse({
        mutation: "mutation { __typename }",
        variables: [],
      });
      expect(missingVariables.success).toBe(false);
    });
  });

  describe("execute", () => {
    const stagedTarget = {
      url: "https://shopify-staged-uploads.example.com/upload",
      resourceUrl: null,
      parameters: [
        { name: "key", value: "tmp/12345/bulk/abc-def/bulk_op_vars.jsonl" },
        { name: "policy", value: "fake-policy" },
      ],
    };

    function makeClient(overrides?: {
      stagedUserErrors?: Array<{ field: string[]; message: string }>;
      bulkUserErrors?: Array<{ field: string[] | null; message: string }>;
    }): GraphQLClient {
      const stagedUserErrors = overrides?.stagedUserErrors ?? [];
      const bulkUserErrors = overrides?.bulkUserErrors ?? [];

      const request = jest
        .fn()
        // First call: stagedUploadsCreate
        .mockResolvedValueOnce({
          stagedUploadsCreate: {
            stagedTargets: [stagedTarget],
            userErrors: stagedUserErrors,
          },
        })
        // Second call: bulkOperationRunMutation
        .mockResolvedValueOnce({
          bulkOperationRunMutation: {
            bulkOperation:
              bulkUserErrors.length > 0
                ? null
                : { id: "gid://shopify/BulkOperation/1", status: "CREATED" },
            userErrors: bulkUserErrors,
          },
        });

      return { request } as unknown as GraphQLClient;
    }

    beforeEach(() => {
      // Stub the multipart upload leg so tests never hit the network.
      (global as any).fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => "",
      });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("uploads the JSONL and starts the bulk operation on success", async () => {
      const client = makeClient();
      bulkStageUpload.initialize(client);

      const result = await bulkStageUpload.execute({
        mutation:
          "mutation call($input: ProductInput!) { productCreate(input: $input) { product { id } userErrors { field message } } }",
        variables: [{ title: "Product A" }, { title: "Product B" }],
      });

      expect((client.request as jest.Mock)).toHaveBeenCalledTimes(2);
      expect((global.fetch as jest.Mock)).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        bulkOperation: { id: "gid://shopify/BulkOperation/1", status: "CREATED" },
      });
    });

    it("calls checkUserErrors and throws when stagedUploadsCreate returns userErrors", async () => {
      const client = makeClient({
        stagedUserErrors: [{ field: ["input"], message: "Filename is invalid" }],
      });
      bulkStageUpload.initialize(client);

      await expect(
        bulkStageUpload.execute({
          mutation: "mutation { __typename }",
          variables: [{ title: "Product A" }],
        })
      ).rejects.toThrow(/Filename is invalid/);

      // Bulk step must never run once staging fails userErrors validation.
      expect((client.request as jest.Mock)).toHaveBeenCalledTimes(1);
    });

    it("calls checkUserErrors and throws when bulkOperationRunMutation returns userErrors", async () => {
      const client = makeClient({
        bulkUserErrors: [{ field: null, message: "Mutation is not a valid bulk mutation" }],
      });
      bulkStageUpload.initialize(client);

      await expect(
        bulkStageUpload.execute({
          mutation: "mutation { __typename }",
          variables: [{ title: "Product A" }],
        })
      ).rejects.toThrow(/Mutation is not a valid bulk mutation/);

      expect((client.request as jest.Mock)).toHaveBeenCalledTimes(2);
    });
  });
});
