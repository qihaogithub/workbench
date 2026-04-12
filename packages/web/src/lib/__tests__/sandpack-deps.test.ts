import { extractDependenciesFromComments } from '../sandpack-deps';

describe('Sandpack 依赖解析', () => {
  describe('extractDependenciesFromComments', () => {
    it('应解析简单的依赖声明', () => {
      const code = `
        // @dependency lodash
        // @dependency date-fns

        import React from 'react';
      `;
      const deps = extractDependenciesFromComments(code);
      expect(deps).toEqual({
        'lodash': 'latest',
        'date-fns': 'latest',
      });
    });

    it('应解析带版本的依赖声明', () => {
      const code = `
        // @dependency lodash@^4.0.0
        // @dependency date-fns@^3.0.0

        import React from 'react';
      `;
      const deps = extractDependenciesFromComments(code);
      expect(deps).toEqual({
        'lodash': '^4.0.0',
        'date-fns': '^3.0.0',
      });
    });

    it('应解析 scoped packages', () => {
      const code = `
        // @dependency @react-spring/web
        // @dependency @heroicons/react@^2.0.0

        import React from 'react';
      `;
      const deps = extractDependenciesFromComments(code);
      expect(deps).toEqual({
        '@react-spring/web': 'latest',
        '@heroicons/react': '^2.0.0',
      });
    });

    it('应忽略非依赖注释', () => {
      const code = `
        // 这是一个注释
        import React from 'react';
        // @dependency lodash
      `;
      const deps = extractDependenciesFromComments(code);
      expect(deps).toEqual({
        'lodash': 'latest',
      });
    });

    it('应处理空代码', () => {
      const deps = extractDependenciesFromComments('');
      expect(deps).toEqual({});
    });
  });
});
