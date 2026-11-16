import { CivicDecisionTriageSummary, SeverityType } from '../types';
import { checkPiiAndGuardrails } from './graphEngine';

export const GEMINI_DECISION_MODEL = 'gemini-decision-1' as const;
export const GEMINI_DECISIONS_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/decisions' as const;

export const MIN_CIVIC_ISSUE_PROBABILITY = 0.5;
export const MIN_PRIVACY_SAFE_PROBABILITY = 0.6;

const JPEG_DATA_URL_PREFIX = 'data:image/jpeg;base64,';

const VALID_SEVERITY_KEYS: readonly SeverityType[] = [
  'just_poop',
  'stepped_in',
  'buggy_wheels',
  'wheelchair_wheels',
];

export const HAZARD_RUBRIC_LEVELS: readonly string[] = [
  'Level 1: Minor isolated dropping off the main pedestrian walking line',
  'Level 2: Visible uncollected dog fouling on a public footpath or promenade',
  'Level 3: High-traffic pedestrian walkway hazard near a bin, school, or park gate',
  'Level 4: Direct footwear or stroller wheel contamination on a narrow footpath',
  'Level 5: Severe wheelchair or mobility ramp contamination blocking accessible passage',
];

export interface CivicReportDecisionInput {
  photoDataUrl?: string | null;
  note?: string;
  streetName?: string;
  areaName?: string;
  dBinAllM?: number;
  currentSeverity?: SeverityType;
}

export interface GeminiDecisionQuestionNoul {
  type: 'noul';
  instructions: string;
}

export interface GeminiDecisionQuestionChoice {
  type: 'choice';
  instructions: string;
  criteria: Record<SeverityType, string>;
}

export interface GeminiDecisionQuestionScore {
  type: 'score';
  instructions: string;
  criteria: readonly string[];
}

export type GeminiDecisionQuestion =
  | GeminiDecisionQuestionNoul
  | GeminiDecisionQuestionChoice
  | GeminiDecisionQuestionScore;

export type GeminiDecisionInputPart =
  | { type: 'text'; text: string }
  | { inline_data: { mime_type: 'image/jpeg'; data: string } };

export interface GeminiDecisionsApiRequest {
  model: typeof GEMINI_DECISION_MODEL;
  input: string | GeminiDecisionInputPart[];
  questions: {
    is_civic_issue: GeminiDecisionQuestionNoul;
    privacy_safe: GeminiDecisionQuestionNoul;
    recommended_severity: GeminiDecisionQuestionChoice;
    hazard_rubric: GeminiDecisionQuestionScore;
  };
}

function getConfiguredGeminiApiKey(overrideKey?: string): string {
  if (overrideKey !== undefined) {
    return overrideKey.trim();
  }
  const metaEnv =
    typeof import.meta !== 'undefined'
      ? (import.meta as unknown as { env?: Record<string, string | undefined> }).env
      : undefined;
  const procEnv =
    typeof process !== 'undefined'
      ? (process.env as Record<string, string | undefined>)
      : undefined;

  return (metaEnv?.VITE_GEMINI_API_KEY || procEnv?.VITE_GEMINI_API_KEY || '').trim();
}

export function isGeminiDecisionConfigured(overrideKey?: string): boolean {
  return getConfiguredGeminiApiKey(overrideKey).length > 0;
}

/**
 * Builds the structured request payload for the Gemini Decisions API (`gemini-decision-1`).
 * Combines the EXIF-stripped JPEG image and report context to evaluate 4 independent questions
 * in a single forward pass with zero output tokens.
 */
