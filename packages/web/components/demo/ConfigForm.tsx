'use client';

import { useMemo } from 'react';
import Form from '@rjsf/core';
import validator from '@rjsf/validator-ajv8';
import type { ConfigFormProps } from './types';
import { customWidgets } from './widgets';

export function ConfigForm({
  schema,
  onChange,
  initialData,
  readonly,
  className,
}: ConfigFormProps) {
  const parsedSchema = useMemo(() => {
    try {
      return JSON.parse(schema);
    } catch {
      return { type: 'object', properties: {} };
    }
  }, [schema]);

  return (
    <div className={className || ''}>
      <Form
        schema={parsedSchema}
        validator={validator}
        widgets={customWidgets}
        formData={initialData}
        onChange={(e) => onChange(e.formData || {})}
        readonly={readonly}
        liveValidate
        showErrorList="bottom"
      >
        <div />
      </Form>
    </div>
  );
}
