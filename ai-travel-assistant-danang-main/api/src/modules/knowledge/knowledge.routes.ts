import { Router } from "express";
import { readTextQuery } from "../../common/validate.ts";
import { requireAuth } from "../auth/auth.middleware.ts";
import * as knowledge from "./knowledge.service.ts";

export const knowledgeRouter = Router();

knowledgeRouter.use(requireAuth);

knowledgeRouter.get("/search", async (req, res) => {
  const query = readTextQuery(req.query.q, 300);
  if (!query) {
    res.json({ chunks: [] });
    return;
  }
  res.json({ chunks: await knowledge.searchKnowledge(query) });
});
