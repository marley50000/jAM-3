import { GoogleGenAI } from "@google/genai";

// Initialize the Gemini API client
// The API key is injected via process.env.API_KEY by the environment
export const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
