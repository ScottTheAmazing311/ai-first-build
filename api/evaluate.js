import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const EVAL_SYSTEM = `You are evaluating whether a user's Claude Code prompt is specific enough to build something real.

You will receive:
- userPrompt: what the user typed
- step: 3 (file creation) or 4 (function creation)
- project: the project type (journal, summarizer, travel, freeform)
- projectName: display name of the project

## Step 3 criteria (file creation):
Approve (score ≥ 7) if the prompt:
- Mentions a specific filename OR what to create (e.g. "journal.js", "app.js", "a file")
- AND mentions connecting to Claude / Anthropic / the API / SDK

Reject if it's too vague (e.g. "make it work", "build the app", "start coding", "write code").

## Step 4 criteria (function/AI behavior):
Approve (score ≥ 7) if the prompt:
- Mentions a specific function name (e.g. "reflect()", "summarize()", "chat()")
- AND describes what it takes or does
- AND gives some hint about the AI's behavior or personality

Reject if it just says "add AI" or "make it smarter" without specifics.

## Output format (respond ONLY with valid JSON, no markdown, no explanation):
{
  "approved": true or false,
  "score": 1-10,
  "suggestion": "12 words or fewer, direct Claude Code imperative style, like: add a reflect() function that takes a journal entry",
  "explanation": "One sentence starting with what was missing, e.g.: Naming the function and its parameter tells Claude exactly what shape to build.",
  "extractedPrompt": null for step 3; for step 4 a full AI system prompt (2-4 sentences) derived from the user's description of personality/behavior — make it rich and specific
}

The suggestion should be something the user could type verbatim and have it approved. Make it specific and actionable.
Keep extractedPrompt warm and personality-forward (not just technical).`;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { userPrompt, step, project, projectName } = req.body;

  if (!userPrompt || !step) {
    return res.status(400).json({ error: "userPrompt and step are required" });
  }

  try {
    const userMsg = `userPrompt: "${userPrompt}"
step: ${step}
project: ${project || "unknown"}
projectName: ${projectName || project || "unknown"}`;

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 512,
      system: EVAL_SYSTEM,
      messages: [{ role: "user", content: userMsg }],
    });

    const raw = response.content[0].text.trim();

    // Strip markdown code fences if present
    const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();

    let result;
    try {
      result = JSON.parse(cleaned);
    } catch {
      // Fallback: approve with a generic suggestion
      result = {
        approved: false,
        score: 3,
        suggestion: step === 3
          ? "create journal.js and connect to Anthropic SDK"
          : "add a chat() function that takes user input and returns Claude's response",
        explanation: "Be specific about what to name and build.",
        extractedPrompt: null,
      };
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error("Evaluate API error:", err);
    return res.status(500).json({ error: "Evaluation failed", detail: err.message });
  }
}
