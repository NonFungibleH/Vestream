import Stripe from "stripe";
import { stripe, PLANS } from "@/lib/stripe";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

// Disable body parsing so we can read the raw body for signature verification
export const dynamic = "force-dynamic";

function getPlanTierFromPriceId(priceId: string): "pro" | "fund" {
  if (priceId === PLANS.fund.priceId) return "fund";
  return "pro";
}

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature")!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    return new Response(`Webhook Error: ${(err as Error).message}`, {
      status: 400,
    });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        if (session.mode !== "subscription") break;

        const customerId =
          typeof session.customer === "string"
            ? session.customer
            : session.customer?.id;

        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;

        if (!customerId || !subscriptionId) break;

        // Retrieve the subscription to get the price ID
        const subscription = await stripe.subscriptions.retrieve(
          subscriptionId
        );
        const priceId = subscription.items.data[0]?.price.id ?? "";
        const tier = getPlanTierFromPriceId(priceId);

        await db
          .update(users)
          .set({ tier, stripeSubscriptionId: subscriptionId })
          .where(eq(users.stripeCustomerId, customerId));

        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;

        const customerId =
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer.id;

        const priceId = subscription.items.data[0]?.price.id ?? "";
        const tier = getPlanTierFromPriceId(priceId);

        // Only update if subscription is active or trialing
        const activeStatuses = ["active", "trialing"];
        if (activeStatuses.includes(subscription.status)) {
          await db
            .update(users)
            .set({ tier, stripeSubscriptionId: subscription.id })
            .where(eq(users.stripeCustomerId, customerId));
        }

        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;

        const customerId =
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer.id;

        await db
          .update(users)
          .set({ tier: "free", stripeSubscriptionId: null })
          .where(eq(users.stripeCustomerId, customerId));

        break;
      }

      default:
        // Unhandled event — return 200 to acknowledge receipt
        break;
    }
  } catch (err) {
    console.error(`[stripe/webhook] Error handling event ${event.type}:`, err);
    return new Response("Internal Server Error", { status: 500 });
  }

  return new Response("OK", { status: 200 });
}
