import mongoose, { Types } from "mongoose";
import { nanoid } from "nanoid";

// --- Mongoose Schema ---
const TaskSchema = new mongoose.Schema(
  {
    publicId: {
      type: String,
      unique: true,
      index: true,
      default: () => `tsk_${nanoid(8)}`,
    },
    parentId: { type: String, default: null },
    title: { type: String, required: true },
    description: { type: String, default: null },
    status: {
      type: String,
      enum: ["pending", "in_progress", "completed"],
      default: "pending",
    },
  },
  { timestamps: true },
);

// Hook: propagate completion and progress
TaskSchema.methods.recalculateStatus = async function () {
  const children = await Task.find({ parentId: this._id });
  if (children.length === 0) return; // leaf

  const allCompleted = children.every((c) => c.status === "completed");
  const anyInProgress = children.some((c) => c.status === "in_progress");

  if (allCompleted) this.status = "completed";
  else if (anyInProgress) this.status = "in_progress";
};

TaskSchema.post("save", async function () {
  if (this.parentId) {
    const parent = await Task.findById(this.parentId);
    if (parent) {
      // @ts-ignore
      await parent.recalculateStatus();
      await parent.save();
    }
  }
});

export const Task = mongoose.model("Task", TaskSchema);
