import { Router, type IRouter } from "express";
import healthRouter from "./health";
import publicRouter from "./public";
import authRouter from "./auth";
import locationsRouter from "./locations";
import usersRouter from "./users";
import categoriesRouter from "./categories";
import assetsRouter from "./assets";
import dashboardRouter from "./dashboard";
import reportsRouter from "./reports";
import notificationsRouter from "./notifications";
import storageRouter from "./storage";
import auditRouter from "./audit";
import maintenanceRouter from "./maintenance";

const router: IRouter = Router();

router.use(healthRouter);
router.use(publicRouter);
router.use(authRouter);
router.use(locationsRouter);
router.use(usersRouter);
router.use(categoriesRouter);
router.use(assetsRouter);
router.use(dashboardRouter);
router.use(reportsRouter);
router.use(notificationsRouter);
router.use(storageRouter);
router.use(auditRouter);
router.use(maintenanceRouter);

export default router;
