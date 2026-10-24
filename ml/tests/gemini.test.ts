import { describe, expect, it } from 'vitest';
import { geminiSemanticCheck, type GeminiVerdict } from '../src/gemini.js';

const INPUT = {
  imageBase64: 'aGVsbG8td29ybGQ=', // "hello-world"
  mimeType: 'image/jpeg',
  claimedItem: 'Running shoes (size 10)',
  claimedDamage: 'Torn sole stitching',
};

function fakeFetchReturning(text: string, ok = true, status = 200) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetchImpl = (async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return {
      ok,
      status,
      json: async () => ({
        candidates: [{ content: { parts: [{ text }] } }],
      }),
    } as Response;
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe('geminiSemanticCheck — live mode (mocked fetch)', () => {
  it('sends the right request shape and maps a verdict with inconsistencies', async () => {
    const verdict: GeminiVerdict = {
      itemMatch: false,
      damageMatch: true,
      inconsistencies: ['Photo shows sandals, not running shoes'],
      aiLikelihoodNote: 'Edges look synthetic',
      confidence: 0.8,
    };
    // Model wraps JSON in code fences — parser must strip them.
    const { fetchImpl, calls } = fakeFetchReturning(
      '```json\n' + JSON.stringify(verdict) + '\n```',
    );

    const result = await geminiSemanticCheck(INPUT, {
      apiKey: 'test-key-123',
      fetchImpl,
    });

    expect(result.mode).toBe('live');
    expect(result.verdict?.itemMatch).toBe(false);
    expect(result.verdict?.inconsistencies).toHaveLength(1);

    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call?.url).toContain(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=',
    );
    expect(call?.init?.method).toBe('POST');
    const body = JSON.parse(String(call?.init?.body)) as {
      contents: Array<{
        parts: Array<{
          text?: string;
          inline_data?: { mime_type: string; data: string };
        }>;
      }>;
    };
    const parts = body.contents[0]?.parts ?? [];
    expect(parts[0]?.text).toContain('Running shoes (size 10)');
    expect(parts[0]?.text).toContain('Torn sole stitching');
    expect(parts[1]?.inline_data?.mime_type).toBe('image/jpeg');
    expect(parts[1]?.inline_data?.data).toBe(INPUT.imageBase64);

    // Signal reflects the inconsistency: item mismatch (0.5) + 1 inconsistency
    // (0.1), weighted by confidence 0.8 -> 0.48, medium band.
    expect(result.signal.signal).toBe('gemini_semantic');
    expect(result.signal.source).toBe(
      'gemini-semantic (LIVE, uncalibrated second opinion)',
    );
    expect(result.signal.score).toBeCloseTo(0.48, 5);
    expect(result.signal.band).toBe('medium');
    expect(result.signal.explanation).toContain('sandals');
    expect(result.signal.action).toBe('review_priority_only');
  });

  it('honours a model override in the request URL', async () => {
    const { fetchImpl, calls } = fakeFetchReturning(
      JSON.stringify({
        itemMatch: true,
        damageMatch: true,
        inconsistencies: [],
        aiLikelihoodNote: 'nothing obvious',
        confidence: 0.9,
      }),
    );
    const result = await geminiSemanticCheck(INPUT, {
      apiKey: 'test-key-123',
      model: 'gemini-2.0-flash',
      fetchImpl,
    });
    expect(calls[0]?.url).toContain('/models/gemini-2.0-flash:generateContent');
    expect(result.signal.score).toBe(0);
  });
});

describe('geminiSemanticCheck — mock mode', () => {
  it('labels itself MOCK and carries no score when no key is configured', async () => {
    const result = await geminiSemanticCheck(INPUT, { apiKey: '' });
    expect(result.mode).toBe('mock');
    expect(result.signal.source).toContain('MOCK');
    expect(result.signal.source).toBe(
      'gemini-semantic (MOCK — no API key configured)',
    );
    expect(result.signal.score).toBeNull();
    expect(result.signal.explanation.toLowerCase()).toContain('mock mode');
    expect(result.verdict?.itemMatch).toBe(true);
    expect(result.verdict?.aiLikelihoodNote).toContain('not a real model call');
  });
});

describe('geminiSemanticCheck — failure paths never throw, never fake a verdict', () => {
  it('fetch throws -> null-score signal, no exception', async () => {
    const throwingFetch = (async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    const result = await geminiSemanticCheck(INPUT, {
      apiKey: 'test-key-123',
      fetchImpl: throwingFetch,
    });
    expect(result.mode).toBe('live');
    expect(result.signal.score).toBeNull();
    expect(result.verdict).toBeUndefined();
    expect(result.signal.explanation).toContain('failed');
  });

  it('HTTP error -> null-score signal', async () => {
    const { fetchImpl } = fakeFetchReturning('', false, 500);
    const result = await geminiSemanticCheck(INPUT, {
      apiKey: 'test-key-123',
      fetchImpl,
    });
    expect(result.signal.score).toBeNull();
    expect(result.signal.explanation).toContain('HTTP 500');
  });

  it('unparseable model text -> null-score signal', async () => {
    const { fetchImpl } = fakeFetchReturning('I cannot answer that.');
    const result = await geminiSemanticCheck(INPUT, {
      apiKey: 'test-key-123',
      fetchImpl,
    });
    expect(result.signal.score).toBeNull();
    expect(result.verdict).toBeUndefined();
  });
});
