import { z } from 'zod';

// Bungkus handler async agar error masuk ke error handler pusat.
export const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Validasi input dengan zod. Jika gagal, kirim 400 dan kembalikan null.
export function parse(schema, data, res) {
  const result = schema.safeParse(data);
  if (!result.success) {
    res.status(400).json({
      error: 'Input tidak valid',
      details: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
    return null;
  }
  return result.data;
}

export const eventIdParam = z.object({ id: z.coerce.number().int().positive() });
