import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, assetCategories, assets } from "@workspace/db";
import { requireAuth, requireAdminRole } from "../lib/auth";
import { count } from "drizzle-orm";

const router = Router();

router.get("/v1/categories", requireAuth, async (req, res) => {
  try {
    const rows = await db
      .select({
        id: assetCategories.id,
        categoryName: assetCategories.categoryName,
        description: assetCategories.description,
        createdAt: assetCategories.createdAt,
      })
      .from(assetCategories)
      .orderBy(assetCategories.categoryName);
    res.json({ success: true, message: "Categories retrieved", data: rows });
  } catch (err) {
    req.log.error({ err }, "Get categories error");
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.post("/v1/categories", requireAdminRole, async (req, res) => {
  const { category_name, description } = req.body;
  if (!category_name) {
    res.status(400).json({ success: false, message: "category_name is required" });
    return;
  }
  try {
    const [row] = await db
      .insert(assetCategories)
      .values({ categoryName: category_name, description })
      .returning();
    res.status(201).json({ success: true, message: "Category created", data: row });
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "23505") {
      res.status(409).json({ success: false, message: "Category name already exists" });
      return;
    }
    req.log.error({ err }, "Create category error");
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.put("/v1/categories/:id", requireAdminRole, async (req, res) => {
  const { category_name, description } = req.body;
  try {
    const [row] = await db
      .update(assetCategories)
      .set({
        categoryName: category_name,
        description,
      })
      .where(eq(assetCategories.id, req.params.id as string))
      .returning();
    if (!row) {
      res.status(404).json({ success: false, message: "Category not found" });
      return;
    }
    res.json({ success: true, message: "Category updated", data: row });
  } catch (err) {
    req.log.error({ err }, "Update category error");
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.delete("/v1/categories/:id", requireAdminRole, async (req, res) => {
  try {
    const [row] = await db
      .delete(assetCategories)
      .where(eq(assetCategories.id, req.params.id as string))
      .returning();
    if (!row) {
      res.status(404).json({ success: false, message: "Category not found" });
      return;
    }
    res.json({ success: true, message: "Category deleted" });
  } catch (err) {
    req.log.error({ err }, "Delete category error");
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

export default router;
