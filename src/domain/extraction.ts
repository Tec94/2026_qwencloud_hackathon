import { z } from "zod";
import { MEMORY_CATEGORIES } from "./models";

export const extractedMemorySchema = z.object({
  category: z.enum(MEMORY_CATEGORIES),
  statement: z.string().trim().min(4).max(600),
  importance: z.number().int().min(1).max(5),
  confidence: z.number().min(0).max(1),
  supersedesMemoryId: z.uuid().nullable().optional(),
});

export const sessionExtractionSchema = z.object({
  narrative: z.string().trim().min(8).max(2_400),
  themes: z.array(z.string().trim().min(2).max(120)).max(8),
  followUps: z.array(z.string().trim().min(2).max(240)).max(8),
  safetyFlags: z.array(z.string().trim().min(2).max(120)).max(8),
  memories: z.array(extractedMemorySchema).max(12),
});
