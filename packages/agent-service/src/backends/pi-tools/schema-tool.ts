import { Type, type Static } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { AgentConfig } from '../../core/types';
import { logger } from '../../utils/logger';
import { validateConfigSchemaContract } from './schema-contract-validation';

const SchemaValidateParams = Type.Object({
  schema: Type.String({ description: 'JSON schema string to validate' }),
});
type SchemaValidateParams = Static<typeof SchemaValidateParams>;

const SCHEMA_VALIDATION_DETAILS = {
  validationScope: 'schema_contract',
  uiBehaviorVerified: false,
} as const;

const UI_BEHAVIOR_UNVERIFIED_NOTE =
  'Validation scope: schema contract only. The currently running configuration-panel UI was not verified.';

export function createSchemaValidateTool(_config: AgentConfig): AgentTool<typeof SchemaValidateParams> {
  return {
    name: 'schemaValidate',
    label: 'Schema Validate',
    description: 'Validate JSON schema syntax and Workbench config contracts, including nested visibleWhen references. This does not verify live UI behavior.',
    parameters: SchemaValidateParams,
    execute: async (toolCallId: string, args: SchemaValidateParams) => {
      try {
        const schema = JSON.parse(args.schema);
        
        if (typeof schema !== 'object' || schema === null) {
          return {
            content: [{ type: 'text', text: 'Error: Schema must be a valid JSON object' }],
            details: { valid: false, error: 'Not a valid JSON object', ...SCHEMA_VALIDATION_DETAILS },
            isError: true,
          };
        }

        const contractIssues = validateConfigSchemaContract(schema);
        if (contractIssues.length > 0) {
          const summary = contractIssues.map((issue) => `${issue.code}: ${issue.message}`).join('\n');
          return {
            content: [{ type: 'text', text: `Error: Config schema contract validation failed.\n${summary}` }],
            details: {
              valid: false,
              error: 'Config schema contract violation',
              issues: contractIssues,
              ...SCHEMA_VALIDATION_DETAILS,
            },
            isError: true,
          };
        }
        
        if (!schema.type && !schema.$schema && !schema.properties) {
          return {
            content: [{
              type: 'text',
              text: `Warning: Schema appears to be missing common JSON Schema fields (type, $schema, properties)\n${UI_BEHAVIOR_UNVERIFIED_NOTE}`,
            }],
            details: { valid: true, warning: 'Missing common fields', ...SCHEMA_VALIDATION_DETAILS },
          };
        }
        
        if (schema.type === 'object' && schema.properties) {
          const required = schema.required || [];
          const properties = Object.keys(schema.properties);
          
          logger.debug({ 
            type: schema.type, 
            propertyCount: properties.length,
            requiredCount: required.length 
          }, 'Schema validated successfully');
          
          return {
            content: [{ 
              type: 'text', 
              text: `Schema is valid JSON Schema.\nType: object\nProperties: ${properties.length}\nRequired: ${required.length}\nProperties: ${properties.join(', ')}\n${UI_BEHAVIOR_UNVERIFIED_NOTE}`
            }],
            details: { valid: true, type: 'object', properties, required, ...SCHEMA_VALIDATION_DETAILS },
          };
        }
        
        logger.debug({ type: schema.type }, 'Schema validated successfully');
        return {
          content: [{
            type: 'text',
            text: `Schema is valid JSON Schema.\nType: ${schema.type || 'not specified'}\n${UI_BEHAVIOR_UNVERIFIED_NOTE}`,
          }],
          details: { valid: true, type: schema.type, ...SCHEMA_VALIDATION_DETAILS },
        };
      } catch (error) {
        if (error instanceof SyntaxError) {
          return {
            content: [{ type: 'text', text: `Error: Invalid JSON - ${error.message}` }],
            details: { valid: false, error: error.message, ...SCHEMA_VALIDATION_DETAILS },
            isError: true,
          };
        }
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ error: message }, 'Failed to validate schema');
        return {
          content: [{ type: 'text', text: `Error validating schema: ${message}` }],
          details: { valid: false, error: message, ...SCHEMA_VALIDATION_DETAILS },
          isError: true,
        };
      }
    },
  };
}
