import { Router } from "express";
import { and, eq, ne, sql, count } from "drizzle-orm";
import { db, assetCategories, assets } from "@workspace/db";
import { requireAuth, requireAssetAdmin } from "../lib/auth";

const router = Router();

let hasEnsuredCategoryColumns = false;
async function ensureCategoryColumns() {
  if (hasEnsuredCategoryColumns) return;
  try {
    await db.execute(sql`
      ALTER TABLE asset_categories ADD COLUMN IF NOT EXISTS industry varchar(100);
    `);
    hasEnsuredCategoryColumns = true;
  } catch {
    // Non-fatal if column already exists
  }
}

// Returns:
//   { provided: false }                 — caller omitted category_code
//   { provided: true, code: "" }        — caller cleared it (use derive)
//   { provided: true, code: "BLD" }     — valid uppercase code
//   { provided: true, code: null }      — invalid (reject)
function normalizeCategoryCode(input: unknown): { provided: boolean; code?: string | null } {
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

// Returns:
//   { provided: false }                   — caller omitted icon_name
//   { provided: true, value: null }       — caller cleared it (use null)
//   { provided: true, value: "monitor" }  — valid icon name
//   { provided: true, value: undefined }  — invalid (reject)
function normalizeIconName(input: unknown): { provided: boolean; value?: string | null } {
  if (input === undefined) return { provided: false };
  if (input === null) return { provided: true, value: null };
  const s = String(input).trim();
  if (s === "") return { provided: true, value: null };
  if (s.length > 50 || !/^[A-Za-z0-9_-]+$/.test(s)) {
    return { provided: true, value: undefined };
  }
  return { provided: true, value: s };
}

function normalizeAccentColor(input: unknown): { provided: boolean; value?: string | null } {
  if (input === undefined) return { provided: false };
  if (input === null) return { provided: true, value: null };
  const s = String(input).trim();
  if (s === "") return { provided: true, value: null };
  if (!/^#[0-9A-Fa-f]{6}$/.test(s)) {
    return { provided: true, value: undefined };
  }
  return { provided: true, value: s.toLowerCase() };
}

router.get("/v1/categories", requireAuth, async (req, res) => {
  try {
    await ensureCategoryColumns();
    const rows = await db
      .select({
        id: assetCategories.id,
        categoryName: assetCategories.categoryName,
        categoryCode: assetCategories.categoryCode,
        industry: assetCategories.industry,
        description: assetCategories.description,
        iconName: assetCategories.iconName,
        accentColor: assetCategories.accentColor,
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
  await ensureCategoryColumns();
  const { category_name, category_code, industry, description, icon_name, accent_color } = req.body;
  if (!category_name) {
    res.status(400).json({ success: false, message: "category_name is required", data: null });
    return;
  }
  const normalized = normalizeCategoryCode(category_code);
  if (normalized.provided && normalized.code === null) {
    res.status(400).json({ success: false, message: "category_code must be 2-5 letters", data: null });
    return;
  }
  const normalizedIcon = normalizeIconName(icon_name);
  if (normalizedIcon.provided && normalizedIcon.value === undefined) {
    res.status(400).json({ success: false, message: "icon_name is invalid", data: null });
    return;
  }
  const normalizedColor = normalizeAccentColor(accent_color);
  if (normalizedColor.provided && normalizedColor.value === undefined) {
    res.status(400).json({ success: false, message: "accent_color must be a hex color like #3b82f6", data: null });
    return;
  }
  // If omitted or cleared, derive from the name so we never persist an empty code.
  const finalCode = normalized.provided && normalized.code
    ? normalized.code
    : deriveCategoryCode(category_name);
  try {
    const existingCode = await db
      .select({ id: assetCategories.id })
      .from(assetCategories)
      .where(eq(assetCategories.categoryCode, finalCode))
      .limit(1);
    if (existingCode.length > 0) {
      res.status(409).json({
        success: false,
        message: `Code "${finalCode}" is already used by another category`,
        data: null,
      });
      return;
    }
    const [row] = await db
      .insert(assetCategories)
      .values({
        categoryName: category_name,
        categoryCode: finalCode,
        industry: industry ? String(industry).trim() : null,
        description,
        iconName: normalizedIcon.provided ? normalizedIcon.value ?? null : null,
        accentColor: normalizedColor.provided ? normalizedColor.value ?? null : null,
      })
      .returning();
    res.status(201).json({ success: true, message: "Category created", data: row });
  } catch (err: unknown) {
    const pgErr = err as NodeJS.ErrnoException & { constraint?: string };
    if (pgErr.code === "23505") {
      const message = pgErr.constraint === "uniq_asset_categories_category_code"
        ? `Code "${finalCode}" is already used by another category`
        : "Category name already exists";
      res.status(409).json({ success: false, message, data: null });
      return;
    }
    req.log.error({ err }, "Create category error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.put("/v1/categories/:id", requireAuth, requireAssetAdmin, async (req, res) => {
  await ensureCategoryColumns();
  const { category_name, category_code, industry, description, icon_name, accent_color } = req.body;
  const normalized = normalizeCategoryCode(category_code);
  if (normalized.provided && normalized.code === null) {
    res.status(400).json({ success: false, message: "category_code must be 2-5 letters", data: null });
    return;
  }
  const normalizedIcon = normalizeIconName(icon_name);
  if (normalizedIcon.provided && normalizedIcon.value === undefined) {
    res.status(400).json({ success: false, message: "icon_name is invalid", data: null });
    return;
  }
  const normalizedColor = normalizeAccentColor(accent_color);
  if (normalizedColor.provided && normalizedColor.value === undefined) {
    res.status(400).json({ success: false, message: "accent_color must be a hex color like #3b82f6", data: null });
    return;
  }
  try {
    const updates: Record<string, unknown> = {
      categoryName: category_name,
      description,
    };
    if (industry !== undefined) updates.industry = industry ? String(industry).trim() : null;
    if (normalizedIcon.provided) updates.iconName = normalizedIcon.value;
    if (normalizedColor.provided) updates.accentColor = normalizedColor.value;
    let nextCode: string | undefined;
    if (normalized.provided) {
      // Caller explicitly sent a code: use it, or derive from name when cleared.
      nextCode = normalized.code
        ? normalized.code
        : (category_name ? deriveCategoryCode(category_name) : undefined);
      if (nextCode !== undefined) updates.categoryCode = nextCode;
    }
    if (nextCode) {
      const clash = await db
        .select({ id: assetCategories.id })
        .from(assetCategories)
        .where(and(
          eq(assetCategories.categoryCode, nextCode),
          ne(assetCategories.id, req.params.id as string),
        ))
        .limit(1);
      if (clash.length > 0) {
        res.status(409).json({
          success: false,
          message: `Code "${nextCode}" is already used by another category`,
          data: null,
        });
        return;
      }
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
  } catch (err: unknown) {
    const pgErr = err as NodeJS.ErrnoException & { constraint?: string };
    if (pgErr.code === "23505") {
      const message = pgErr.constraint === "uniq_asset_categories_category_code"
        ? "That code is already used by another category"
        : "Category name already exists";
      res.status(409).json({ success: false, message, data: null });
      return;
    }
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

router.post("/v1/categories/bulk", requireAuth, requireAssetAdmin, async (req, res) => {
  await ensureCategoryColumns();
  const items = req.body?.items;
  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ success: false, message: "items must be a non-empty array", data: null });
    return;
  }

  let createdCount = 0;
  let updatedCount = 0;
  const errors: { row: number; name?: string; error: string }[] = [];

  for (let idx = 0; idx < items.length; idx++) {
    const raw = items[idx];
    const rowNum = idx + 1;
    const catName = String(raw.category_name || raw.name || raw.categoryName || "").trim();
    if (!catName) {
      errors.push({ row: rowNum, error: "category_name is required" });
      continue;
    }

    let code = String(raw.category_code || raw.code || raw.categoryCode || "").trim().toUpperCase();
    if (!code || !/^[A-Z]{2,5}$/.test(code)) {
      code = deriveCategoryCode(catName);
    }

    const industry = raw.industry ? String(raw.industry).trim() : null;
    const description = raw.description ? String(raw.description).trim() : null;
    const iconName = raw.icon_name || raw.iconName || null;
    const accentColor = raw.accent_color || raw.accentColor || null;

    try {
      // Check existing by name or code
      const [existingByName] = await db
        .select({ id: assetCategories.id, code: assetCategories.categoryCode })
        .from(assetCategories)
        .where(eq(assetCategories.categoryName, catName))
        .limit(1);

      if (existingByName) {
        await db
          .update(assetCategories)
          .set({
            ...(industry ? { industry } : {}),
            ...(description ? { description } : {}),
            ...(iconName ? { iconName } : {}),
            ...(accentColor ? { accentColor } : {}),
          })
          .where(eq(assetCategories.id, existingByName.id));
        updatedCount++;
      } else {
        // Ensure code doesn't conflict
        const [existingCode] = await db
          .select({ id: assetCategories.id })
          .from(assetCategories)
          .where(eq(assetCategories.categoryCode, code))
          .limit(1);

        if (existingCode) {
          code = deriveCategoryCode(catName + Math.floor(10 + Math.random() * 89));
        }

        await db.insert(assetCategories).values({
          categoryName: catName,
          categoryCode: code,
          industry,
          description,
          iconName,
          accentColor,
        });
        createdCount++;
      }
    } catch (err: any) {
      errors.push({ row: rowNum, name: catName, error: err.message || "Failed to save category" });
    }
  }

  res.json({
    success: true,
    message: `Batch category import completed: ${createdCount} created, ${updatedCount} updated${errors.length > 0 ? `, ${errors.length} errors` : ""}`,
    data: {
      total: items.length,
      created: createdCount,
      updated: updatedCount,
      failed: errors.length,
      errors,
    },
  });
});

export default router;
