import "dotenv/config";
import cors from "cors";
import express from "express";
import { requireApiSecret } from "./middleware/auth.js";
import { aiRouter } from "./routes/ai.js";
import { notificationsRouter } from "./routes/notifications.js";
import { uploadRouter } from "./routes/upload.js";
import { messagesRouter } from "./routes/messages.js";

const app = express();
const port = Number(process.env.PORT) || 8787;
const apiSecret = process.env.API_SECRET;

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(express.json({ limit: "10mb" }));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    groq: !!process.env.GROQ_API_KEY,
    supabase: !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
  });
});

const auth = requireApiSecret(apiSecret);

app.use("/v1/ai", auth, aiRouter);
app.use("/v1/notifications", auth, notificationsRouter);
app.use("/v1/upload", auth, uploadRouter);
app.use("/v1/messages", auth, messagesRouter);

app.listen(port, () => {
  console.log(`secureflow-api listening on :${port}`);
  if (!apiSecret) {
    console.warn(
      "[secureflow-api] API_SECRET is unset; /v1 routes are open (set API_SECRET for production)",
    );
  }
});
