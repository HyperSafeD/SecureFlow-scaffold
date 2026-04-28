import { Router } from "express";
import multer from "multer";
import { getSupabase } from "../lib/supabase.js";

export const uploadRouter = Router();

const BUCKET = "milestone-attachments";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "application/zip",
  "application/x-zip-compressed",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter(_req, file, cb) {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not allowed`));
    }
  },
});

uploadRouter.post(
  "/milestone",
  upload.single("file"),
  async (req, res) => {
    const supabase = getSupabase();
    if (!supabase) {
      res.status(503).json({ error: "Storage not configured" });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "No file provided" });
      return;
    }

    const escrowId = String(req.body.escrow_id ?? "unknown");
    const milestoneIndex = String(req.body.milestone_index ?? "0");
    const ext = file.originalname.split(".").pop() ?? "bin";
    const path = `${escrowId}/${milestoneIndex}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.${ext}`;

    // Ensure bucket exists (idempotent – ignore "already exists" errors)
    await supabase.storage.createBucket(BUCKET, {
      public: true,
      allowedMimeTypes: Array.from(ALLOWED_MIME_TYPES),
      fileSizeLimit: MAX_FILE_SIZE,
    });

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, file.buffer, {
        contentType: file.mimetype,
        upsert: true, // upsert=true avoids duplicate-key errors on retry
      });

    if (uploadError) {
      const hint =
        uploadError.message.includes("row-level security") ||
        uploadError.message.includes("violates")
          ? " — ensure the Supabase storage RLS policy allows inserts, or use the service_role key"
          : "";
      res.status(500).json({ error: uploadError.message + hint });
      return;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(BUCKET).getPublicUrl(path);

    res.status(201).json({
      url: publicUrl,
      filename: file.originalname,
      size: file.size,
      mimeType: file.mimetype,
    });
  },
);
