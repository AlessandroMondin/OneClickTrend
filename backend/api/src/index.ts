import express from "express";

const app = express();
const PORT = Number(process.env.PORT ?? 3000);

app.get("/hello", (_req, res) => {
  res.json({ message: "hello world" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`API listening on http://0.0.0.0:${PORT}`);
});
