import type { GraphQLClient } from "graphql-request";
import { gql } from "graphql-request";
import { z } from "zod";
import { checkUserErrors, handleToolError } from "../lib/toolUtils.js";

// Input schema for sending a customer account invite email
const SendCustomerAccountInviteEmailInputSchema = z.object({
  id: z.string().regex(/^\d+$/, "Customer ID must be numeric"),
  customMessage: z.string().optional(),
  subject: z.string().optional()
});

type SendCustomerAccountInviteEmailInput = z.infer<
  typeof SendCustomerAccountInviteEmailInputSchema
>;

// Will be initialized in index.ts
let shopifyClient: GraphQLClient;

const sendCustomerAccountInviteEmail = {
  name: "send-customer-account-invite-email",
  description:
    "Send a customer account invite email so the customer can activate their account",
  schema: SendCustomerAccountInviteEmailInputSchema,

  // Add initialize method to set up the GraphQL client
  initialize(client: GraphQLClient) {
    shopifyClient = client;
  },

  execute: async (input: SendCustomerAccountInviteEmailInput) => {
    try {
      const { id, customMessage, subject } = input;

      // Convert numeric ID to GID format
      const customerGid = `gid://shopify/Customer/${id}`;

      const query = gql`
        #graphql

        mutation customerSendAccountInviteEmail(
          $customerId: ID!
          $email: EmailInput
        ) {
          customerSendAccountInviteEmail(
            customerId: $customerId
            email: $email
          ) {
            customer {
              id
              email
              state
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const email =
        customMessage || subject
          ? {
              customMessage: customMessage ?? null,
              subject: subject ?? null
            }
          : undefined;

      const data = (await shopifyClient.request(query, {
        customerId: customerGid,
        email
      })) as {
        customerSendAccountInviteEmail: {
          customer: { id: string; email: string | null; state: string } | null;
          userErrors: Array<{ field: string; message: string }>;
        };
      };

      checkUserErrors(
        data.customerSendAccountInviteEmail.userErrors,
        "send customer account invite email"
      );

      return { customer: data.customerSendAccountInviteEmail.customer };
    } catch (error) {
      handleToolError("send customer account invite email", error);
    }
  }
};

export { sendCustomerAccountInviteEmail };
