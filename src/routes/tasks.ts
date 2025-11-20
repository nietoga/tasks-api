import {
  Type,
  type FastifyPluginAsyncTypebox,
} from "@fastify/type-provider-typebox";
import { Task } from "../models/task.js";
import type { Types } from "mongoose";

const routes: FastifyPluginAsyncTypebox = async (app) => {
  const StatusEnum = Type.String({
    enum: ["pending", "in_progress", "completed"],
  });

  const TaskCreateSchema = Type.Object({
    parentId: Type.Optional(Type.String()),
    title: Type.String({ minLength: 1 }),
    description: Type.Optional(Type.String()),
    status: Type.Optional(StatusEnum),
  });

  const TaskUpdateSchema = Type.Partial(TaskCreateSchema);

  const TaskIdInParamsSchema = Type.Object({
    id: Type.String(),
  });

  // Create task
  app.post(
    "/tasks",
    {
      schema: {
        body: TaskCreateSchema,
      },
    },
    async (req) => {
      const task = await Task.create(req.body);
      return task;
    },
  );

  // List all tasks
  app.get("/tasks", async () => {
    const tasks = await Task.find().lean();
    return tasks;
  });

  // Get task
  app.get(
    "/tasks/:id",
    {
      schema: {
        params: TaskIdInParamsSchema,
      },
    },
    async (req) => {
      const task = await Task.findById(req.params.id);
      const children = await Task.find({ parentId: req.params.id });
      return { task, children };
    },
  );

  // Update task
  app.patch(
    "/tasks/:id",
    {
      schema: {
        params: TaskIdInParamsSchema,
        body: TaskUpdateSchema,
      },
    },
    async (req) => {
      const taskId = req.params.id;

      // 1. Cargar la tarea actual
      const original = await Task.findById(taskId);
      if (!original) {
        throw app.httpErrors.notFound("Task not found");
      }

      // 2. Validar: si intentan marcarla como completed,
      //    asegurarse de que TODOS sus hijos están completos
      if (req.body.status === "completed") {
        const children = await Task.find({ parentId: taskId });

        const hasIncompleteChildren = children.some(
          (c) => c.status !== "completed",
        );

        if (hasIncompleteChildren) {
          throw app.httpErrors.badRequest(
            "Cannot complete task while subtasks are not completed",
          );
        }
      }

      // 3. Actualizar la tarea
      const updated = await Task.findByIdAndUpdate(taskId, req.body, {
        new: true,
      });

      if (!updated) {
        throw app.httpErrors.notFound("Task not found after update");
      }

      // 4. Si tiene padre, recalcular su estado automáticamente
      if (updated.parentId) {
        const parent = await Task.findById(updated.parentId);

        if (parent) {
          // @ts-ignore — método definido en schema
          await parent.recalculateStatus();
          await parent.save();
        }
      }

      return updated;
    },
  );

  // Recursive delete
  async function deleteRecursively(id: Types.ObjectId | string) {
    const children = await Task.find({ parentId: id });
    for (const child of children) await deleteRecursively(child._id);
    await Task.findByIdAndDelete(id);
  }

  app.delete(
    "/tasks/:id",
    {
      schema: {
        params: TaskIdInParamsSchema,
      },
    },
    async (req) => {
      await deleteRecursively(req.params.id);
      return { deleted: true };
    },
  );

  // Get tree
  async function buildTree(id: Types.ObjectId | string) {
    const node = await Task.findById(id).lean();

    if (!node) {
      return { subtasks: [] };
    }

    const children = await Task.find({ parentId: id }).lean();

    const typedNode = node as typeof node & { subtasks: any[] };

    typedNode.subtasks = [];
    for (const child of children)
      typedNode.subtasks.push(await buildTree(child._id));

    return typedNode;
  }

  app.get(
    "/tasks/:id/tree",
    {
      schema: {
        params: Type.Object({
          id: Type.String(),
        }),
      },
    },
    async (req) => buildTree(req.params.id),
  );
};

export default routes;
