import app from "./app";
import { logger } from "./lib/logger";
import { runWarrantyCheck } from "./routes/assets";
import { runPasswordResetTokenCleanup } from "./routes/auth";
import { autoSeedIfEmpty } from "./lib/autoSeed";

const PASSWORD_RESET_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily

function cleanupPasswordResetTokens() {
  runPasswordResetTokenCleanup()
    .then((count) => {
      if (count > 0) logger.info({ count }, "Password reset token cleanup: rows removed");
    })
    .catch((err) => logger.error({ err }, "Password reset token cleanup failed"));
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  autoSeedIfEmpty()
    .catch((err) => logger.error({ err }, "Auto-seed failed"));

  runWarrantyCheck()
    .then((count) => {
      if (count > 0) logger.info({ count }, "Warranty check: notifications created");
    })
    .catch((err) => logger.error({ err }, "Warranty check failed"));

  cleanupPasswordResetTokens();
  setInterval(cleanupPasswordResetTokens, PASSWORD_RESET_CLEANUP_INTERVAL_MS);
});
