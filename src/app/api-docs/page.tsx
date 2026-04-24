"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import "swagger-ui-react/swagger-ui.css";

// Dynamically import to avoid SSR issues with swagger-ui-react
const SwaggerUI = dynamic(() => import("swagger-ui-react"), { ssr: false });

export default function ApiDocsPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-gray-950 border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-white font-semibold text-lg">TokenVest</span>
          <span className="text-gray-400 text-sm">API Reference</span>
          <span className="bg-blue-500/20 text-blue-400 text-xs font-mono px-2 py-0.5 rounded">v1.0</span>
        </div>
        <Link
          href="/"
          className="text-gray-400 hover:text-white text-sm transition-colors"
        >
          ← Back to vestream.io
        </Link>
      </div>

      {/* Swagger UI */}
      <SwaggerUI
        url="/openapi.json"
        docExpansion="list"
        defaultModelsExpandDepth={2}
        persistAuthorization={true}
        tryItOutEnabled={true}
      />
    </div>
  );
}
