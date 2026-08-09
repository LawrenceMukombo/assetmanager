import express, { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { ObjectPermission } from "../lib/objectAcl";
import {
  createLocalUploadTarget,
  openLocalObject,
  saveLocalUpload,
  usesLocalObjectStorage,
} from "../lib/localObjectStorage";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * Then uploads the file directly to the returned presigned URL.
 */
router.post("/storage/uploads/request-url", async (req: Request, res: Response) => {
  const { name, size, contentType } = req.body ?? {};
  if (!name || typeof name !== "string") {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  try {
    if (usesLocalObjectStorage()) {
      const target = await createLocalUploadTarget();
      res.json({ ...target, metadata: { name, size, contentType } });
      return;
    }

    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

    res.json({
      uploadURL,
      objectPath,
      metadata: { name, size, contentType },
    });
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

router.put(
  "/storage/uploads/:objectId",
  express.raw({ type: () => true, limit: process.env.MAX_UPLOAD_SIZE || "50mb" }),
  async (req: Request, res: Response) => {
    if (!usesLocalObjectStorage()) {
      res.status(404).json({ error: "Local uploads are disabled" });
      return;
    }

    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      res.status(400).json({ error: "Upload body is empty" });
      return;
    }

    try {
      const rawObjectId = req.params.objectId;
      const objectId = Array.isArray(rawObjectId) ? rawObjectId[0] : rawObjectId;
      await saveLocalUpload({
        objectId,
        body: req.body,
        contentType: req.get("content-type") || undefined,
        originalName: req.get("x-file-name") || undefined,
      });
      res.status(201).end();
    } catch (error) {
      req.log.error({ err: error }, "Error saving local upload");
      res.status(500).json({ error: "Failed to save upload" });
    }
  },
);

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 * IMPORTANT: Always provide this endpoint when object storage is set up.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const response = await objectStorageService.downloadObject(file);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

/**
 * GET /storage/objects/*
 *
 * Serve object entities from PRIVATE_OBJECT_DIR.
 * These are served from a separate path from /public-objects and can optionally
 * be protected with authentication or ACL checks based on the use case.
 */
router.get("/storage/objects/*path", async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;

    if (usesLocalObjectStorage()) {
      const localObject = await openLocalObject(wildcardPath);
      res.setHeader("Content-Type", localObject.contentType);
      res.setHeader("Content-Length", String(localObject.size));
      res.setHeader("Cache-Control", "private, max-age=3600");
      localObject.stream.pipe(res);
      return;
    }

    const objectPath = `/objects/${wildcardPath}`;
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);

    // --- Protected route example (enable when authentication is required) ---
    // if (!req.isAuthenticated()) {
    //   res.status(401).json({ error: "Unauthorized" });
    //   return;
    // }
    // const canAccess = await objectStorageService.canAccessObjectEntity({
    //   userId: req.user.id,
    //   objectFile,
    //   requestedPermission: ObjectPermission.READ,
    // });
    // if (!canAccess) {
    //   res.status(403).json({ error: "Forbidden" });
    //   return;
    // }

    const response = await objectStorageService.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, "Object not found");
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
