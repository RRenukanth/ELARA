// LLM-generated natural-language explanations (Groq) -- presentation layer.
//
// This is a SECOND explanation on top of limeService's rule-based
// patient/doctor strings: it takes the same LIME contributing factors and
// asks an LLM (via Groq's OpenAI-compatible chat completions API) to turn
// them into fuller prose, phrased differently for each audience --
// everyday language for patients, clinical terminology for doctors.
//
// This call is always best-effort. A missing API key, a network failure,
// or a Groq outage must never block prediction creation (the rule-based
// explanation from limeService already covers that path) -- every function
// here catches its own errors and resolves to null rather than throwing.

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-oss-120b";
const REQUEST_TIMEOUT_MS = 8000;

const { FEATURE_LABELS } = require("../utils/featureContract");

/**
 * @param {{
 *   riskLevel: string,
 *   confidenceScore: number,
 *   factors: {factor: string, label: string, contribution: number}[],
 *   features: Record<string, number>,
 *   demoMode: boolean,
 * }} context
 */
function buildFactorSummary(context) {
  return context.factors
    .map((f) => {
      const label = f.label || FEATURE_LABELS[f.factor] || f.factor;
      const direction = f.contribution > 0 ? "increased" : "decreased";
      const value = context.features?.[f.factor];
      const valuePart = value !== undefined ? ` (patient value: ${value})` : "";
      return `- ${label}${valuePart}: ${direction} the predicted risk (LIME weight ${f.contribution.toFixed(3)})`;
    })
    .join("\n");
}

function buildUserPrompt(context) {
  return [
    `Predicted heart disease risk level: ${context.riskLevel}`,
    `Model confidence: ${Math.round(context.confidenceScore * 100)}%`,
    "",
    "Contributing factors from the LIME local explanation, in order of influence:",
    buildFactorSummary(context),
  ].join("\n");
}

async function callGroq(systemPrompt, userPrompt) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || DEFAULT_MODEL,
        temperature: 0.3,
        max_tokens: 400,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.warn(`groqExplanationService: Groq API returned ${response.status}`);
      return null;
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    return text || null;
  } catch (err) {
    console.warn(`groqExplanationService: request failed (${err.message})`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// Master prompt: shared medical/task framing injected into every request,
// regardless of audience. Establishes what the numbers ARE before either
// audience-specific prompt below tells the model how to phrase them.
const MASTER_PROMPT = `You are a medical explanation assistant embedded in X-REACH, a clinical decision-support tool that FORECASTS a person's risk of heart disease. The forecast comes from a trained reinforcement-learning model; the input you are given is a LOCAL LIME feature-attribution explanation of that one forecast -- i.e. which of the patient's measurements pushed this specific risk estimate up or down, and by how much.

Your job is to turn that LIME attribution into a short natural-language explanation of WHY the model forecast this risk level for this person. Stay strictly within that scope: explain the forecast and its contributing factors. Do not invent facts not present in the data given to you, do not diagnose, do not recommend treatment, and do not speculate beyond what the contributing factors show.

There are two possible audiences for this explanation, and you will always be told which one you are writing for in the instructions that follow. The two audiences must never be mixed:
- A PATIENT explanation must be written entirely in terms an ordinary patient with no medical background can understand.
- A DOCTOR explanation must be written entirely in terms a clinician would expect -- standard clinical terminology, no lay simplification.`;

const PATIENT_SYSTEM_PROMPT = `${MASTER_PROMPT}

You are writing the PATIENT-facing version of this explanation, for the patient who received this heart disease risk forecast. This text must be in patient-understandable terms:
- Plain, everyday language a non-medical adult can understand.
- No clinical jargon, medical abbreviations, or statistical terms (no "LIME", "coefficient", "weight", "model", "attribution"); if a medical term is unavoidable, explain it in the same sentence.
- 2-4 short sentences, calm and clear in tone.
- Do not add caveats about consulting a doctor -- that disclaimer is already shown separately elsewhere on the page.
- Do not repeat the raw numbers like a lab report; explain what they mean for the person instead.`;

const DOCTOR_SYSTEM_PROMPT = `${MASTER_PROMPT}

You are writing the DOCTOR-facing version of this explanation, for a physician reviewing this patient's heart disease risk forecast. This text must be in doctor-understandable terms:
- Standard clinical terminology and medical abbreviations are expected and preferred; do not simplify or explain basic medical concepts.
- Reference the specific contributing features by clinical name and the direction/magnitude of their local LIME attribution weights, where relevant to interpreting the forecast.
- 2-4 concise sentences, written as a clinical summary, not prose for a layperson.
- Do not add a patient-facing disclaimer -- this text is for clinical review, not a diagnosis statement.`;

/** @param {ReturnType<typeof buildUserPrompt> | Parameters<typeof buildUserPrompt>[0]} context */
async function generatePatientExplanation(context) {
  if (context.factors.length === 0) return null;
  return callGroq(PATIENT_SYSTEM_PROMPT, buildUserPrompt(context));
}

async function generateDoctorExplanation(context) {
  if (context.factors.length === 0) return null;
  return callGroq(DOCTOR_SYSTEM_PROMPT, buildUserPrompt(context));
}

module.exports = { generatePatientExplanation, generateDoctorExplanation };
