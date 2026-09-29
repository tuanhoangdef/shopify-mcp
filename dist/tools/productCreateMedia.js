import { gql } from "graphql-request";
import { z } from "zod";
import { checkUserErrors, handleToolError } from "../lib/toolUtils.js";
// productCreateMedia is asynchronous on Shopify's side: the mutation returns immediately with
// each medium in status UPLOADED/PROCESSING, and Shopify then fetches or processes the source.
// A medium that fails processing reports it in `mediaErrors` on the medium itself, LATER - not
// in userErrors here. So a caller that checks only userErrors will read a failed image as a
// success. The status is returned below for exactly that reason; re-read the product's media
// afterwards if you need to be sure.
const ProductCreateMediaInputSchema = z.object({
    productId: z.string().describe("Product GID, e.g. gid://shopify/Product/123"),
    media: z
        .array(z.object({
        originalSource: z
            .string()
            .describe("Either a staged resourceUrl from stage-file-upload, or a public URL Shopify's own servers can reach. Prefer the staged URL: a source behind a firewall, a WAF or basic auth will fail here with no error at this step."),
        alt: z.string().optional().describe("Alt text. Carry the source system's image label across."),
        mediaContentType: z
            .enum(["IMAGE", "VIDEO", "EXTERNAL_VIDEO", "MODEL_3D"])
            .default("IMAGE")
            .describe("Media type. IMAGE for product photos."),
    }))
        .min(1)
        .describe("Media to attach, in the order they should appear. The first image becomes the product's featured image."),
});
let shopifyClient;
const productCreateMedia = {
    name: "product-create-media",
    description: "Attach media (product images) to a product. Pair with stage-file-upload when the source is a private host: stage the bytes first, then pass the returned resourceUrl as originalSource. Media processing is asynchronous - the returned status and mediaErrors say whether Shopify accepted each item, not whether it finished processing.",
    schema: ProductCreateMediaInputSchema,
    initialize(client) {
        shopifyClient = client;
    },
    execute: async (input) => {
        try {
            const query = gql `
        #graphql

        mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
          productCreateMedia(productId: $productId, media: $media) {
            media {
              ... on MediaImage {
                id
                alt
                status
                mediaContentType
                mediaErrors {
                  code
                  details
                  message
                }
                preview {
                  image {
                    url
                  }
                }
              }
            }
            mediaUserErrors {
              field
              message
              code
            }
            product {
              id
            }
          }
        }
      `;
            const data = (await shopifyClient.request(query, {
                productId: input.productId,
                media: input.media.map((item) => ({
                    originalSource: item.originalSource,
                    alt: item.alt,
                    mediaContentType: item.mediaContentType,
                })),
            }));
            checkUserErrors(data.productCreateMedia.mediaUserErrors.map((e) => ({
                field: Array.isArray(e.field) ? e.field.join(".") : String(e.field),
                message: e.message,
                code: e.code || undefined,
            })), "create product media");
            // Surfaced rather than buried: a medium can be accepted here and still carry an error,
            // and the caller needs that to be obvious rather than something they go looking for.
            const failed = data.productCreateMedia.media.filter((m) => m.mediaErrors.length > 0);
            return {
                productId: data.productCreateMedia.product?.id,
                media: data.productCreateMedia.media,
                failedMedia: failed,
                note: "Media processing is asynchronous. status READY means done; UPLOADED/PROCESSING means Shopify is still working. Re-read the product's media to confirm.",
            };
        }
        catch (error) {
            handleToolError("create product media", error);
        }
    },
};
export { productCreateMedia };
