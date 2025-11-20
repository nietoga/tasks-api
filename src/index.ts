// demo Fastify + Mongoose API for tasks and subtasks
import Fastify from "fastify";
import mongoose from "mongoose";
import swaggerPlugins from "./plugins/swagger.js";
import tasksRoutes from "./routes/tasks.js";
import dotenv from "dotenv";
dotenv.config();

// --- Fastify ---
const app = Fastify({ logger: true });
app.register(swaggerPlugins);
app.register(tasksRoutes);

// Start
const start = async () => {
  await mongoose.connect(
    process.env.MONGO_URI || "mongodb://localhost:27017/",
    {
      dbName: process.env.MONGO_DB_NAME || "tasks",
    },
  );
  await app.listen({ port: 3000, host: "0.0.0.0" });
};

await start();
