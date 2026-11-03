// LLM-generated natural-language explanations (Groq) -- presentation layer.
//
// This is a SECOND explanation on top of limeService's rule-based
// patient/doctor strings: it takes the same LIME contributing factors and
// asks an LLM (via Groq's OpenAI-compatible chat completions API) to turn
// them into fuller prose, phrased differently for each audience --
// everyday language for patients, clinical terminology for doctors.
//
// If Groq is unconfigured or temporarily unavailable, a deterministic
// clinical rule-based prose generator produces the exact natural-language
// sentences so patients and doctors always receive an intuitive explanation.

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "llama-3.3-70b-versatile";
const FALLBACK_MODELS = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"];
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
  return (context.factors || [])
    .map((f) => {
      const label = f.label || FEATURE_LABELS[f.factor] || f.factor;
      const direction = f.contribution > 0 ? "increased" : "decreased";
      const value = context.features?.[f.factor];
      const valuePart = value !== undefined ? ` (patient value: ${value})` : "";
      return `- ${label}${valuePart}: ${direction} the predicted risk (LIME weight ${f.contribution > 0 ? "+" : ""}${f.contribution.toFixed(3)})`;
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
  const apiKey = (process.env.GROQ_API_KEY || "").trim();
  if (!apiKey) {
    return null;
  }

  const primaryModel = (process.env.GROQ_MODEL || DEFAULT_MODEL).trim();
  const modelsToTry = [primaryModel, ...FALLBACK_MODELS.filter((m) => m !== primaryModel)];

  for (const model of modelsToTry) {
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
          model,
          temperature: 0.3,
          max_tokens: 350,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
        signal: controller.signal,
      });

      if (response.ok) {
        const data = await response.json();
        const text = data?.choices?.[0]?.message?.content?.trim();
        if (text) return text;
      } else {
        console.warn(`groqExplanationService: Groq API with model ${model} returned ${response.status}`);
      }
    } catch (err) {
      console.warn(`groqExplanationService: request for model ${model} failed (${err.message})`);
    } finally {
      clearTimeout(timeout);
    }
  }

  return null;
}

// Master prompt: shared medical/task framing injected into every request
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

/** Fallback natural-language patient explanation generator */
function generateFallbackPatientExplanation(context) {
  const increasing = (context.factors || []).filter((f) => f.contribution > 0);
  const decreasing = (context.factors || []).filter((f) => f.contribution < 0);

  const riskTerm = (context.riskLevel || "").toLowerCase().includes("high")
    ? "high"
    : (context.riskLevel || "").toLowerCase().includes("medium")
    ? "moderate"
    : "low";

  const incLabels = increasing.map((f) => f.label.toLowerCase());
  const decLabels = decreasing.map((f) => f.label.toLowerCase());

  const sentences = [];
  if (increasing.length > 0) {
    sentences.push(
      `Your ${incLabels[0]} is a major factor contributing to your ${riskTerm} heart disease risk estimate.`
    );
    if (incLabels.length > 1) {
      sentences.push(
        `Having ${incLabels.slice(1).join(" and ")} also push the risk upward.`
      );
    }
  }

  if (decreasing.length > 0) {
    const decList = decLabels.join(" and ");
    if (increasing.length > 0) {
      sentences.push(
        `Being favorable in ${decList} slightly lowers the risk, but overall the other factors keep the estimate in the ${riskTerm} range.`
      );
    } else {
      sentences.push(
        `Healthy indicators in ${decList} are positive signs that help keep your overall risk low.`
      );
    }
  }

  return sentences.join(" ");
}

/** Fallback natural-language doctor explanation generator */
function generateFallbackDoctorExplanation(context) {
  const increasing = (context.factors || []).filter((f) => f.contribution > 0);
  const decreasing = (context.factors || []).filter((f) => f.contribution < 0);
  const conf = Math.round((context.confidenceScore || 0) * 100);

  const incParts = increasing.map(
    (f) => `${f.factor} (value: ${context.features?.[f.factor] ?? "N/A"}; LIME weight +${f.contribution.toFixed(3)})`
  );
  const decParts = decreasing.map(
    (f) => `${f.factor} (value: ${context.features?.[f.factor] ?? "N/A"}; LIME weight ${f.contribution.toFixed(3)})`
  );

  let text = `The model predicts a ${context.riskLevel} heart disease estimate (${conf}% confidence).`;
  if (incParts.length > 0) {
    text += ` Primary adverse contributors are ${incParts.slice(0, 2).join(" and ")}.`;
    if (incParts.length > 2) {
      text += ` Additional risk is contributed by ${incParts.slice(2).join(", ")}.`;
    }
  }
  if (decParts.length > 0) {
    text += ` Counterbalancing influences are ${decParts.join(", ")}, which together are evaluated against the adverse factors.`;
  }
  return text;
}

/** @param {ReturnType<typeof buildUserPrompt> | Parameters<typeof buildUserPrompt>[0]} context */
async function generatePatientExplanation(context) {
  if (!context || !context.factors || context.factors.length === 0) return null;
  const llmResult = await callGroq(PATIENT_SYSTEM_PROMPT, buildUserPrompt(context));
  return llmResult || generateFallbackPatientExplanation(context);
}

async function generateDoctorExplanation(context) {
  if (!context || !context.factors || context.factors.length === 0) return null;
  const llmResult = await callGroq(DOCTOR_SYSTEM_PROMPT, buildUserPrompt(context));
  return llmResult || generateFallbackDoctorExplanation(context);
}

module.exports = { generatePatientExplanation, generateDoctorExplanation };
