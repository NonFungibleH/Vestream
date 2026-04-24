import Stripe from "stripe";

// Lazy singleton — avoids throwing at module evaluation time during `next build`
// when STRIPE_SECRET_KEY is not present in the build environment.
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2026-04-22.dahlia",
    });
  }
  return _stripe;
}

// Convenience re-export for use as `stripe` in callers
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return (getStripe() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export const PLANS = {
  pro: {
    priceId: process.env.STRIPE_PRO_PRICE_ID!,
    name: "Pro",
    amount: 900, // $9/mo in cents
  },
  fund: {
    priceId: process.env.STRIPE_FUND_PRICE_ID!,
    name: "Fund",
    amount: 4900, // $49/mo in cents
  },
} as const;

export type PlanKey = keyof typeof PLANS;

/**
 * Look up or create a Stripe customer for the given userId + email.
 * If the user already has a stripeCustomerId, returns it directly.
 * Otherwise creates a new customer and returns the new customerId
 * (caller is responsible for persisting it to the DB).
 */
export async function getOrCreateStripeCustomer(opts: {
  stripeCustomerId: string | null;
  email: string;
  userId: string;
}): Promise<{ customerId: string; created: boolean }> {
  if (opts.stripeCustomerId) {
    return { customerId: opts.stripeCustomerId, created: false };
  }

  const customer = await getStripe().customers.create({
    email: opts.email,
    metadata: { userId: opts.userId },
  });

  return { customerId: customer.id, created: true };
}
