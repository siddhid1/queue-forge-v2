import express, { type Express } from "express";
import routes from "./routes/index.js";
import { errorHandler } from "./middleware/error-handler.js";
import { requestContext } from "./middleware/request-context.js";

export const app: Express = express();

app.use(express.json());
app.use(requestContext);

app.use("/api/v1", routes);

app.get("/health", (_req, res) => {
  res.status(200).json({
    success: true,
    service: "api",
  });
});

app.use(errorHandler);
