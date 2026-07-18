import {
  AnalyzeExpenseCommand,
  DetectDocumentTextCommand,
  TextractClient,
  type AnalyzeExpenseCommandOutput,
  type DetectDocumentTextCommandOutput,
  type ExpenseField,
} from '@aws-sdk/client-textract';
import {
  fail,
  ok,
  type Provider,
  type ProviderResult,
} from '../_registry.js';

const MAX_TEXT_CHARACTERS = 1_000_000;
const MAX_LINES = 10_000;
const MAX_EXPENSE_FIELDS = 10_000;

export interface OcrImageInput {
  imageBase64: string;
  format: 'png' | 'jpeg';
}

export interface OcrTextOutput {
  text: string;
  lines: Array<{ text: string; confidence: number | null }>;
}

interface NormalizedExpenseField {
  type: string | null;
  label: string | null;
  value: string | null;
  confidence: number | null;
}

export interface OcrExpenseOutput {
  documents: Array<{
    index: number | null;
    summaryFields: NormalizedExpenseField[];
    lineItemGroups: Array<{
      index: number | null;
      items: Array<{ fields: NormalizedExpenseField[] }>;
    }>;
  }>;
}

export interface TextractSender {
  send(command: DetectDocumentTextCommand | AnalyzeExpenseCommand, options?: {
    abortSignal?: AbortSignal;
  }): Promise<unknown>;
}

const source = {
  name: 'Amazon Textract',
  url: 'https://aws.amazon.com/textract/',
  license: 'Commercial API',
  notes: 'Gateway requires confirmation of the AWS AI-services data-use opt-out before enabling this adapter.',
};

function senderFor(region: string): TextractSender {
  const client = new TextractClient({ region });
  return {
    send: (command, options) => client.send(command as never, options),
  };
}

function unavailable<T>(region: string, optOutConfirmed: boolean): ProviderResult<T> | null {
  if (!region) return fail('provider_unavailable', 'OCR provider is not configured');
  if (!optOutConfirmed) {
    return fail('provider_unavailable', 'OCR provider requires confirmed AWS AI-services data-use opt-out');
  }
  return null;
}

function providerFailure<T>(error: unknown): ProviderResult<T> {
  const name = error instanceof Error ? error.name : '';
  if (name === 'AbortError' || name === 'TimeoutError') {
    return fail('upstream_timeout', 'Amazon Textract timed out');
  }
  if (['InvalidParameterException', 'UnsupportedDocumentException', 'DocumentTooLargeException',
    'BadDocumentException'].includes(name)) {
    return fail('bad_input', 'Amazon Textract could not process this document');
  }
  if (['ThrottlingException', 'ProvisionedThroughputExceededException'].includes(name)) {
    return fail('rate_limited', 'Amazon Textract rate limit reached');
  }
  return fail('upstream_error', 'Amazon Textract request failed');
}

function normalizedConfidence(value: number | undefined): number | null {
  return Number.isFinite(value) ? Math.round(value! * 100) / 100 : null;
}

function normalizeField(field: ExpenseField): NormalizedExpenseField {
  return {
    type: field.Type?.Text ?? null,
    label: field.LabelDetection?.Text ?? null,
    value: field.ValueDetection?.Text ?? null,
    confidence: normalizedConfidence(field.ValueDetection?.Confidence),
  };
}

export function createOcrTextProvider(
  region: string,
  optOutConfirmed: boolean,
  sender?: TextractSender,
): Provider<OcrImageInput, OcrTextOutput> {
  const client = sender ?? (region && optOutConfirmed ? senderFor(region) : null);
  return {
    id: 'ocr.aws-textract-text',
    source,
    storagePolicy: 'metadata-only',
    async execute(input, ctx) {
      const disabled = unavailable<OcrTextOutput>(region, optOutConfirmed);
      if (disabled) return disabled;
      try {
        const response = await client!.send(
          new DetectDocumentTextCommand({ Document: { Bytes: Buffer.from(input.imageBase64, 'base64') } }),
          { abortSignal: AbortSignal.timeout(ctx.timeoutMs) },
        ) as DetectDocumentTextCommandOutput;
        const lines = (response.Blocks ?? [])
          .filter((block) => block.BlockType === 'LINE' && typeof block.Text === 'string')
          .slice(0, MAX_LINES)
          .map((block) => ({ text: block.Text!, confidence: normalizedConfidence(block.Confidence) }));
        const text = lines.map((line) => line.text).join('\n');
        if (text.length > MAX_TEXT_CHARACTERS) {
          return fail('upstream_error', 'Amazon Textract response exceeded the output limit');
        }
        return ok({ text, lines });
      } catch (error) {
        return providerFailure(error);
      }
    },
  };
}

export function createOcrExpenseProvider(
  region: string,
  optOutConfirmed: boolean,
  sender?: TextractSender,
): Provider<OcrImageInput, OcrExpenseOutput> {
  const client = sender ?? (region && optOutConfirmed ? senderFor(region) : null);
  return {
    id: 'ocr.aws-textract-expense',
    source,
    storagePolicy: 'metadata-only',
    async execute(input, ctx) {
      const disabled = unavailable<OcrExpenseOutput>(region, optOutConfirmed);
      if (disabled) return disabled;
      try {
        const response = await client!.send(
          new AnalyzeExpenseCommand({ Document: { Bytes: Buffer.from(input.imageBase64, 'base64') } }),
          { abortSignal: AbortSignal.timeout(ctx.timeoutMs) },
        ) as AnalyzeExpenseCommandOutput;
        let fieldCount = 0;
        const documents = (response.ExpenseDocuments ?? []).map((document) => {
          const summaryFields = (document.SummaryFields ?? []).map(normalizeField);
          fieldCount += summaryFields.length;
          const lineItemGroups = (document.LineItemGroups ?? []).map((group) => ({
            index: group.LineItemGroupIndex ?? null,
            items: (group.LineItems ?? []).map((item) => {
              const fields = (item.LineItemExpenseFields ?? []).map(normalizeField);
              fieldCount += fields.length;
              return { fields };
            }),
          }));
          return { index: document.ExpenseIndex ?? null, summaryFields, lineItemGroups };
        });
        if (fieldCount > MAX_EXPENSE_FIELDS) {
          return fail('upstream_error', 'Amazon Textract response exceeded the output limit');
        }
        return ok({ documents });
      } catch (error) {
        return providerFailure(error);
      }
    },
  };
}