export function buildCivicReportDecisionRequest(
  input: CivicReportDecisionInput
): GeminiDecisionsApiRequest {
  const contextLines: string[] = [
    'Evaluate this citizen report submission for Clean Greystones (Greystones, Co. Wicklow civic dog fouling and footpath cleanliness tracker).',
  ];

  if (input.streetName) {
    contextLines.push(
      `Location: ${input.streetName}${input.areaName ? ` (${input.areaName})` : ''}.`
    );
  }
  if (typeof input.dBinAllM === 'number' && Number.isFinite(input.dBinAllM)) {
    contextLines.push(`Distance to nearest public litter bin: ${input.dBinAllM}m.`);
  }
  if (input.currentSeverity) {
    contextLines.push(`User-selected impact category: ${input.currentSeverity}.`);
  }
  if (input.note && input.note.trim()) {
    contextLines.push(`Resident note: "${input.note.trim().slice(0, 140)}"`);
  }

  const parts: GeminiDecisionInputPart[] = [
    {
      type: 'text',
      text: contextLines.join('\n'),
    },
  ];

  if (input.photoDataUrl) {
    const trimmed = input.photoDataUrl.trim();
    if (!trimmed.startsWith(JPEG_DATA_URL_PREFIX)) {
      throw new Error('Photo input for Gemini Decision 1 must be a stripped JPEG data URL.');
    }
    const base64Data = trimmed.slice(JPEG_DATA_URL_PREFIX.length);
    if (!base64Data) {
      throw new Error('Photo JPEG data URL contains no image payload.');
    }
    parts.push({
      inline_data: {
        mime_type: 'image/jpeg',
        data: base64Data,
      },
    });
  }

  return {
    model: GEMINI_DECISION_MODEL,
    input: parts,
    questions: {
      is_civic_issue: {
        type: 'noul',
        instructions:
          'Does this submission depict or describe genuine public dog fouling, street waste, or footpath contamination on a walkway?',
      },
      privacy_safe: {
        type: 'noul',
        instructions:
          'Is this submission completely free of identifiable human faces, children, readable vehicle registration plates, and private house numbers?',
      },
      recommended_severity: {
        type: 'choice',
        instructions:
          'Which Clean Greystones impact category best matches the evidence shown or described?',
        criteria: {
          just_poop: 'Uncollected dog fouling left on a footpath, promenade, or park walkway.',
          stepped_in: 'Dog fouling that has been stepped in by a pedestrian or runner.',
          buggy_wheels: 'Dog fouling rolled through by baby buggy or stroller wheels.',
          wheelchair_wheels:
            'Dog fouling rolled through by wheelchair wheels or blocking an accessible ramp.',
        },
      },
      hazard_rubric: {
        type: 'score',
        instructions:
          'Rate the civic footpath hazard severity across the 5 ordered rubric levels.',
        criteria: HAZARD_RUBRIC_LEVELS,
      },
    },
  };
}

