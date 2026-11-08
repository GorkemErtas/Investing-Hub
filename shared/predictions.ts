import { z } from "zod";
import { assets, predictionSchema } from "./contracts.js";
export type Prediction = z.infer<typeof predictionSchema>;
export const predictionPublicationSchema = z
  .strictObject({
    version: z.literal("price-predictions-v1"),
    generatedAt: z.string().datetime(),
    registry: z.strictObject({
      size: z.number().int().nonnegative(),
      mtimeNs: z.string().regex(/^\d+$/),
    }),
    forecasts: z.array(predictionSchema).length(assets.length),
  })
  .superRefine((value, ctx) => {
    if (
      new Set(value.forecasts.map((item) => item.symbol)).size !==
        assets.length ||
      value.forecasts.some(
        (item) =>
          item.status === "disabled_unvalidated" ||
          Date.parse(item.predictionTimestamp) > Date.parse(value.generatedAt),
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "Require every asset once with valid generation times",
      });
  });
