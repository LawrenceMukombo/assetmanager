import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  res.json({ success: true, message: "Service is healthy", data: { status: "ok" } });
});

export default router;
