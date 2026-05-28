import { Type, type Static } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { AgentConfig } from '../../core/types';
import { logger } from '../../utils/logger';

const SchemaValidateParams = Type.Object({
  schema: Type.String({ description: 'JSON schema string to validate' }),
});
type SchemaValidateParams = Static<typeof SchemaValidateParams>;

export function createSchemaValidateTool(config: AgentConfig): AgentTool<typeof SchemaValidateParams> {
  return {
    name: 'schemaValidate',
    label: 'Schema Validate',
    description: 'Validate a JSON schema format',
    parameters: SchemaValidateParams,
    execute: async (toolCallId: string, args: SchemaValidateParams) => {
      try {
        const schema = JSON.parse(args.schema);
        
        if (typeof schema !== 'object' || schema === null) {
          return {
            content: [{ type: 'text', text: 'Error: Schema must be a valid JSON object' }],
            details: { valid: false, error: 'Not a valid JSON object' },
            isError: true,
          };
        }
        
        if (!schema.type && !schema.$schema && !schema.properties) {
          return {
            content: [{ type: 'text', text: 'Warning: Schema appears to be missing common JSON Schema fields (type, $schema, properties)' }],
            details: { valid: true, warning: 'Missing common fields' },
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
              text: `Schema is valid JSON Schema.\nType: object\nProperties: ${properties.length}\nRequired: ${required.length}\nProperties: ${properties.join(', ')}` 
            }],
            details: { valid: true, type: 'object', properties, required },
          };
        }
        
        logger.debug({ type: schema.type }, 'Schema validated successfully');
        return {
          content: [{ type: 'text', text: `Schema is valid JSON Schema.\nType: ${schema.type || 'not specified'}` }],
          details: { valid: true, type: schema.type },
        };
      } catch (error) {
        if (error instanceof SyntaxError) {
          return {
            content: [{ type: 'text', text: `Error: Invalid JSON - ${error.message}` }],
            details: { valid: false, error: error.message },
            isError: true,
          };
        }
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ error: message }, 'Failed to validate schema');
        return {
          content: [{ type: 'text', text: `Error validating schema: ${message}` }],
          details: { valid: false, error: message },
          isError: true,
        };
      }
    },
  };
}
