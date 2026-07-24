import { z } from "zod";

/**
 * PostgreSQL accepts canonical 8-4-4-4-12 UUID text independently of RFC
 * version and variant bits. Repository DTOs mirror the database type instead
 * of Zod's narrower RFC-only uuid validator.
 */
export const postgresUuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
