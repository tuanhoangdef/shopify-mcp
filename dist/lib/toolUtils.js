// ── Utility functions ─────────────────────────────────────────────────
/**
 * Throw a formatted error if Shopify userErrors array is non-empty.
 */
export function checkUserErrors(errors, operation) {
    if (errors.length > 0) {
        throw new Error(`Failed to ${operation}: ${errors
            .map((e) => `${e.field}: ${e.message}`)
            .join(", ")}`);
    }
}
/**
 * Catch handler that doesn't re-wrap errors already thrown by checkUserErrors.
 * Fixes the double-wrapping bug where "Failed to X: Failed to X: actual message"
 * was produced by every mutation tool.
 */
export function handleToolError(operation, error) {
    // If the error already has our "Failed to" prefix, re-throw as-is
    if (error instanceof Error && error.message.startsWith("Failed to ")) {
        throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to ${operation}: ${message}`);
}
/**
 * Extract nodes from a Shopify connection's edges array.
 */
export function edgesToNodes(connection) {
    return connection.edges.map((edge) => edge.node);
}
/**
 * Extract shopMoney from a Shopify MoneyBag (e.g. totalPriceSet.shopMoney).
 */
export function shopMoney(moneyBag) {
    return moneyBag?.shopMoney ?? null;
}
