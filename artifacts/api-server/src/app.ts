import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

if (process.env.NODE_ENV === "production") {
  // Frontend files are copied into dist/frontend/ by the build step,
  // so they are always co-located with this bundle in the deployment container.
  const serverDir = path.dirname(fileURLToPath(import.meta.url));
  const frontendDist = path.resolve(serverDir, "frontend");
  const indexHtml = path.join(frontendDist, "index.html");

  logger.info({ frontendDist, indexHtmlExists: existsSync(indexHtml), frontendExists: existsSync(frontendDist) }, "Static files configuration");

  if (existsSync(indexHtml)) {
    app.use(express.static(frontendDist));

    app.get("*", (_req: Request, res: Response, next: NextFunction) => {
      res.sendFile(indexHtml, (err) => {
        if (err) {
          logger.error({ indexHtml, err: String(err) }, "sendFile failed");
          next(err);
        }
      });
    });
  } else {
    logger.warn({ frontendDist, serverDir }, "Frontend dist/index.html not found — static files will not be served");
  }
}

export default app;
