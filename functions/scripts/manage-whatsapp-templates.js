#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  buildUncedoTemplateCatalogue,
  createMetaTemplateManager,
  generateFirebaseConfiguration,
  getRequiredEnvironment,
  toPreviewJSON,
} = require('../whatsapp/templateManagement');

function parseArguments(argv) {
  const result = { mode: 'preview', approvedNames: [], confirmWaba: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (['--preview', '--list', '--check', '--submit'].includes(argument)) {
      result.mode = argument.slice(2);
    } else if (argument === '--approve-template') {
      const name = String(argv[index + 1] || '').trim();
      if (!name) throw new Error('--approve-template requires an exact template name.');
      result.approvedNames.push(name);
      index += 1;
    } else if (argument === '--confirm-waba') {
      result.confirmWaba = String(argv[index + 1] || '').trim();
      if (!result.confirmWaba) throw new Error('--confirm-waba requires the WABA ID from functions/.env.');
      index += 1;
    } else if (argument === '--help' || argument === '-h') {
      result.mode = 'help';
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }
  return result;
}

function loadFunctionsEnv() {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return false;
  if (typeof process.loadEnvFile !== 'function') {
    throw new Error('This utility requires Node.js with process.loadEnvFile support (Node.js 22 is configured for Functions).');
  }
  process.loadEnvFile(envPath);
  return true;
}

function printHelp() {
  return [
    'Uncedo WhatsApp template utility (preview is the safe default)',
    '',
    '  node scripts/manage-whatsapp-templates.js --preview',
    '  node scripts/manage-whatsapp-templates.js --list',
    '  node scripts/manage-whatsapp-templates.js --check',
    '  node scripts/manage-whatsapp-templates.js --submit --approve-template <exact_name> --confirm-waba <exact_waba_id>',
    '',
    '--preview makes no network request. --submit requires explicit per-template approval and WABA confirmation.',
    'The utility reads functions/.env locally and never prints credential values.',
  ].join('\n');
}

async function main(argv = process.argv.slice(2), env = process.env, output = process.stdout) {
  const args = parseArguments(argv);
  if (args.mode === 'help') {
    output.write(`${printHelp()}\n`);
    return;
  }

  const languageCode = String(env.WHATSAPP_TEMPLATE_LANGUAGE || 'en_US').trim();
  const catalogue = buildUncedoTemplateCatalogue({ languageCode });
  if (args.mode === 'preview') {
    output.write(`${toPreviewJSON(catalogue)}\n`);
    return;
  }

  const credentials = getRequiredEnvironment(env);
  if (args.mode === 'submit') {
    if (args.confirmWaba !== credentials.wabaId) {
      throw new Error('--confirm-waba must exactly match META_WABA_ID before any template submission.');
    }
    if (!args.approvedNames.length) {
      throw new Error('No submission performed: add --approve-template with each exact template name you approve.');
    }
    const allowedNames = new Set(catalogue.map((template) => template.name));
    const invalidName = args.approvedNames.find((name) => !allowedNames.has(name));
    if (invalidName) throw new Error(`The approved name is not in the generated catalogue: ${invalidName}`);
  }

  const manager = createMetaTemplateManager(credentials);
  const templates = await manager.listTemplates();
  if (args.mode === 'list') {
    output.write(`${JSON.stringify(templates.map(({ id, name, status, category, language }) => ({ id, name, status, category, language })), null, 2)}\n`);
    return;
  }
  if (args.mode === 'check') {
    const generated = generateFirebaseConfiguration(catalogue, templates);
    output.write(`${JSON.stringify({
      templates: templates.map(({ id, name, status, category, language }) => ({ id, name, status, category, language })),
      firebaseConfiguration: generated.text,
    }, null, 2)}\n`);
    return;
  }
  if (args.mode === 'submit') {
    const results = await manager.submitMissingTemplates({
      catalogue,
      approvedTemplateNames: args.approvedNames,
      existingTemplates: templates,
    });
    output.write(`${JSON.stringify(results, null, 2)}\n`);
    return;
  }
  throw new Error('Unsupported utility mode.');
}

if (require.main === module) {
  try {
    const parsed = parseArguments(process.argv.slice(2));
    if (!['preview', 'help'].includes(parsed.mode)) loadFunctionsEnv();
    main().catch((error) => {
      const safeError = error?.toSafeJSON ? error.toSafeJSON() : { message: String(error?.message || 'Template utility failed.') };
      process.stderr.write(`${JSON.stringify(safeError)}\n`);
      process.exitCode = 1;
    });
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ message: String(error?.message || 'Template utility failed.') })}\n`);
    process.exitCode = 1;
  }
}

module.exports = { loadFunctionsEnv, main, parseArguments, printHelp };
