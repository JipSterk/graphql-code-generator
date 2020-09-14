import { Types } from '@graphql-codegen/plugin-helpers';
import { concatAST, parse } from 'graphql';
import { resolve, relative, join } from 'path';
import { groupSourcesByModule, stripFilename, normalize } from './utils';
import { buildModule } from './builder';
import { ModulesConfig } from './config';

export const preset: Types.OutputPreset<ModulesConfig> = {
  buildGeneratesSection: options => {
    const { baseOutputDir } = options;
    const { baseTypesPath, encapsulateModuleTypes } = options.presetConfig;

    const cwd = resolve(options.presetConfig.cwd || process.cwd());
    const importTypesNamespace = options.presetConfig.importTypesNamespace || 'Types';

    if (!baseTypesPath) {
      throw new Error(
        `Preset "graphql-modules" requires you to specify "baseTypesPath" configuration and point it to your base types file (generated by "typescript" plugin)!`
      );
    }

    if (!options.schemaAst || !options.schemaAst.extensions.sources) {
      throw new Error(`Preset "graphql-modules" requires to use GraphQL SDL`);
    }

    const sourcesByModuleMap = groupSourcesByModule(options.schemaAst!.extensions.sources, baseOutputDir);
    const modules = Object.keys(sourcesByModuleMap);

    // One file with an output from all plugins
    const baseOutput: Types.GenerateOptions = {
      filename: resolve(cwd, baseOutputDir, baseTypesPath),
      schema: options.schema,
      documents: options.documents,
      plugins: [
        ...options.plugins,
        // {
        //   'modules-exported-scalars': {},
        // },
      ],
      pluginMap: {
        ...options.pluginMap,
        // 'modules-exported-scalars': {
        //   plugin: schema => {
        //     const typeMap = schema.getTypeMap();

        //     return Object.keys(typeMap)
        //       .map(t => {
        //         if (t && typeMap[t] && isScalarType(typeMap[t]) && !isGraphQLPrimitive(t)) {
        //           return `export type ${t} = Scalars["${t}"];`;
        //         }

        //         return null;
        //       })
        //       .filter(Boolean)
        //       .join('\n');
        //   },
        // },
      },
      config: options.config,
      schemaAst: options.schemaAst!,
    };

    const baseTypesFilename = baseTypesPath.replace(/\.(js|ts|d.ts)$/, '');
    const baseTypesDir = stripFilename(baseOutput.filename);

    // One file per each module
    const outputs: Types.GenerateOptions[] = modules.map(moduleName => {
      const filename = resolve(cwd, baseOutputDir, moduleName, options.presetConfig.filename);
      const dirpath = stripFilename(filename);
      const relativePath = relative(dirpath, baseTypesDir);
      const importPath = normalize(join(relativePath, baseTypesFilename)); // ../../types
      const sources = sourcesByModuleMap[moduleName];

      const moduleDocument = concatAST(
        sources.map(source =>
          parse(source.body, {
            noLocation: true,
          })
        )
      );

      return {
        filename,
        schema: options.schema,
        documents: [],
        plugins: [
          ...options.plugins.filter(p => typeof p === 'object' && !!p.add),
          {
            'graphql-modules-plugin': {},
          },
        ],
        pluginMap: {
          ...options.pluginMap,
          'graphql-modules-plugin': {
            plugin: schema =>
              buildModule(moduleName, moduleDocument, {
                importNamespace: importTypesNamespace,
                importPath,
                encapsulate: encapsulateModuleTypes || 'none',
                schema,
                rootTypes: [
                  schema.getQueryType()?.name,
                  schema.getMutationType()?.name,
                  schema.getSubscriptionType()?.name,
                ].filter(Boolean),
              }),
          },
        },
        config: options.config,
        schemaAst: options.schemaAst,
      };
    });

    return [baseOutput].concat(outputs);
  },
};

export default preset;
