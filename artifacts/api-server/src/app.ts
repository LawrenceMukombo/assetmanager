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
  // Resolve relative to this compiled file's location rather than process.cwd()
  // so the path works regardless of which directory the process is started from.
  const serverDir = path.dirname(fileURLToPath(import.meta.url));
  const frontendDist = path.resolve(serverDir, "../../npams-web/dist/public");
  const indexHtml = path.join(frontendDist, "index.html");

  logger.info({ frontendDist, exists: existsSync(frontendDist) }, "Static files configuration");

  if (existsSync(frontendDist)) {
    app.use(express.static(frontendDist));

    app.get("*", (_req: Request, res: Response, next: NextFunction) => {
      if (!existsSync(indexHtml)) {
        logger.error({ indexHtml }, "index.html not found");
        return next(new Error("Frontend index.html not found"));
      }
      res.sendFile(indexHtml);
    });
  } else {
    logger.warn({ frontendDist, cwd: process.cwd() }, "Frontend dist not found — static files will not be served");
  }
}

export default app;
