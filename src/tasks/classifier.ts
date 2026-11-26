import type { TaskIntent, TaskPlanStep } from './types';

export interface Classification {
  intent: TaskIntent;
  reason: string;
}

/** Transparent first-pass rules. This is not an AI classifier. */
export function classifyIntent(prompt: string): Classification {
  const text = prompt.trim().toLowerCase();

  if (!text) return { intent: 'unknown', reason: 'The task description is empty.' };

  if (/\b(video|clip|animation|animate|motion graphics|short film)\b/.test(text)) {
    return { intent: 'media', reason: 'The request contains video or animation terms.' };
  }
  if (/\b(image|picture|illustration|logo|poster|graphic|visual)\b/.test(text)) {
    return { intent: 'media', reason: 'The request contains image or visual-design terms.' };
  }
  if (/\b(code|coding|debug|bug|refactor|typescript|javascript|python|repository|repo|website|web app|mobile app|desktop app|implement|compile|build)\b/.test(text)) {
    return { intent: 'coding', reason: 'The request contains software-development terms.' };
  }
  if (/\b(research|investigate|compare|analyse|analyze|sources|evidence|find out|explain the latest|fact check)\b/.test(text)) {
    return { intent: 'research', reason: 'The request asks for research, comparison, or evidence.' };
  }
  if (/^(hi|hello|hey|good morning|good afternoon|good evening|thanks|thank you)[!. ]*$/.test(text)) {
    return { intent: 'chat', reason: 'The request is a conversational greeting or acknowledgement.' };
  }
  if (text.split(/\s+/).length < 2) {
    return { intent: 'unknown', reason: 'There is not enough detail to identify the task type.' };
  }
  return { intent: 'chat', reason: 'No specialist task pattern matched; treated as a general conversation.' };
}

export function createPlan(intent: TaskIntent): TaskPlanStep[] {
  const steps: Record<TaskIntent, Omit<TaskPlanStep, 'id' | 'status'>[]> = {
    chat: [
      { title: 'Check provider availability', description: 'Confirm that the selected chat provider is connected.' },
      { title: 'Send the request', description: 'Send the prompt only through the selected provider adapter.' },
      { title: 'Save the response', description: 'Store the provider response with its source attribution.' },
    ],
    coding: [
      { title: 'Check coding capability', description: 'Confirm a connected coding adapter is available.' },
      { title: 'Prepare an approved plan', description: 'Review the proposed work before any project changes.' },
      { title: 'Execute and verify', description: 'Run through an authorised adapter and report verifiable results.' },
    ],
    research: [
      { title: 'Check investigation capability', description: 'Confirm an authorised research or investigation adapter is available.' },
      { title: 'Gather evidence', description: 'Collect source-backed observations and record unknowns.' },
      { title: 'Prepare findings', description: 'Separate verified facts, inferences, and unresolved questions.' },
    ],
    media: [
      { title: 'Check media capability', description: 'Confirm the selected media provider and supported generation type.' },
      { title: 'Review generation settings', description: 'Validate the model and settings before any credit-consuming request.' },
      { title: 'Track the media job', description: 'Track completion and retain the returned asset provenance.' },
    ],
    unknown: [
      { title: 'Clarify the request', description: 'Add enough detail for AURIX to determine the task type.' },
    ],
  };

  return steps[intent].map((step, index) => ({
    ...step,
    id: `step-${index + 1}`,
    status: 'pending',
  }));
}
