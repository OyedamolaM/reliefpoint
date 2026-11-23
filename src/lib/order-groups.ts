// Unverified checkouts remain durable records for payment recovery, not fulfilled orders.
export const verifiedPaymentStatuses = ["paid", "partially_refunded", "refunded"];
export const unverifiedPaymentStatuses = ["pending", "review"];
