import { z } from "zod";
import { TenderSource, TenderStatus } from "./enums";

export const TenderInput = z.object({
  source: TenderSource,
  externalId: z.string().optional(),
  title: z.string().min(3).max(500),
  buyerOrg: z.string().min(2).max(300),
  description: z.string().optional(),
  publishedAt: z.string().optional(),
  submissionDeadline: z.string().optional(),
  openingDate: z.string().optional(),
  estimatedValue: z.number().nonnegative().optional(),
  emd: z.number().nonnegative().optional(),
  category: z.string().optional(),
  productMatch: z
    .array(z.enum(["army_boots", "oxford_shoes", "jackets", "accessories"]))
    .optional(),
  url: z.string().url().optional(),
  documentUrls: z.array(z.string().url()).optional(),
  rawPayload: z.record(z.unknown()).optional(),
  status: TenderStatus.default("new"),
  assignedTo: z.string().uuid().optional(),
  notes: z.string().optional(),
});
export type TenderInput = z.infer<typeof TenderInput>;
