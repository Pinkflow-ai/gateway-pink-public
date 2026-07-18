import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { loadPricingManifest } from '../billing/manifest.js';
import { generateOpenApi } from './generate.js';
import { generatePythonSdk, generateTypeScriptSdk } from './sdkGenerate.js';

const target = resolve('openapi/gateway.openapi.json');
const document = generateOpenApi(loadPricingManifest('./config/pricing.manifest.json'));
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`);

const typescriptTarget = resolve('sdks/typescript/src/index.ts');
mkdirSync(dirname(typescriptTarget), { recursive: true });
writeFileSync(typescriptTarget, generateTypeScriptSdk(loadPricingManifest('./config/pricing.manifest.json')));

const pythonTarget = resolve('sdks/python/gateway_pink/client.py');
mkdirSync(dirname(pythonTarget), { recursive: true });
writeFileSync(pythonTarget, generatePythonSdk(loadPricingManifest('./config/pricing.manifest.json')));
