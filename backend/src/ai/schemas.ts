import { z } from "zod";

export const taskSplitSchema = z.object({
  subtasks: z
    .array(
      z.object({
        title: z.string().trim().min(1),
        estimated_hours: z.number().positive().optional(),
      }),
    )
    .min(1),
});

export type TaskSplitPayload = z.infer<typeof taskSplitSchema>;
