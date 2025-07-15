const SAFETY_RESPONSE = "I can only assist with programming problems.";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "gemini_chat") {
    const { apiKey, history } = request;
    
    // Check for prompt injection
    const lastUserMessage = request.history
      .slice().reverse()
      .find(m => m.role === "user")?.parts[0]?.text || "";
      
    if (isPromptInjection(lastUserMessage)) {
      sendResponse({ reply: SAFETY_RESPONSE });
      return true;
    }

    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const payload = {
      contents: history,
      generationConfig: {
        temperature: 0.9,
        topK: 1,
        topP: 1,
        maxOutputTokens: 2048
      },
      safetySettings: [
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: 4 },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: 4 },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: 4 },
        { category: "HARM_CATEGORY_HARASSMENT", threshold: 4 },
        { category: "HARM_CATEGORY_CIVIC_INTEGRITY", threshold: 4 }
      ]
    };

    if (
      !Array.isArray(history) ||
      !history.every(
        (h) =>
          h.role &&
          ["user", "model"].includes(h.role) &&
          Array.isArray(h.parts) &&
          h.parts.every((p) => typeof p.text === "string")
      )
    ) {
      sendResponse({ error: "Invalid history format." });
      return;
    }

    (async () => {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`HTTP error! status: ${res.status}\nResponse: ${text}`);
        }

        const data = await res.json();
        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "No reply.";
        sendResponse({ reply });
      } catch (err) {
        console.error("Gemini API error:", err);
        sendResponse({ error: err.message });
      }
    })();

    return true;
  }
});

// NEW: Prompt injection detection
function isPromptInjection(text) {
  const injections = [
    "ignore previous",
    "as a different persona",
    "you are now",
    "system prompt",
    "disregard instructions"
  ];
  
  const lowerText = text.toLowerCase();
  return injections.some(term => lowerText.includes(term)) || 
    /(how|what) (are you|is your)/.test(lowerText);
}