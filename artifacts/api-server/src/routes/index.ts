import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import locationsRouter from "./locations";
import usersRouter from "./users";
import categoriesRouter from "./categories";
import assetsRouter from "./assets";
import dashboardRouter from "./dashboard";
import reportsRouter from "./reports";
import notificationsRouter from "./notifications";
import storageRouter from "./storage";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(locationsRouter);
router.use(usersRouter);
router.use(categoriesRouter);
router.use(assetsRouter);
router.use(dashboardRouter);
router.use(reportsRouter);
router.use(notificationsRouter);
router.use(storageRouter);

export default router;
