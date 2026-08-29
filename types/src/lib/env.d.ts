/**
 * Typed, validated environment. Values are read once at module load.
 * Required vars are narrowed to `string`; optional vars stay `string | undefined`.
 */
export declare const env: {
    readonly DATABASE_URL: string;
    readonly SESSION_SECRET: string;
    readonly ADMIN_PASSWORD: string | undefined;
    readonly CRON_SECRET: string | undefined;
    readonly RESEND_API_KEY: string | undefined;
    readonly RESEND_FROM_EMAIL: string | undefined;
    readonly UPSTASH_REDIS_REST_URL: string | undefined;
    readonly UPSTASH_REDIS_REST_TOKEN: string | undefined;
    readonly GRAPH_API_KEY: string | undefined;
    readonly REVENUECAT_WEBHOOK_SECRET: string | undefined;
    readonly REVENUECAT_SECRET_KEY: string | undefined;
    readonly ADMIN_API_SECRET: string | undefined;
    readonly SENTRY_DSN: string | undefined;
    readonly NEXT_PUBLIC_SENTRY_DSN: string | undefined;
    readonly DEV_OTP: string | undefined;
    readonly NEXT_PUBLIC_APP_URL: string;
    readonly isProd: boolean;
    readonly isBuild: boolean;
};
export type Env = typeof env;
