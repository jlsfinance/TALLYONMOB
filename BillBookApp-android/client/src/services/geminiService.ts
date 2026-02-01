


export interface ParsedBill {
  vendorName?: string;
  date?: string;
  items?: {
    description: string;
    quantity: number;
    rate: number;
    total: number;
  }[];
  total?: number;
}

export const GeminiService = {
  /**
   * Analyzes a bill image using Gemini Flash 1.5
   * @param imageBase64 Base64 string of the image (without data:image/jpeg;base64, prefix if possible, or handle it)
   * @param apiKey User's Gemini API Key
   */
  analyzeBill: async (imageBase64: string, apiKey: string): Promise<ParsedBill> => {
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    const prompt = `
            Analyze this bill/invoice image. Extract the following details in strict JSON format:
            {
                "vendorName": "Name of the supplier/vendor",
                "date": "YYYY-MM-DD",
                "items": [
                    { "description": "Item Name", "quantity": 1, "rate": 100, "total": 100 }
                ],
                "total": 1000
            }
            If a field is not found, omit it or use null. Ensure numbers are numbers.
            For date, convert to YYYY-MM-DD format.
            Return ONLY the valid JSON block.
        `;

    const requestBody = {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: "image/jpeg",
                data: cleanBase64
              }
            }
          ]
        }
      ],
      generationConfig: {
        response_mime_type: "application/json"
      }
    };

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Gemini API Error: ${err}`);
      }

      const data = await response.json();
      const textResult = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!textResult) throw new Error("No data returned from Gemini");

      // Clean markdown code blocks if present
      const jsonStr = textResult.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(jsonStr) as ParsedBill;

    } catch (error) {
      console.error("Gemini Analysis Failed:", error);
      throw error;
    }
  },

  generateUpdateContent: async (promptText: string, apiKey: string): Promise<any> => {
    const prompt = `
            Create a business update snippet based on this topic: "${promptText}".
            Return a strict JSON object:
            {
                "title": "Short Title (Max 5 words)",
                "content": "Short description (Max 15 words)",
                "gradient": "from-cyan-500 to-blue-500", 
                "type": "UPDATE"
            }
            Gradient should be a valid Tailwind CSS class string like 'from-color-500 to-color-600'.
            Return ONLY the valid JSON block.
        `;

    const requestBody = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { response_mime_type: "application/json" }
    };

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
      if (!response.ok) {
        const errText = await response.text();
        let errorMessage = "API Error";
        try {
          const errJson = JSON.parse(errText);
          errorMessage = errJson.error?.message || errText;
        } catch (e) {
          errorMessage = errText;
        }
        throw new Error(errorMessage);
      }
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      const cleanJson = text.replace(/```json|```/g, '').trim();
      return JSON.parse(cleanJson);
    } catch (error) {
      console.error("Update Gen Failed:", error);
      throw error;
    }
  }
};