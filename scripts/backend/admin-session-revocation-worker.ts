import { runAdminRevocationWorker } from "./admin-revocation-worker";

// Compatibility entry point retained for existing trusted deployments.
// New operator documentation uses `bun run admin:revocation-worker --once`.
runAdminRevocationWorker(["--once"]).catch((error: unknown) => {
  const code =
    error instanceof Error && "code" in error && typeof error.code === "string"
      ? error.code
      : "worker_unavailable";
  process.stderr.write(
    `${JSON.stringify({ event: "admin_session_revocation_worker_failed", code })}\n`,
  );
  process.exitCode = 1;
});
