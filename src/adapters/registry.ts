import { ClaudeAdapter } from './claude';
import { GrokAdapter } from './grok';
import { HiggsfieldAdapter } from './higgsfield';
import { OpenAiAdapter } from './openai';
import { ReaAdapter } from './rea';
import { TwentyFirstAdapter } from './twentyfirst';
import type { ProviderAdapter } from './types';

export function createDefaultAdapters(): ProviderAdapter[] {
  return [
    new ClaudeAdapter(),
    new GrokAdapter(),
    new OpenAiAdapter(),
    new HiggsfieldAdapter(),
    new TwentyFirstAdapter(),
    new ReaAdapter(),
  ];
}
