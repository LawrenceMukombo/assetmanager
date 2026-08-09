import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type LocalObjectMetadata = {
  contentType: string;
  originalName?: string;
};

export function usesLocalObjectStorage(): boolean {
  return Boolean(process.env.LOCAL_OBJECT_DIR) || !process.env.PRIVATE_OBJECT_DIR;
}

export function getLocalObjectRoot(): string {
  return path.resolve(process.env.LOCAL_OBJECT_DIR || path.join(process.cwd(), "data", "objects"));
}

export async function createLocalUploadTarget(): Promise<{
  uploadURL: string;
  objectPath: string;
}> {
  const objectId = randomUUID();
  await mkdir(path.join(getLocalObjectRoot(), "uploads"), { recursive: true });
  return {
    uploadURL: `/api/storage/uploads/${objectId}`,
    objectPath: `/objects/uploads/${objectId}`,
  };
}

export async function saveLocalUpload({
  objectId,
  body,
  contentType,
  originalName,
}: {
  objectId: string;
  body: Buffer;
  contentType?: string;
  originalName?: string;
}): Promise<void> {
  if (!UUID_PATTERN.test(objectId)) {
    throw new Error("Invalid upload identifier");
  }

  const uploadDir = path.join(getLocalObjectRoot(), "uploads");
  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, objectId), body, { flag: "wx" });
  await writeFile(
    path.join(uploadDir, `${objectId}.metadata.json`),
    JSON.stringify({ contentType: contentType || "application/octet-stream", originalName } satisfies LocalObjectMetadata),
    { flag: "wx" },
  );
}

export async function openLocalObject(objectPath: string): Promise<{
  stream: ReturnType<typeof createReadStream>;
  contentType: string;
  size: number;
}> {
  const normalized = objectPath.replaceAll("\\", "/");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length !== 2 || parts[0] !== "uploads" || !UUID_PATTERN.test(parts[1])) {
    throw new Error("Object not found");
  }

  const uploadDir = path.join(getLocalObjectRoot(), "uploads");
  const filePath = path.join(uploadDir, parts[1]);
  const metadataPath = path.join(uploadDir, `${parts[1]}.metadata.json`);
  const [fileStat, rawMetadata] = await Promise.all([
    stat(filePath),
    readFile(metadataPath, "utf8").catch(() => "{}"),
  ]);
  const metadata = JSON.parse(rawMetadata) as Partial<LocalObjectMetadata>;

  return {
    stream: createReadStream(filePath),
    contentType: metadata.contentType || "application/octet-stream",
    size: fileStat.size,
  };
}
