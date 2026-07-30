import { z } from "zod";

// Import request body validation (facturen -> "Facturen ophalen").
export const importRequestSchema = z.object({
  year: z
    .number({ coerce: true })
    .int()
    .min(2000)
    .max(2100),
  quarter: z
    .number({ coerce: true })
    .int()
    .min(1)
    .max(4),
  // "all" or a specific gmail_connection uuid.
  mailbox: z
    .string()
    .min(1)
    .default("all"),
});

export type ImportRequest = z.infer<typeof importRequestSchema>;

// Query params for filtering the stored invoice list.
export const invoiceFilterSchema = z.object({
  mailbox: z.string().optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  quarter: z.coerce.number().int().min(1).max(4).optional(),
});

export type InvoiceFilter = z.infer<typeof invoiceFilterSchema>;

// Connect request: which mailbox slot / optional login hint.
export const connectRequestSchema = z.object({
  loginHint: z.string().email().optional(),
  reconnect: z.coerce.boolean().optional(),
});
