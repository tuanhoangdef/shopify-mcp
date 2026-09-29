import { gql } from "graphql-request";
import { z } from "zod";
import { checkUserErrors, handleToolError } from "../lib/toolUtils.js";
// Getting a file INTO Shopify is two steps that cannot be collapsed: Shopify hands out a
// signed target, and the bytes go to that target, not to the GraphQL endpoint. What comes
// back is a `resourceUrl` that mutations like productCreateMedia accept as `originalSource`.
//
// Why fetch the bytes here rather than hand productCreateMedia the source URL directly:
// `originalSource` makes SHOPIFY fetch the URL, so it only works for a source Shopify's own
// servers can reach. A migration source is usually a staging store behind a firewall, a WAF,
// or basic auth - reachable from the machine running this server and from nowhere else. This
// tool is that machine, so it does the fetching.
const StageFileUploadInputSchema = z.object({
    sourceUrl: z
        .string()
        .url()
        .describe("URL to fetch the file from. Fetched by THIS server, so it may be private to this network - that is the point of staging rather than passing the URL straight to productCreateMedia."),
    filename: z
        .string()
        .optional()
        .describe("Filename to register with Shopify (default: the last path segment of sourceUrl)."),
    mimeType: z
        .string()
        .optional()
        .describe("MIME type (default: whatever the source responded with, else image/jpeg)."),
    resource: z
        .enum(["IMAGE", "VIDEO", "FILE"])
        .default("IMAGE")
        .describe("Shopify staged upload resource type. IMAGE for product photos."),
    headers: z
        .record(z.string(), z.string())
        .optional()
        .describe("Extra request headers for the source fetch - an Authorization header, or a User-Agent when the source sits behind a WAF that rejects unfamiliar clients."),
});
let shopifyClient;
const stageFileUpload = {
    name: "stage-file-upload",
    description: "Fetch a file from a URL and upload it to Shopify's staged storage, returning a resourceUrl that product-create-media (or any mutation taking originalSource) accepts. Use this for product images: the fetch happens on this server, so the source may be a private/staging host Shopify itself cannot reach.",
    schema: StageFileUploadInputSchema,
    initialize(client) {
        shopifyClient = client;
    },
    execute: async (input) => {
        try {
            const sourceResponse = await fetch(input.sourceUrl, { headers: input.headers });
            if (!sourceResponse.ok) {
                throw new Error(`Failed to fetch source file (${sourceResponse.status} ${sourceResponse.statusText}) from ${input.sourceUrl}`);
            }
            const bytes = new Uint8Array(await sourceResponse.arrayBuffer());
            if (bytes.byteLength === 0) {
                throw new Error(`Source file at ${input.sourceUrl} was empty`);
            }
            // A WAF or a Magento error page answers 200 with HTML, and uploading that would produce
            // a "successfully staged" image that is a error page. Content-type is the cheap check.
            const sourceType = sourceResponse.headers.get("content-type") || "";
            if (input.resource === "IMAGE" && sourceType && !sourceType.startsWith("image/")) {
                throw new Error(`Source at ${input.sourceUrl} returned ${sourceType}, not an image - refusing to stage it. The URL is probably an error page answering 200.`);
            }
            const filename = input.filename || decodeURIComponent(new URL(input.sourceUrl).pathname.split("/").pop() || "upload");
            const mimeType = input.mimeType || sourceType || "image/jpeg";
            const stagedUploadsQuery = gql `
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
            const stagedData = (await shopifyClient.request(stagedUploadsQuery, {
                input: [
                    {
                        resource: input.resource,
                        filename,
                        mimeType,
                        httpMethod: "POST",
                        fileSize: String(bytes.byteLength),
                    },
                ],
            }));
            checkUserErrors(stagedData.stagedUploadsCreate.userErrors.map((e) => ({
                field: Array.isArray(e.field) ? e.field.join(".") : String(e.field),
                message: e.message,
            })), "stage file upload");
            const target = stagedData.stagedUploadsCreate.stagedTargets[0];
            if (!target) {
                throw new Error("stagedUploadsCreate returned no staged target");
            }
            // The signed parameters must be form fields, and the file MUST be the last one - the
            // storage backend rejects the POST otherwise.
            const form = new FormData();
            for (const param of target.parameters) {
                form.append(param.name, param.value);
            }
            form.append("file", new Blob([bytes], { type: mimeType }), filename);
            const uploadResponse = await fetch(target.url, { method: "POST", body: form });
            if (!uploadResponse.ok) {
                const text = await uploadResponse.text();
                throw new Error(`Failed to upload staged file (${uploadResponse.status}): ${text}`);
            }
            return {
                resourceUrl: target.resourceUrl,
                filename,
                mimeType,
                bytes: bytes.byteLength,
            };
        }
        catch (error) {
            handleToolError("stage file upload", error);
        }
    },
};
export { stageFileUpload };
