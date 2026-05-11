import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, assetCategories, assets } from "@workspace/db";
import { requireAuth, requireAssetAdmin } from "../lib/auth";
import { count } from "drizzle-orm";

const router = Router();

// Returns:
//   { provided: false }                 — caller omitted category_code
//   { provided: true, code: "" }        — caller cleared it (use derive)
//   { provided: true, code: "BLD" }     — valid uppercase code
//   { provided: true, code: null }      — invalid (reject)
function normalizeCategoryCode(input: unknown): { provided: boolean; code: string | null } {
  if (input === undefined) return { provided: false };
  if (input === null) return { provided: true, code: "" };
  const s = String(input).trim().toUpperCase();
  if (s === "") return { provided: true, code: "" };
  return { provided: true, code: /^[A-Z]{2,5}$/.test(s) ? s : null };
}

function deriveCategoryCode(name: string): string {
  const letters = name.replace(/[^A-Za-z]/g, "").toUpperCase();
  return letters.slice(0, 3) || "GEN";
}

router.get("/v1/categories", requireAuth, async (req, res) => {
  try {
    const rows = await db
      .select({
        id: assetCategories.id,
        categoryName: assetCategories.categoryName,
        categoryCode: assetCategories.categoryCode,
        description: assetCategories.description,
        createdAt: assetCategories.createdAt,
        assetCount: count(assets.id),
      })
      .from(assetCategories)
      .leftJoin(assets, eq(assets.categoryId, assetCategories.id))
      .groupBy(assetCategories.id)
      .orderBy(assetCategories.categoryName);
    res.json({ success: true, message: "Categories retrieved", data: rows });
  } catch (err) {
    req.log.error({ err }, "Get categories error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.post("/v1/categories", requireAuth, requireAssetAdmin, async (req, res) => {
  const { category_name, category_code, description } = req.body;
  if (!category_name) {
    res.status(400).json({ success: false, message: "category_name is required", data: null });
    return;
  }
  const normalized = normalizeCategoryCode(category_code);
  if (normalized.provided && normalized.code === null) {
    res.status(400).json({ success: false, message: "category_code must be 2-5 letters", data: null });
    return;
  }
  // If omitted or cleared, derive from the name so we never persist an empty code.
  const finalCode = normalized.provided && normalized.code
    ? normalized.code
    : deriveCategoryCode(category_name);
  try {
    const [row] = await db
      .insert(assetCategories)
      .values({ categoryName: category_name, categoryCode: finalCode, description })
      .returning();
    res.status(201).json({ success: true, message: "Category created", data: row });
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "23505") {
      res.status(409).json({ success: false, message: "Category name already exists", data: null });
      return;
    }
    req.log.error({ err }, "Create category error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.put("/v1/categories/:id", requireAuth, requireAssetAdmin, async (req, res) => {
  const { category_name, category_code, description } = req.body;
  const normalized = normalizeCategoryCode(category_code);
  if (normalized.provided && normalized.code === null) {
    res.status(400).json({ success: false, message: "category_code must be 2-5 letters", data: null });
    return;
  }
  try {
    const updates: Record<string, unknown> = {
      categoryName: category_name,
      description,
    };
    if (normalized.provided) {
      // Caller explicitly sent a code: use it, or derive from name when cleared.
      updates.categoryCode = normalized.code
        ? normalized.code
        : (category_name ? deriveCategoryCode(category_name) : undefined);
    }
    const [row] = await db
      .update(assetCategories)
      .set(updates)
      .where(eq(assetCategories.id, req.params.id as string))
      .returning();
    if (!row) {
      res.status(404).json({ success: false, message: "Category not found", data: null });
      return;
    }
    res.json({ success: true, message: "Category updated", data: row });
  } catch (err) {
    req.log.error({ err }, "Update category error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.delete("/v1/categories/:id", requireAuth, requireAssetAdmin, async (req, res) => {
  try {
    const [row] = await db
      .delete(assetCategories)
      .where(eq(assetCategories.id, req.params.id as string))
      .returning();
    if (!row) {
      res.status(404).json({ success: false, message: "Category not found", data: null });
      return;
    }
    res.json({ success: true, message: "Category deleted", data: null });
  } catch (err) {
    req.log.error({ err }, "Delete category error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

export default router;
