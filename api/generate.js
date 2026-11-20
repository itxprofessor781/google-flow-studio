import { GoogleGenAI, Type } from "@google/genai";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY missing in environment variables." });
  }

  try {
    const {
      idea,
      style = "3D Cartoon Animation",
      targetMinutes = 1,
      scenesCount = 8
    } = req.body || {};

    if (!idea || !idea.trim()) {
      return res.status(400).json({ error: "Please enter an idea first." });
    }

    const ai = new GoogleGenAI({ apiKey });

    const prompt = `You are a creative director building a Google Flow-style multi-scene video and voiceover production timeline.
User Idea: ${idea.trim()}
Visual Style: ${style}
Target Video Length: ~${targetMinutes} minute(s)
Number of Scenes: ${scenesCount}

Create a structured timeline for a ~${targetMinutes}-minute video divided into ${scenesCount} connected scenes.
For each scene, provide:
- sceneNumber (1, 2, ...)
- title (short scene title)
- durationSec (estimated seconds for this scene, e.g., 10 to 20 so total fits ~${targetMinutes} minute(s))
- voiceoverText (natural narration/voiceover lines spoken during this scene)
- cameraAndMotion (camera angle, movement, lighting)
- flowPrompt (detailed visual/video prompt for Google Flow / AI visual generation, keeping visual consistency)
- transitionNote (how it transitions to the next scene)`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            projectTitle: { type: Type.STRING },
            styleSummary: { type: Type.STRING },
            totalEstimatedSeconds: { type: Type.INTEGER },
            scenes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  sceneNumber: { type: Type.INTEGER },
                  title: { type: Type.STRING },
                  durationSec: { type: Type.INTEGER },
                  voiceoverText: { type: Type.STRING },
                  cameraAndMotion: { type: Type.STRING },
                  flowPrompt: { type: Type.STRING },
                  transitionNote: { type: Type.STRING }
                },
                required: [
                  "sceneNumber",
                  "title",
                  "durationSec",
                  "voiceoverText",
                  "cameraAndMotion",
                  "flowPrompt",
                  "transitionNote"
                ]
              }
            }
          },
          required: ["projectTitle", "styleSummary", "totalEstimatedSeconds", "scenes"]
        }
      }
    });

    const data = JSON.parse(response.text);
    return res.status(200).json(data);
  } catch (err) {
    console.error("Generate error:", err);
    return res.status(500).json({
      error: "Failed to generate flow timeline. Check your API key or try again."
    });
  }
}