function clampProbability(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function parseNoulAnswer(rawAnswer: unknown, fieldLabel: string): { prob: number; confidence: number } {
  if (!isRecord(rawAnswer)) {
    throw new Error(`Invalid Gemini Decision 1 response: missing "${fieldLabel}" answer object.`);
  }
  const rawProb =
    typeof rawAnswer.noul === 'number'
      ? rawAnswer.noul
      : typeof rawAnswer.bool === 'number'
        ? rawAnswer.bool
        : typeof rawAnswer.probability === 'number'
          ? rawAnswer.probability
          : undefined;

  if (typeof rawProb !== 'number' || !Number.isFinite(rawProb)) {
    throw new Error(
      `Invalid Gemini Decision 1 response: "${fieldLabel}" is missing a numeric probability.`
    );
  }

  return {
    prob: clampProbability(rawProb, 0),
    confidence: clampProbability(rawAnswer.confidence, 0.5),
  };
}

function isSeverityType(val: unknown): val is SeverityType {
  return typeof val === 'string' && (VALID_SEVERITY_KEYS as readonly string[]).includes(val);
}

/**
 * Validates and normalizes the raw JSON response from `/v1beta/decisions`,
 * combining model probabilities with deterministic Node N13 text guardrails.
 */
export function parseCivicReportDecisionResponse(
  raw: unknown,
  noteText?: string
): CivicDecisionTriageSummary {
  if (!isRecord(raw) || !isRecord(raw.answers)) {
    throw new Error('Invalid Gemini Decision 1 response: top-level "answers" object is missing.');
  }

  const answers = raw.answers;
  const civicAns = parseNoulAnswer(answers.is_civic_issue, 'is_civic_issue');
  const privacyAns = parseNoulAnswer(answers.privacy_safe, 'privacy_safe');

  const choiceAns = answers.recommended_severity;
  if (!isRecord(choiceAns)) {
    throw new Error(
      'Invalid Gemini Decision 1 response: missing "recommended_severity" answer object.'
    );
  }

  const rawProbs = isRecord(choiceAns.probabilities) ? choiceAns.probabilities : {};
  const severityProbabilities: Record<SeverityType, number> = {
    just_poop: clampProbability(rawProbs.just_poop, 0.25),
    stepped_in: clampProbability(rawProbs.stepped_in, 0.25),
    buggy_wheels: clampProbability(rawProbs.buggy_wheels, 0.25),
    wheelchair_wheels: clampProbability(rawProbs.wheelchair_wheels, 0.25),
  };

  let recommendedSeverity: SeverityType = 'just_poop';
  if (isSeverityType(choiceAns.choice)) {
    recommendedSeverity = choiceAns.choice;
  } else {
    let bestProb = -1;
    for (const key of VALID_SEVERITY_KEYS) {
      if (severityProbabilities[key] > bestProb) {
        bestProb = severityProbabilities[key];
        recommendedSeverity = key;
      }
    }
  }
  const choiceConfidence = clampProbability(choiceAns.confidence, 0.5);

  const scoreAns = answers.hazard_rubric;
  if (!isRecord(scoreAns) || typeof scoreAns.score !== 'number' || !Number.isFinite(scoreAns.score)) {
    throw new Error(
      'Invalid Gemini Decision 1 response: "hazard_rubric" is missing a numeric score.'
    );
  }
  // Normalize 0-indexed (0..4) or 1-indexed (1..5) rubric score into 1.0..5.0 range
  const rawScore = scoreAns.score;
  const normalizedHazardScore = Math.max(1, Math.min(5, Number(rawScore.toFixed(2))));
  const scoreConfidence = clampProbability(scoreAns.confidence, 0.5);

  // Enforce deterministic Node N13 regex guardrails on any note text alongside visual checks
  const textGuardrail = noteText ? checkPiiAndGuardrails(noteText) : { ok: true, warnings: [] };

  const isCivicIssue = civicAns.prob >= MIN_CIVIC_ISSUE_PROBABILITY;
  const isPrivacySafe = privacyAns.prob >= MIN_PRIVACY_SAFE_PROBABILITY && textGuardrail.ok;

  const blockingReasons: string[] = [];
  if (!isCivicIssue) {
    blockingReasons.push(
      `Submission does not appear to show public dog fouling or footpath litter (${Math.round(civicAns.prob * 100)}% civic match). Please upload a clear ground-level photo of the footpath.`
    );
  }
  if (privacyAns.prob < MIN_PRIVACY_SAFE_PROBABILITY) {
    blockingReasons.push(
      `Privacy & GDPR guardrail triggered (${Math.round((1 - privacyAns.prob) * 100)}% PII risk): faces, children, vehicle registration plates, or house numbers detected in photo.`
    );
  }
  for (const warning of textGuardrail.warnings) {
    if (!blockingReasons.includes(warning)) {
      blockingReasons.push(warning);
    }
  }

  const overallConfidence = Number(
    ((civicAns.confidence + privacyAns.confidence + choiceConfidence + scoreConfidence) / 4).toFixed(
      2
    )
  );

  const usage = isRecord(raw.usage) ? raw.usage : {};
  const totalInputTokens =
    typeof usage.total_input_tokens === 'number' && Number.isFinite(usage.total_input_tokens)
      ? usage.total_input_tokens
      : 0;

  return {
    model: GEMINI_DECISION_MODEL,
    allowedToPublish: isCivicIssue && isPrivacySafe,
    isCivicIssue,
    civicIssueProb: Number(civicAns.prob.toFixed(2)),
    isPrivacySafe,
    privacySafeProb: Number(privacyAns.prob.toFixed(2)),
    recommendedSeverity,
    severityProbabilities,
    hazardScore: normalizedHazardScore,
    confidence: overallConfidence,
    blockingReasons,
    totalInputTokens,
  };
}

export interface EvaluateDecisionOptions {
  apiKey?: string;
  fetchFn?: typeof fetch;
  signal?: AbortSignal;
}

/**
 * Executes a single-pass multimodal evaluation against `gemini-decision-1` via the Decisions API.
 */
export async function evaluateCivicReportDecision(
  input: CivicReportDecisionInput,
  options?: EvaluateDecisionOptions
): Promise<CivicDecisionTriageSummary> {
  const apiKey = getConfiguredGeminiApiKey(options?.apiKey);
  if (!apiKey) {
    throw new Error(
      'VITE_GEMINI_API_KEY is not configured. Set VITE_GEMINI_API_KEY to enable live Gemini Decision 1 photo triage.'
    );
  }

  const fetchImpl = options?.fetchFn ?? (typeof fetch !== 'undefined' ? fetch : undefined);
  if (!fetchImpl) {
    throw new Error('Global fetch is unavailable in this runtime.');
  }

  const requestBody = buildCivicReportDecisionRequest(input);

  const response = await fetchImpl(GEMINI_DECISIONS_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(requestBody),
    signal: options?.signal,
  });

  if (!response.ok) {
    let errorDetail = `HTTP ${response.status}`;
    try {
      const errJson = await response.json();
      if (isRecord(errJson) && isRecord(errJson.error) && typeof errJson.error.message === 'string') {
        errorDetail = errJson.error.message;
      }
    } catch {
      // Ignore JSON parse failure on error body
    }
    throw new Error(`Gemini Decisions API request failed (${errorDetail}).`);
  }

  const rawJson: unknown = await response.json();
  return parseCivicReportDecisionResponse(rawJson, input.note);
}
