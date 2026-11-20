export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY missing in Vercel Environment Variables." });
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function callGeminiModel(modelName, prompt) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 22000);

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const apiRes = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json"
          }
        })
      });

      const apiData = await apiRes.json();
      return { ok: apiRes.ok, status: apiRes.status, data: apiData };
    } finally {
      clearTimeout(timer);
    }
  }

  try {
    let body = req.body;
    if (typeof body === "string") {
      body = JSON.parse(body || "{}");
    }

    const {
      idea,
      style = "Short-Form Story",
      targetMinutes = 1,
      scenesCount = 4
    } = body || {};

    if (!idea || !String(idea).trim()) {
      return res.status(400).json({ error: "Please enter an idea first." });
    }

    const safeScenes = Math.max(1, Math.min(12, Number(scenesCount) || 4));
    const safeMinutes = Math.max(1, Math.min(5, Number(targetMinutes) || 1));

    const prompt = `You are a creative director building a Google Flow-style multi-scene video and voiceover production timeline.
User Idea: ${String(idea).trim().slice(0, 1200)}
Visual Style: ${style}
Target Video Length: ~${safeMinutes} minute(s)
Number of Scenes: ${safeScenes}

Create a structured timeline for a ~${safeMinutes}-minute video divided into ${safeScenes} connected scenes.
For each scene, provide:
- sceneNumber (1, 2, ...)
- title (short scene title)
- durationSec (estimated seconds for this scene)
- voiceoverText (natural narration/voiceover lines spoken during this scene)
- cameraAndMotion (camera angle, movement, lighting)
- flowPrompt (detailed visual/video prompt for AI visual/video generation, keeping visual consistency)
- transitionNote (how it transitions to the next scene)

Respond ONLY with valid JSON matching this schema:
{
  "projectTitle": "string",
  "styleSummary": "string",
  "totalEstimatedSeconds": 60,
  "scenes": [
    {
      "sceneNumber": 1,
      "title": "string",
      "durationSec": 15,
      "voiceoverText": "string",
      "cameraAndMotion": "string",
      "flowPrompt": "string",
      "transitionNote": "string"
    }
  ]
}`;

    const modelsToTry = ["gemini-3.8-flash", "gemini-flash-latest"];
    let finalData = null;
    let lastError = "Model is currently busy. Please try again.";

    for (const modelName of modelsToTry) {
      let attempt = await callGeminiModel(modelName, prompt);

      if (!attempt.ok && (attempt.status === 503 || attempt.status === 429)) {
        await sleep(600);
        attempt = await callGeminiModel(modelName, prompt);
      }

      if (attempt.ok) {
        finalData = attempt.data;
        break;
      }

      lastError = attempt.data?.error?.message || `Gemini API error (${attempt.status})`;
    }

    if (!finalData) {
      return res.status(503).json({ error: lastError });
    }

    const rawText = finalData?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const cleaned = rawText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const parsed = JSON.parse(cleaned);
    return res.status(200).json(parsed);
  } catch (err) {
    const msg = err?.name === "AbortError"
      ? "Request took too long. Please try again."
      : (err?.message || "Server error while generating timeline.");
    return res.status(500).json({ error: msg });
  }
}
