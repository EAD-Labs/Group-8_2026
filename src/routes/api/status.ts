import { createFileRoute } from "@tanstack/react-router";
import { pickProvider } from "@/lib/vision-server";

// Tells the Settings page whether an AI key is configured (never returns the key itself).
export const Route = createFileRoute("/api/status")({
  server: {
    handlers: {
      GET: async () => {
        const provider = pickProvider(process.env as Record<string, string | undefined>);
        return Response.json({ ai: provider });
      },
    },
  },
});
