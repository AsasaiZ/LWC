/*
 * Copyright (c) 2018, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: MIT
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/MIT
 */
const fs = require('fs');
const path = require('path');
const pluginUtils = require('@rollup/pluginutils');
const compiler = require('@lwc/compiler');
const { resolveModule } = require('@lwc/module-resolver');

const { getModuleQualifiedName } = require('./utils');
const { DEFAULT_OPTIONS, DEFAULT_MODE, DEFAULT_MODULES } = require('./constants');

const IMPLICIT_DEFAULT_HTML_PATH = '@lwc/resources/empty_html.js';
const EMPTY_IMPLICIT_HTML_CONTENT = 'export default void 0';

function isImplicitHTMLImport(importee, importer) {
    return (
        path.extname(importer) === '.js' &&
        path.extname(importee) === '.html' &&
        path.dirname(importer) === path.dirname(importee) &&
        path.basename(importer, '.js') === path.basename(importee, '.html')
    );
}

function isMixingJsAndTs(importerExt, importeeExt) {
    return (
        (importerExt === '.js' && importeeExt === '.ts') ||
        (importerExt === '.ts' && importeeExt === '.js')
    );
}

function parseQueryParamsForScopeKey(id) {
    const [filename, query] = id.split('?', 2);
    const params = query && new URLSearchParams(query);
    const scopeKey = params && params.get('scopeKey');
    return {
        filename,
        query,
        scopeKey,
    };
}

module.exports = function rollupLwcCompiler(pluginOptions = {}) {
    const { include, exclude } = pluginOptions;
    const filter = pluginUtils.createFilter(include, exclude);
    const mergedPluginOptions = Object.assign({}, DEFAULT_OPTIONS, pluginOptions);

    let customResolvedModules;
    let customRootDir;

    return {
        name: 'rollup-plugin-lwc-compiler',
        options({ input }) {
            const { modules: userModules = [], rootDir } = mergedPluginOptions;
            customRootDir = rootDir ? path.resolve(rootDir) : path.dirname(path.resolve(input));
            customResolvedModules = [...userModules, ...DEFAULT_MODULES, { dir: customRootDir }];
        },

        async resolveId(importee, importer) {
            const { filename, query, scopeKey } = parseQueryParamsForScopeKey(importee);
            if (scopeKey) {
                // handle light DOM scoped CSS
                // Resolve without the query param. Use skipSelf to avoid infinite loops
                const resolved = await this.resolve(filename, importer, { skipSelf: true });
                if (resolved) {
                    resolved.id += `?${query}`;
                    return resolved;
                } else {
                    return null;
                }
            }

            // Normalize relative import to absolute import
            if (importee.startsWith('.') && importer) {
                const importerExt = path.extname(importer);
                const ext = path.extname(importee) || importerExt;

                // we don't currently support mixing .js and .ts
                if (isMixingJsAndTs(importerExt, ext)) {
                    throw new Error(
                        `Importing a ${ext} file into a ${importerExt} is not supported`
                    );
                }

                const normalizedPath = path.resolve(path.dirname(importer), importee);
                const absPath = pluginUtils.addExtension(normalizedPath, ext);

                if (isImplicitHTMLImport(normalizedPath, importer) && !fs.existsSync(absPath)) {
                    return IMPLICIT_DEFAULT_HTML_PATH;
                }

                return pluginUtils.addExtension(normalizedPath, ext);
            } else if (importer) {
                try {
                    return resolveModule(importee, importer, {
                        modules: customResolvedModules,
                        rootDir: customRootDir,
                    }).entry;
                } catch (err) {
                    if (err.code !== 'NO_LWC_MODULE_FOUND') {
                        throw err;
                    }
                }
            }
        },

        load(id) {
            const { filename, scopeKey } = parseQueryParamsForScopeKey(id);
            if (scopeKey) {
                // override the default behavior, ignore the query param
                return fs.readFileSync(filename, 'utf-8');
            }
            if (id === IMPLICIT_DEFAULT_HTML_PATH) {
                return EMPTY_IMPLICIT_HTML_CONTENT;
            }

            const exists = fs.existsSync(id);
            const isCSS = path.extname(id) === '.css';

            if (!exists && isCSS) {
                return '';
            }
        },

        async transform(src, id) {
            // Filter user-land config and lwc import
            if (!filter(id)) {
                return;
            }
            // If we don't find the moduleId, just resolve the module name/namespace
            const moduleEntry = getModuleQualifiedName(id, mergedPluginOptions);

            const { filename, scopeKey } = parseQueryParamsForScopeKey(id);
            if (scopeKey) {
                id = filename; // remove query param
            }
            const { code, map } = await compiler.transform(src, id, {
                mode: DEFAULT_MODE, // Use always default mode since any other (prod or compat) will be resolved later
                name: moduleEntry.moduleName,
                namespace: moduleEntry.moduleNamespace,
                moduleSpecifier: moduleEntry.moduleSpecifier,
                outputConfig: { sourcemap: mergedPluginOptions.sourcemap },
                stylesheetConfig: mergedPluginOptions.stylesheetConfig,
                experimentalDynamicComponent: mergedPluginOptions.experimentalDynamicComponent,
                preserveHtmlComments: mergedPluginOptions.preserveHtmlComments,
                cssScopeKey: scopeKey,
            });

            return { code, map };
        },
    };
};
