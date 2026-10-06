import express from "express";
import axios from "axios";
import indexRouter from "./routers/index.router";

const PORT = Number(process.env.PORT) || 3000;
const startedAt = Date.now();

const app = express();
app.use(express.json());

app.get("/health", async (_req, res) => {
 return res.json({
    status: "ok",
    uptimeMs: Date.now() - startedAt,
  });
});

app.use("/", indexRouter);

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
